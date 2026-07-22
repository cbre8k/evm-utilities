// ============================================================
// services/rpcService.ts — JSON-RPC calls + full trace parsing
// ============================================================

import type {
  CallTracerFrame, ParityTrace, PrestateResult, RpcBlock,
  RpcStructLog, RpcTransaction, RpcTransactionReceipt, StructLogResult,
} from '@shared/types/rpc';
import type {
  TxOverview, TraceNode, TokenTransfer,
  EventLog, NativeTransfer, ERC20Transfer, ERC721Transfer, ERC1155Transfer,
  AddressStateDiff, StorageChange, GasNode,
} from '../types';
import { createLogger } from '@shared/utils/logger';
import { errMessage } from '@shared/utils/errors';

const log = createLogger('rpcService');

// ── EVM event topics ─────────────────────────────────────────
const SIG = {
  TRANSFER:       '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
  TRANSFER_SINGLE:'0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62',
  TRANSFER_BATCH: '0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb',
  APPROVAL:       '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925',
} as const;

/** Well-known event signatures → human-readable names */
const EVENT_NAME_BY_SIG: Record<string, string> = {
  [SIG.TRANSFER]:       'Transfer',
  [SIG.TRANSFER_SINGLE]:'TransferSingle',
  [SIG.TRANSFER_BATCH]: 'TransferBatch',
  [SIG.APPROVAL]:       'Approval',
  '0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c': 'Deposit',
  '0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65': 'Withdrawal',
  '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822': 'Swap',
  '0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1': 'Sync',
  '0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9': 'PairCreated',
  '0x3d0ce9bfc3ed7d6862dbb28b2dea94561fe714a1b4d019aa8af39730d1ad7c3d': 'SafeReceived',
  '0x442e715f626346e8c54381002da614f62bee8d27386535b2521ec8540898556e': 'SafeMultiSigTransaction',
};

// ── Generic JSON-RPC ─────────────────────────────────────────

const RPC_TIMEOUT_MS = 30_000;

export async function rpcCall<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status} for ${method}`);

  // Read as text first so we can include the raw body in error messages
  // when the RPC node returns an empty or truncated JSON response.
  const text = await res.text();
  if (!text || !text.trim()) {
    throw new Error(`RPC empty response for ${method}`);
  }

  let data: { result?: T; error?: { message: string; code?: number } };
  try {
    data = JSON.parse(text);
  } catch (parseErr) {
    // Include a snippet of the body so it is easier to diagnose truncation.
    const snippet = text.slice(0, 200);
    throw new Error(`RPC invalid JSON for ${method}: ${errMessage(parseErr)} — body: ${snippet}`);
  }

  if (data.error) throw new Error(`RPC [${method}]: ${data.error.message}`);
  if (data.result === undefined) throw new Error(`RPC no result for ${method}`);
  return data.result as T;
}

function decodeAbiString(hex: string): string | null {
  if (!hex || hex === '0x') return null;
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;

  try {
    if (clean.length === 64) {
      const bytes = Buffer.from(clean, 'hex');
      const value = bytes.toString('utf8').replace(/\0+$/g, '').trim();
      return value || null;
    }

    if (clean.length >= 192) {
      const offset = Number(BigInt(`0x${clean.slice(0, 64)}`));
      const lengthPos = offset * 2;
      const length = Number(BigInt(`0x${clean.slice(lengthPos, lengthPos + 64)}`));
      const valueHex = clean.slice(lengthPos + 64, lengthPos + 64 + length * 2);
      const value = Buffer.from(valueHex, 'hex').toString('utf8').replace(/\0+$/g, '').trim();
      return value || null;
    }
  } catch {
    return null;
  }

  return null;
}

// ── Chain / tx data ──────────────────────────────────────────

export async function getChainId(rpcUrl: string): Promise<number> {
  const hex = await rpcCall<string>(rpcUrl, 'eth_chainId', []);
  return parseInt(hex, 16);
}

export async function getTokenSymbol(rpcUrl: string, address: string): Promise<string | null> {
  try {
    const result = await rpcCall<string>(rpcUrl, 'eth_call', [
      { to: address.toLowerCase(), data: '0x95d89b41' },
      'latest',
    ]);
    const symbol = decodeAbiString(result);
    if (!symbol) return null;
    if (!/^[\x20-\x7E]{1,32}$/.test(symbol)) return null;
    return symbol;
  } catch {
    return null;
  }
}

export async function buildTokenLabelMap(
  rpcUrl: string,
  tokenAddresses: string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(tokenAddresses.map(address => address.toLowerCase()).filter(Boolean))];
  const entries = await Promise.all(
    unique.map(async (address) => [address, await getTokenSymbol(rpcUrl, address)] as const)
  );

  return Object.fromEntries(entries.filter(([, symbol]) => !!symbol)) as Record<string, string>;
}

export async function getTokenDecimals(rpcUrl: string, address: string): Promise<number | null> {
  try {
    const result = await rpcCall<string>(rpcUrl, 'eth_call', [
      { to: address.toLowerCase(), data: '0x313ce567' }, // decimals()
      'latest',
    ]);
    if (!result || result === '0x') return null;
    const val = parseInt(result, 16);
    if (isNaN(val) || val < 0 || val > 77) return null;
    return val;
  } catch {
    return null;
  }
}

/**
 * Populate `decimals` (on-chain fetch) and `symbol` (from pre-built tokenLabels)
 * on each ERC-20 transfer. Unique token addresses are fetched in parallel.
 */
export async function enrichErc20Transfers(
  rpcUrl: string,
  transfers: ERC20Transfer[],
  tokenLabels: Record<string, string> = {},
): Promise<ERC20Transfer[]> {
  const unique = [...new Set(transfers.map(t => t.tokenAddress.toLowerCase()))];
  const decimalsEntries = await Promise.all(
    unique.map(async (address) => [address, await getTokenDecimals(rpcUrl, address)] as const)
  );
  const decimalsMap = Object.fromEntries(
    decimalsEntries.filter(([, d]) => d !== null)
  ) as Record<string, number>;

  return transfers.map(t => {
    const key = t.tokenAddress.toLowerCase();
    return {
      ...t,
      ...(decimalsMap[key] !== undefined ? { decimals: decimalsMap[key] } : {}),
      ...(tokenLabels[key] ? { symbol: tokenLabels[key] } : {}),
    };
  });
}

export async function getTransaction(rpcUrl: string, txHash: string): Promise<RpcTransaction | null> {
  return rpcCall<RpcTransaction | null>(rpcUrl, 'eth_getTransactionByHash', [txHash]);
}

export async function getTransactionReceipt(
  rpcUrl: string,
  txHash: string,
): Promise<RpcTransactionReceipt | null> {
  return rpcCall<RpcTransactionReceipt | null>(rpcUrl, 'eth_getTransactionReceipt', [txHash]);
}

export async function getBlockByNumber(rpcUrl: string, blockNumber: string): Promise<RpcBlock | null> {
  return rpcCall<RpcBlock | null>(rpcUrl, 'eth_getBlockByNumber', [blockNumber, false]);
}

export async function buildTxOverview(rpcUrl: string, txHash: string, fallbackRpcUrls: string[] = []): Promise<TxOverview> {
  // Try primary + each fallback in order until we get a tx response
  const urlsToTry = [rpcUrl, ...fallbackRpcUrls.filter(u => u && u !== rpcUrl)];
  let tx: RpcTransaction | null = null;
  let effectiveRpcUrl = rpcUrl;

  for (const url of urlsToTry) {
    try {
      tx = await getTransaction(url, txHash);
      if (tx) { effectiveRpcUrl = url; break; }
    } catch { /* try next */ }
  }

  if (!tx) throw new Error(`Transaction not found: ${txHash}`);
  if (effectiveRpcUrl !== rpcUrl) {
    log.info(`buildTxOverview: fell back to ${effectiveRpcUrl} for ${txHash}`);
  }

  // Start tx + receipt in parallel; kick off block fetch as soon as tx resolves
  // so block and receipt are fetched concurrently.
  const blockPromise = tx.blockNumber
    ? getBlockByNumber(effectiveRpcUrl, tx.blockNumber)
    : Promise.resolve(null);

  const [receipt, block] = await Promise.all([
    getTransactionReceipt(effectiveRpcUrl, txHash),
    blockPromise,
  ]);
  if (!receipt) throw new Error(`Receipt not found: ${txHash}`);
  return {
    hash: tx.hash ?? "",
    from: tx.from?.toLowerCase() ?? '',
    to: tx.to?.toLowerCase() ?? null,
    value: tx.value ?? '0x0',
    gasUsed: receipt.gasUsed ?? '0x0',
    gasLimit: tx.gas ?? '0x0',
    gasPrice: tx.gasPrice ?? tx.maxFeePerGas ?? '0x0',
    blockNumber: parseInt(tx.blockNumber ?? "0x0", 16),
    blockHash: tx.blockHash ?? "",
    timestamp: block?.timestamp ? parseInt(block.timestamp, 16) : undefined,
    txType: tx.type ?? '0x0',
    txIndex: parseInt(tx.transactionIndex ?? "0x0", 16),
    nonce: parseInt(tx.nonce ?? "0x0", 16),
    status: receipt.status === '0x1' ? 'success' : 'failed',
    input: tx.input ?? "0x",
  };
}

// ── Parity trace format → callTracer-compatible tree ─────────
//
// trace_transaction / trace_replayTransaction return a flat array of objects
// where each entry has a `traceAddress: number[]` indicating its position in
// the call tree (e.g. [] = root, [0] = first child of root, [0,1] = second
// child of the first child, etc.)
//
// This function re-assembles that flat list into the nested callTracer format
// that normalizeCallTree already understands.

/** Normalise a Parity gas value which may be decimal or hex string → hex string */
function parityGasToHex(v: string | number | null | undefined): string {
  if (v == null) return '0x0';
  const s = String(v);
  if (s.startsWith('0x') || s.startsWith('0X')) return s;
  // decimal integer → hex
  try { return '0x' + BigInt(s).toString(16); } catch { return '0x0'; }
}

function parityTracesToCallTracer(traces: ParityTrace[]): CallTracerFrame | null {
  if (!traces?.length) return null;

  // Sort by traceAddress depth then index so parents are processed before children
  const sorted = [...traces].sort((a, b) => {
    const aA: number[] = a.traceAddress ?? [];
    const bA: number[] = b.traceAddress ?? [];
    for (let i = 0; i < Math.min(aA.length, bA.length); i++) {
      if (aA[i] !== bA[i]) return aA[i] - bA[i];
    }
    return aA.length - bA.length;
  });

  const nodeMap = new Map<string, CallTracerFrame>();

  for (const trace of sorted) {
    // 'reward' entries (block reward) can appear in trace_block responses but
    // not in single-tx traces. Skip them defensively to avoid a broken tree.
    if (trace.type === 'reward') continue;

    const addr: number[] = trace.traceAddress ?? [];
    const key = addr.join(',');
    const action = trace.action ?? {};
    const result = trace.result ?? {};

    const isCreate   = trace.type === 'create';
    const isSuicide  = trace.type === 'suicide';

    // Parity 'suicide' == EVM SELFDESTRUCT.  Its action fields differ:
    //   action.address      = the contract being destroyed (the "from")
    //   action.refundAddress = the ETH recipient (the "to")
    //   action.balance      = balance transferred
    // There is no action.from / action.to / action.callType / action.input.
    const node: CallTracerFrame = {
      type: isSuicide
        ? 'SELFDESTRUCT'
        : isCreate
          ? (action.creationMethod === 'create2' ? 'CREATE2' : 'CREATE')
          : (action.callType ?? 'call').toUpperCase(),

      from: isSuicide
        ? (action.address ?? '').toLowerCase()
        : (action.from ?? '').toLowerCase(),

      to: isSuicide
        ? (action.refundAddress ? action.refundAddress.toLowerCase() : null)
        : isCreate
          ? (result.address ? result.address.toLowerCase() : null)
          : (action.to ? action.to.toLowerCase() : null),

      input:   isCreate ? (action.init ?? '0x') : (isSuicide ? '0x' : (action.input ?? '0x')),
      output:  result.output ?? '0x',

      // suicide uses action.balance; regular calls use action.value
      value:   isSuicide
        ? parityGasToHex(action.balance)
        : (action.value ?? '0x0'),

      // Gas values may arrive as decimal on some node implementations
      gas:     parityGasToHex(action.gas),
      gasUsed: parityGasToHex(result.gasUsed),

      error:   trace.error ?? undefined,
      calls:   [],
    };

    nodeMap.set(key, node);

    if (addr.length > 0) {
      const parentKey = addr.slice(0, -1).join(',');
      const parent = nodeMap.get(parentKey);
      if (parent) parent.calls?.push(node);
      // If parent not found (data gap), the node is silently dropped rather
      // than attached to the wrong place in the tree.
    }
  }

  return nodeMap.get('') ?? null;
}

// ── debug_traceTransaction with Parity/replay fallbacks ──────────────
//
// Fallback order:
//   1. debug_traceTransaction callTracer+withLog  (Geth ≥1.10, most managed nodes)
//   2. debug_traceTransaction callTracer           (Geth without withLog)
//   3. trace_replayTransaction callTracer+withLog  (BSC, Erigon — same output format)
//   4. trace_replayTransaction callTracer           (BSC, Erigon — without withLog)
//   5. trace_replayTransaction ['trace']            (Parity flat format fallback)
//   6. trace_transaction                            (Erigon, Nethermind)
//   7. null — caller handles graceful degradation

export async function debugTraceTransaction(
  rpcUrl: string,
  txHash: string,
): Promise<CallTracerFrame | null> {
  // 1. Standard Geth callTracer with inline logs
  try {
    return await rpcCall<CallTracerFrame>(rpcUrl, 'debug_traceTransaction', [
      txHash,
      { tracer: 'callTracer', tracerConfig: { withLog: true } },
    ]);
  } catch { /* fall through */ }

  // 2. callTracer without withLog
  try {
    return await rpcCall<CallTracerFrame>(rpcUrl, 'debug_traceTransaction', [
      txHash,
      { tracer: 'callTracer' },
    ]);
  } catch (err) {
    log.warn(`debug_traceTransaction failed for ${txHash}: ${errMessage(err)}`);
  }

  // 3. trace_replayTransaction with callTracer+withLog (BSC, Erigon — same response shape)
  try {
    return await rpcCall<CallTracerFrame>(rpcUrl, 'trace_replayTransaction', [
      txHash,
      { tracer: 'callTracer', tracerConfig: { withLog: true } },
    ]);
  } catch { /* fall through */ }

  // 4. trace_replayTransaction with callTracer (without withLog)
  try {
    const result = await rpcCall<CallTracerFrame>(rpcUrl, 'trace_replayTransaction', [
      txHash,
      { tracer: 'callTracer' },
    ]);
    if (result?.type) {
      log.info(`using trace_replayTransaction+callTracer for ${txHash}`);
      return result;
    }
  } catch (err) {
    log.warn(`trace_replayTransaction+callTracer failed for ${txHash}: ${errMessage(err)}`);
  }

  // 5. trace_replayTransaction Parity ['trace'] format
  try {
    const result = await rpcCall<{ trace?: ParityTrace[] }>(rpcUrl, 'trace_replayTransaction', [txHash, ['trace']]);
    if (result?.trace?.length) {
      log.info(`using trace_replayTransaction+parityTrace for ${txHash}`);
      return parityTracesToCallTracer(result.trace);
    }
  } catch (err) {
    log.warn(`trace_replayTransaction failed for ${txHash}: ${errMessage(err)}`);
  }

  // 6. trace_transaction (Erigon, Nethermind)
  try {
    const traces = await rpcCall<ParityTrace[]>(rpcUrl, 'trace_transaction', [txHash]);
    if (traces?.length) {
      log.info(`using trace_transaction for ${txHash}`);
      return parityTracesToCallTracer(traces);
    }
  } catch (err) {
    log.warn(`trace_transaction failed for ${txHash}: ${errMessage(err)}`);
  }

  return null;
}

// ── debug_traceTransaction (prestateTracer diffMode) ─────────

export async function getPrestateTrace(
  rpcUrl: string,
  txHash: string,
): Promise<PrestateResult | null> {
  try {
    return await rpcCall<PrestateResult>(rpcUrl, 'debug_traceTransaction', [
      txHash,
      { tracer: 'prestateTracer', tracerConfig: { diffMode: true } },
    ]);
  } catch {
    // diffMode not supported — fall back to regular prestate
    try {
      // Non-diff mode returns the account map directly as the "pre" state.
      const pre = await rpcCall<PrestateResult['pre']>(rpcUrl, 'debug_traceTransaction', [
        txHash,
        { tracer: 'prestateTracer' },
      ]);
      return { pre, post: {} };
    } catch {
      return null;
    }
  }
}



/**
 * Minimal opcodes needed for call-trace display:
 *   - Call boundaries: track context stack and DELEGATECALL storage addresses
 *   - Jumps + JUMPDEST: detect Solidity internal function calls via source-map annotation
 *   - Log opcodes: preserve inline event ordering within the call tree
 * SLOAD/SSTORE are intentionally excluded — storage diffs come from prestateTracer.
 */
const MINIMAL_TRACE_OPS = new Set([
  'CALL', 'STATICCALL', 'DELEGATECALL', 'CALLCODE', 'CREATE', 'CREATE2',
  'JUMP', 'JUMPI', 'JUMPDEST',
  'LOG0', 'LOG1', 'LOG2', 'LOG3', 'LOG4',
]);

function parseMinimalTrace(entries: unknown[]): import('../types').FilteredStructLog[] {
  const out: import('../types').FilteredStructLog[] = [];
  for (const raw of entries as RpcStructLog[]) {
    if (!raw.op) continue;
    const entry: import('../types').FilteredStructLog = {
      pc:      raw.pc      ?? 0,
      op:      raw.op,
      gas:     raw.gas     ?? 0,
      gasCost: raw.gasCost ?? 0,
      depth:   raw.depth   ?? 1,
    };
    if (raw.jumpTo) entry.jumpTo = String(raw.jumpTo).startsWith('0x') ? raw.jumpTo : `0x${raw.jumpTo}`;
    if (raw.error)  entry.error  = raw.error;
    // Preserve the small stack window captured for JUMP/JUMPI param decoding
    if (Array.isArray(raw.jumpStack) && raw.jumpStack.length > 0) {
      entry.jumpStack = raw.jumpStack.map((v: unknown) => {
        const s = String(v);
        return s.startsWith('0x') ? s : `0x${s}`;
      });
    }
    out.push(entry);
  }
  return out;
}

/**
 * Lightweight structlog trace capturing only call boundaries, internal jumps,
 * and log events — no EVM stack or memory snapshots.
 *
 * This replaces the previous heavy approach that captured 128 stack entries
 * and 128 memory words per JUMP opcode. The result is dramatically smaller
 * and faster while still supporting:
 *   - JumpFrame creation (internal Solidity functions via JUMP-in/out)
 *   - Sourcify source-map annotation (function names per PC)
 *   - Inline event ordering (LOG* positions preserve execution order)
 *   - DELEGATECALL context tracking (call variants maintain context stack)
 *
 * SLOAD/SSTORE inline steps are intentionally removed; storage changes
 * remain visible in the State Diffs tab via prestateTracer.
 */
export async function getFilteredStructLog(
  rpcUrl: string,
  txHash: string,
): Promise<import('../types').FilteredStructLog[]> {
  // Minimal custom JS tracer — captures only the opcode name, PC, depth,
  // and (for JUMP/JUMPI) the jump destination plus a small stack window
  // (max 12 words) for internal function parameter decoding.
  // 12 words covers: dest (1) + condition for JUMPI (1) + up to ~10 params.
  const minimalTracer = `{
    out: [],
    fault: function(log, db) {},
    step: function(log, db) {
      var op = log.op.toString();
      if (op !== 'CALL' && op !== 'STATICCALL' && op !== 'DELEGATECALL' &&
          op !== 'CALLCODE' && op !== 'CREATE' && op !== 'CREATE2' &&
          op !== 'JUMP' && op !== 'JUMPI' && op !== 'JUMPDEST' &&
          op !== 'LOG0' && op !== 'LOG1' && op !== 'LOG2' && op !== 'LOG3' && op !== 'LOG4') return;
      var e = {
        pc:      log.getPC(),
        op:      op,
        gas:     log.getGas(),
        gasCost: log.getCost(),
        depth:   log.getDepth()
      };
      if (op === 'JUMP' || op === 'JUMPI') {
        var n = log.stack.length();
        if (n > 0) {
          e.jumpTo = '0x' + log.stack.peek(0).toString(16);
          var lim = n < 12 ? n : 12;
          e.jumpStack = [];
          for (var s = 0; s < lim; s++) {
            e.jumpStack.push('0x' + log.stack.peek(s).toString(16));
          }
        }
      }
      this.out.push(e);
    },
    result: function(ctx, db) { return this.out; }
  }`;

  try {
    const result = await rpcCall<RpcStructLog[] | StructLogResult>(rpcUrl, 'debug_traceTransaction', [
      txHash,
      { tracer: minimalTracer, timeout: '60s' },
    ]);
    const logs = Array.isArray(result) ? result : (result?.structLogs ?? []);
    return parseMinimalTrace(logs);
  } catch {
    // Some RPCs do not support JS tracers — fall back to standard structLogs,
    // filtering to the minimal op set and extracting jumpTo + jumpStack from the stack.
    try {
      const fallback = await rpcCall<StructLogResult>(rpcUrl, 'debug_traceTransaction', [
        txHash,
        { disableStack: false, disableMemory: true, disableStorage: true },
      ]);
      const filtered = (fallback?.structLogs ?? []).filter((e) => MINIMAL_TRACE_OPS.has(e.op ?? ""));
      // Standard structlog stack is bottom-to-top: reverse last 12 to get peek order
      for (const e of filtered) {
        if ((e.op === 'JUMP' || e.op === 'JUMPI') && Array.isArray(e.stack) && e.stack.length > 0) {
          const top = String(e.stack[e.stack.length - 1]);
          e.jumpTo = top.startsWith('0x') ? top : `0x${top}`;
          e.jumpStack = e.stack.slice(-12).reverse().map((v: unknown) => {
            const s = String(v);
            return s.startsWith('0x') ? s : `0x${s}`;
          });
        }
      }
      return parseMinimalTrace(filtered);
    } catch {
      // Structlog not supported by this node — return empty (feature degrades gracefully)
      return [];
    }
  }
}



let nodeCounter = 0;

export function normalizeCallTree(
  raw: CallTracerFrame | null | undefined,
  parentId?: string,
  depth = 0,
): TraceNode {
  // raw can be null when debugTraceTransaction failed — return a minimal stub
  if (!raw) {
    const id = `node-${nodeCounter++}`;
    return {
      id,
      parentId,
      depth,
      type: 'CALL',
      from: '',
      to: null,
      input: '0x',
      output: '0x',
      value: '0x0',
      gas: '0x0',
      gasUsed: '0x0',
      children: [],
    };
  }

  const id = `node-${nodeCounter++}`;
  const children = (raw.calls ?? []).map((c) => normalizeCallTree(c, id, depth + 1));

  // Inline logs from callTracer withLog:true
  const logs = (raw.logs ?? []).map((l) => ({
    address: (l.address ?? '').toLowerCase(),
    topics: l.topics ?? [],
    data: l.data ?? '0x',
    name: l.topics?.[0] ? (EVENT_NAME_BY_SIG[l.topics[0].toLowerCase()] ?? undefined) : undefined,
  }));

  return {
    id,
    parentId,
    depth,
    type: (raw.type ?? 'CALL').toUpperCase() as TraceNode['type'],
    from: (raw.from ?? '').toLowerCase(),
    to: raw.to ? raw.to.toLowerCase() : null,
    input: raw.input ?? '0x',
    output: raw.output ?? '0x',
    value: raw.value ?? '0x0',
    gas: raw.gas ?? '0x0',
    gasUsed: raw.gasUsed ?? '0x0',
    error: raw.error,
    revertReason: raw.revertReason,
    logs: logs.length > 0 ? logs : undefined,
    children,
  };
}

// ── Full log parsing (all types) ─────────────────────────────
export function parseAllLogs(receipt: RpcTransactionReceipt | null): {
  allLogs: EventLog[];
  erc20Transfers: ERC20Transfer[];
  erc721Transfers: ERC721Transfer[];
  erc1155Transfers: ERC1155Transfer[];
} {
  const allLogs: EventLog[] = [];
  const erc20Transfers: ERC20Transfer[] = [];
  const erc721Transfers: ERC721Transfer[] = [];
  const erc1155Transfers: ERC1155Transfer[] = [];

  if (!receipt || !Array.isArray(receipt.logs)) return { allLogs, erc20Transfers, erc721Transfers, erc1155Transfers };

  for (const log of receipt.logs) {
    const topics = log.topics ?? [];
    const data = log.data ?? '0x';
    const topic0 = topics[0]?.toLowerCase();
    const logIndex = parseInt(log.logIndex ?? '0x0', 16);
    const address = log.address?.toLowerCase() ?? '';

    // Base log entry
    const eventLog: EventLog = {
      address,
      topics,
      data,
      logIndex,
    };

    if (topic0 === SIG.TRANSFER) {
      const topicCount = topics.length;
      if (topicCount === 3) {
        // ERC-20 Transfer(address from, address to, uint256 value)
        const from = '0x' + topics[1].slice(26);
        const to   = '0x' + topics[2].slice(26);
        const amount = data !== '0x' ? BigInt(data).toString() : '0';
        erc20Transfers.push({ tokenAddress: address, from: from.toLowerCase(), to: to.toLowerCase(), amount, logIndex });
        eventLog.eventName = 'Transfer';
        eventLog.decoded = { from: from.toLowerCase(), to: to.toLowerCase(), value: amount };
      } else if (topicCount === 4) {
        // ERC-721 Transfer(address from, address to, uint256 tokenId)
        const from    = '0x' + topics[1].slice(26);
        const to      = '0x' + topics[2].slice(26);
        const tokenId = BigInt(topics[3]).toString();
        erc721Transfers.push({ tokenAddress: address, from: from.toLowerCase(), to: to.toLowerCase(), tokenId, logIndex });
        eventLog.eventName = 'Transfer (ERC-721)';
        eventLog.decoded = { from: from.toLowerCase(), to: to.toLowerCase(), tokenId };
      }
    } else if (topic0 === SIG.TRANSFER_SINGLE) {
      // ERC-1155 TransferSingle(address operator, address from, address to, uint256 id, uint256 value)
      const operator = '0x' + topics[1].slice(26);
      const from     = '0x' + topics[2].slice(26);
      const to       = '0x' + topics[3].slice(26);
      const [id, value] = parseUint256Pair(data);
      erc1155Transfers.push({
        tokenAddress: address, operator: operator.toLowerCase(),
        from: from.toLowerCase(), to: to.toLowerCase(),
        id: id.toString(), value: value.toString(), logIndex, isBatch: false,
      });
      eventLog.eventName = 'TransferSingle (ERC-1155)';
    } else if (topic0 === SIG.TRANSFER_BATCH) {
      // ERC-1155 TransferBatch — data has dynamic arrays, skip deep decode
      const operator = '0x' + topics[1].slice(26);
      const from     = '0x' + topics[2].slice(26);
      const to       = '0x' + topics[3].slice(26);
      erc1155Transfers.push({
        tokenAddress: address, operator: operator.toLowerCase(),
        from: from.toLowerCase(), to: to.toLowerCase(),
        id: '(batch)', value: '(batch)', logIndex, isBatch: true,
      });
      eventLog.eventName = 'TransferBatch (ERC-1155)';
    } else if (topic0 === SIG.APPROVAL) {
      eventLog.eventName = 'Approval';
    }

    allLogs.push(eventLog);
  }

  return { allLogs, erc20Transfers, erc721Transfers, erc1155Transfers };
}

function parseUint256Pair(data: string): [bigint, bigint] {
  try {
    const hex = data.startsWith('0x') ? data.slice(2) : data;
    const a = BigInt('0x' + hex.slice(0, 64));
    const b = BigInt('0x' + hex.slice(64, 128));
    return [a, b];
  } catch {
    return [0n, 0n];
  }
}

export function extractNativeTransfers(node: TraceNode, out: NativeTransfer[] = []): NativeTransfer[] {
  const val = node.value && node.value !== '0x0' && node.value !== '0x'
    ? BigInt(node.value)
    : 0n;
  if (val > 0n) {
    out.push({
      from: node.from,
      to: node.to || null,
      value: node.value,
      callType: node.type,
      depth: node.depth,
      callId: node.id,
    });
  }
  for (const child of node.children) extractNativeTransfers(child, out);
  return out;
}

// ── State diffs from prestateTracer ──────────────────────────

export function buildStateDiffs(prestateResult: PrestateResult | null | undefined): AddressStateDiff[] {
  if (!prestateResult) return [];
  const { pre = {}, post = {} } = prestateResult;
  const addresses = new Set([...Object.keys(pre), ...Object.keys(post)]);
  const diffs: AddressStateDiff[] = [];

  for (const addr of addresses) {
    const p = pre[addr] ?? {};
    const q = post[addr] ?? {};
    const storageChanges: StorageChange[] = [];

    const allSlots = new Set([
      ...Object.keys(p.storage ?? {}),
      ...Object.keys(q.storage ?? {}),
    ]);

    for (const slot of allSlots) {
      const before = p.storage?.[slot] ?? '0x0';
      const after  = q.storage?.[slot] ?? '0x0';
      if (before !== after) {
        storageChanges.push({ slot, before, after });
      }
    }

    const balBefore = p.balance;
    const balAfter  = q.balance;
    const nonceBefore = p.nonce;
    const nonceAfter  = q.nonce;
    const codeChanged = (p.code ?? '0x') !== (q.code ?? '0x') && !!(q.code && q.code !== '0x');

    if (
      balBefore !== balAfter ||
      nonceBefore !== nonceAfter ||
      codeChanged ||
      storageChanges.length > 0
    ) {
      diffs.push({
        address: addr.toLowerCase(),
        balanceBefore: balBefore,
        balanceAfter:  balAfter,
        nonceBefore,
        nonceAfter,
        codeChanged,
        storageChanges,
      });
    }
  }

  return diffs;
}

// ── Gas profiler tree ─────────────────────────────────────────

export function buildGasTree(node: TraceNode, totalGas: number): GasNode {
  const gasUsed = parseHexOrDecimal(node.gasUsed);
  const gasLimit = parseHexOrDecimal(node.gas ?? node.gasUsed);
  const childrenNodes = node.children.map(c => buildGasTree(c, totalGas));
  const childrenGas = childrenNodes.reduce((s, c) => s + c.gasUsed, 0);
  const op = node.caller_op ?? node.type;
  const method = node.function_name ?? node.decodedFunction;
  const label = method && method !== op ? `${op} ${method}` : op;

  return {
    id: node.id,
    label,
    gasUsed,
    gasLimit,
    selfGas: Math.max(0, gasUsed - childrenGas),
    depth: node.depth,
    children: childrenNodes,
  };
}

function parseHexOrDecimal(v: string | undefined): number {
  if (!v) return 0;
  try {
    return Number(v.startsWith('0x') ? BigInt(v) : BigInt(v));
  } catch {
    return 0;
  }
}
