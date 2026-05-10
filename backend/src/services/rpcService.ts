// ============================================================
// services/rpcService.ts — JSON-RPC calls + full trace parsing
// ============================================================

import type {
  TxOverview, TraceNode, TokenTransfer,
  EventLog, NativeTransfer, ERC20Transfer, ERC721Transfer, ERC1155Transfer,
  AddressStateDiff, StorageChange, GasNode,
} from '../types';
import { INTERESTING_OPS } from '../utils/opcodes';


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

async function rpcCall<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status} for ${method}`);
  const data = await res.json() as { result?: T; error?: { message: string } };
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

export async function getCode(rpcUrl: string, address: string): Promise<string> {
  return rpcCall<string>(rpcUrl, 'eth_getCode', [address.toLowerCase(), 'latest']);
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

export async function getTransaction(rpcUrl: string, txHash: string): Promise<any> {
  return rpcCall<any>(rpcUrl, 'eth_getTransactionByHash', [txHash]);
}

export async function getTransactionReceipt(rpcUrl: string, txHash: string): Promise<any> {
  return rpcCall<any>(rpcUrl, 'eth_getTransactionReceipt', [txHash]);
}

export async function getBlockByNumber(rpcUrl: string, blockNumber: string): Promise<any> {
  return rpcCall<any>(rpcUrl, 'eth_getBlockByNumber', [blockNumber, false]);
}

export async function buildTxOverview(rpcUrl: string, txHash: string): Promise<TxOverview> {
  const [tx, receipt] = await Promise.all([
    getTransaction(rpcUrl, txHash),
    getTransactionReceipt(rpcUrl, txHash),
  ]);
  if (!tx) throw new Error(`Transaction not found: ${txHash}`);
  if (!receipt) throw new Error(`Receipt not found: ${txHash}`);
  const block = tx.blockNumber ? await getBlockByNumber(rpcUrl, tx.blockNumber) : null;
  return {
    hash: tx.hash,
    from: tx.from?.toLowerCase() ?? '',
    to: tx.to?.toLowerCase() ?? null,
    value: tx.value ?? '0x0',
    gasUsed: receipt.gasUsed ?? '0x0',
    gasLimit: tx.gas ?? '0x0',
    gasPrice: tx.gasPrice ?? tx.maxFeePerGas ?? '0x0',
    blockNumber: parseInt(tx.blockNumber, 16),
    blockHash: tx.blockHash,
    timestamp: block?.timestamp ? parseInt(block.timestamp, 16) : undefined,
    txType: tx.type ?? '0x0',
    txIndex: parseInt(tx.transactionIndex, 16),
    nonce: parseInt(tx.nonce, 16),
    status: receipt.status === '0x1' ? 'success' : 'failed',
    input: tx.input,
  };
}

// ── debug_traceTransaction (callTracer + withLog) ────────────

export async function debugTraceTransaction(rpcUrl: string, txHash: string): Promise<any> {
  return rpcCall<any>(rpcUrl, 'debug_traceTransaction', [
    txHash,
    { tracer: 'callTracer', tracerConfig: { withLog: true } },
  ]);
}

// ── debug_traceTransaction (prestateTracer diffMode) ─────────

export async function getPrestateTrace(rpcUrl: string, txHash: string): Promise<any> {
  try {
    return await rpcCall<any>(rpcUrl, 'debug_traceTransaction', [
      txHash,
      { tracer: 'prestateTracer', tracerConfig: { diffMode: true } },
    ]);
  } catch {
    // diffMode not supported — fall back to regular prestate
    try {
      const pre = await rpcCall<any>(rpcUrl, 'debug_traceTransaction', [
        txHash,
        { tracer: 'prestateTracer' },
      ]);
      return { pre, post: {} };
    } catch {
      return null;
    }
  }
}


/** Normalize a storage map key: strip 0x prefix and lowercase. */
function normalizeMapKey(k: string): string {
  const s = k.startsWith('0x') ? k.slice(2) : k;
  return s.toLowerCase().replace(/^0+/, '') || '0';
}

/** Look up a value in the storage map, handling various key formats across nodes. */
function findStorageVal(
  storage: Record<string, string>,
  key: string,
  keyStripped: string,
): string | undefined {
  // Fast path: try direct matches first
  if (storage[key] !== undefined) return String(storage[key]);
  if (storage[`0x${key}`] !== undefined) return String(storage[`0x${key}`]);
  if (storage[keyStripped] !== undefined) return String(storage[keyStripped]);
  if (storage[key.padStart(64, '0')] !== undefined) return String(storage[key.padStart(64, '0')]);
  // Slow path: normalize all map keys and compare
  for (const [k, v] of Object.entries(storage)) {
    if (normalizeMapKey(k) === keyStripped) return String(v);
  }
  return undefined;
}

/** Normalize a storage value to 0x-prefixed 64-char hex. */
function normalizeStorageVal(val: string): string {
  const v = val.startsWith('0x') ? val.slice(2) : val;
  return `0x${v.padStart(64, '0')}`;
}

/**
 * Fetch the full structlog trace and filter to interesting opcodes only.
 * The raw structlog can be millions of entries — we keep only the subset
 * needed to show SLOAD/SSTORE, jumps, events, and call boundaries.
 */
export async function getFilteredStructLog(
  rpcUrl: string,
  txHash: string,
  verbose = false,
): Promise<import('../types').FilteredStructLog[]> {
  try {
    const result = await rpcCall<{ structLogs: any[] }>(rpcUrl, 'debug_traceTransaction', [
      txHash,
      { disableStack: false, disableMemory: true, disableStorage: false },
    ]);

    const out: import('../types').FilteredStructLog[] = [];
    const logs = result?.structLogs ?? [];
    const maxEntries = verbose ? 100000 : 25000;
    let truncated = false;

    for (let i = 0; i < logs.length; i++) {
      const e = logs[i];
      const depth = e.depth ?? 1;
      
      // Filter logic:
      // Always skip noise (PUSH, DUP, SWAP)
      if (e.op.startsWith('PUSH') || e.op.startsWith('DUP') || e.op.startsWith('SWAP')) continue;
      
      // If not verbose, only keep "interesting" ops
      if (!verbose && !INTERESTING_OPS.has(e.op)) continue;

      const entry: import('../types').FilteredStructLog = {
        pc:      e.pc      ?? 0,
        op:      e.op      ?? '',
        gas:     e.gas     ?? 0,
        gasCost: e.gasCost ?? 0,
        depth:   depth,
        error:   e.error,
      };

      // For LOG0..LOG4, extract topic hashes from the EVM stack.
      // Stack layout: [..., offset, size, topic0, topic1, ...topicN]
      // topicCount = opcode number (LOG0=0, LOG1=1, etc.)
      if (e.op.startsWith('LOG') && Array.isArray(e.stack)) {
        const topicCount = parseInt(e.op.slice(3), 10);
        if (topicCount > 0 && e.stack.length >= 2 + topicCount) {
          const topics: string[] = [];
          for (let t = 0; t < topicCount; t++) {
            // Topics are below offset+size on the stack (stack grows upward)
            // stack[-1] = offset, stack[-2] = size, stack[-3] = topic0, etc.
            const raw = String(e.stack[e.stack.length - 3 - t]);
            const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
            topics.push(`0x${hex.padStart(64, '0')}`);
          }
          entry.logTopics = topics;
        }
      }

      // For SLOAD/SSTORE, extract slot + value from the EVM stack.
      // Geth structlog shows state BEFORE opcode execution:
      //   SLOAD:  stack = [..., slot]  →  after exec, next step stack = [..., loadedValue]
      //   SSTORE: stack = [..., slot, newValue]  →  both consumed
      if ((e.op === 'SLOAD' || e.op === 'SSTORE') && Array.isArray(e.stack) && e.stack.length > 0) {
        const rawKey = String(e.stack[e.stack.length - 1]);
        const key = rawKey.startsWith('0x') ? rawKey.slice(2).toLowerCase() : rawKey.toLowerCase();
        entry.storageKey = `0x${key.padStart(64, '0')}`;

        if (e.op === 'SLOAD') {
          // After SLOAD executes, the loaded value is on top of the next step's stack
          const next = (i + 1 < logs.length) ? logs[i + 1] : null;
          if (next && Array.isArray(next.stack) && next.stack.length > 0) {
            const rawVal = String(next.stack[next.stack.length - 1]);
            const val = rawVal.startsWith('0x') ? rawVal.slice(2) : rawVal;
            entry.storagePost = `0x${val.padStart(64, '0')}`;
          }
        } else {
          // SSTORE: new value is second from top on the current stack
          if (e.stack.length > 1) {
            const rawNewVal = String(e.stack[e.stack.length - 2]);
            const newVal = rawNewVal.startsWith('0x') ? rawNewVal.slice(2) : rawNewVal;
            entry.storagePost = `0x${newVal.padStart(64, '0')}`;
          }
          // Old value: scan backwards through raw structlog at the same depth
          // to find the most recent storage map containing this slot
          const keyStripped = key.replace(/^0+/, '') || '0';
          for (let j = i; j >= Math.max(0, i - 200); j--) {
            const step = logs[j];
            if (step.depth !== e.depth) continue;
            if (!step.storage) continue;
            const oldVal = findStorageVal(step.storage as Record<string, string>, key, keyStripped);
            if (oldVal !== undefined) {
              entry.storagePre = normalizeStorageVal(oldVal);
              break;
            }
          }
        }
      }

      if ((e.op === 'JUMP' || e.op === 'JUMPI') && Array.isArray(e.stack) && e.stack.length > 0) {
        const top = String(e.stack[e.stack.length - 1]);
        entry.jumpTo = top.startsWith('0x') ? top : `0x${top}`;
        if (e.op === 'JUMPI' && e.stack.length > 1) {
          const cond = String(e.stack[e.stack.length - 2]);
          entry.jumpCondition = cond.startsWith('0x') ? cond : `0x${cond}`;
        }
        entry.jumpStack = e.stack
          .slice(Math.max(0, e.stack.length - 8))
          .reverse()
          .map((value: unknown) => {
            const hex = String(value);
            return hex.startsWith('0x') ? hex : `0x${hex}`;
          });
      }

      if (e.op === 'JUMP' && Array.isArray(e.memory) && e.memory.length > 0) {
        entry.jumpMemory = e.memory
          .slice(0, 8)
          .map((value: unknown) => {
            const hex = String(value);
            return hex.startsWith('0x') ? hex : `0x${hex}`;
          });
      }

      out.push(entry);

      if (out.length >= maxEntries) {
        truncated = true;
        break;
      }
    }

    if (truncated && out.length > 0) {
      out[out.length - 1].truncated = true;
    }

    return out;
  } catch {
    // Structlog not supported by this node — return empty (feature degrades gracefully)
    return [];
  }
}



let nodeCounter = 0;

export function normalizeCallTree(raw: any, parentId?: string, depth = 0): TraceNode {
  const id = `node-${nodeCounter++}`;
  const children = (raw.calls ?? []).map((c: any) => normalizeCallTree(c, id, depth + 1));

  // Inline logs from callTracer withLog:true
  const logs = ((raw.logs ?? []) as any[]).map((l) => ({
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

export function parseAllLogs(receipt: any): {
  allLogs: EventLog[];
  erc20Transfers: ERC20Transfer[];
  erc721Transfers: ERC721Transfer[];
  erc1155Transfers: ERC1155Transfer[];
} {
  const allLogs: EventLog[] = [];
  const erc20Transfers: ERC20Transfer[] = [];
  const erc721Transfers: ERC721Transfer[] = [];
  const erc1155Transfers: ERC1155Transfer[] = [];

  if (!Array.isArray(receipt.logs)) return { allLogs, erc20Transfers, erc721Transfers, erc1155Transfers };

  for (const log of receipt.logs) {
    const topic0 = log.topics?.[0]?.toLowerCase();
    const logIndex = parseInt(log.logIndex, 16);
    const address = log.address?.toLowerCase();

    // Base log entry
    const eventLog: EventLog = {
      address,
      topics: log.topics ?? [],
      data: log.data ?? '0x',
      logIndex,
    };

    if (topic0 === SIG.TRANSFER) {
      const topicCount = log.topics.length;
      if (topicCount === 3) {
        // ERC-20 Transfer(address from, address to, uint256 value)
        const from = '0x' + log.topics[1].slice(26);
        const to   = '0x' + log.topics[2].slice(26);
        const amount = log.data !== '0x' ? BigInt(log.data).toString() : '0';
        erc20Transfers.push({ tokenAddress: address, from: from.toLowerCase(), to: to.toLowerCase(), amount, logIndex });
        eventLog.eventName = 'Transfer';
        eventLog.decoded = { from: from.toLowerCase(), to: to.toLowerCase(), value: amount };
      } else if (topicCount === 4) {
        // ERC-721 Transfer(address from, address to, uint256 tokenId)
        const from    = '0x' + log.topics[1].slice(26);
        const to      = '0x' + log.topics[2].slice(26);
        const tokenId = BigInt(log.topics[3]).toString();
        erc721Transfers.push({ tokenAddress: address, from: from.toLowerCase(), to: to.toLowerCase(), tokenId, logIndex });
        eventLog.eventName = 'Transfer (ERC-721)';
        eventLog.decoded = { from: from.toLowerCase(), to: to.toLowerCase(), tokenId };
      }
    } else if (topic0 === SIG.TRANSFER_SINGLE) {
      // ERC-1155 TransferSingle(address operator, address from, address to, uint256 id, uint256 value)
      const operator = '0x' + log.topics[1].slice(26);
      const from     = '0x' + log.topics[2].slice(26);
      const to       = '0x' + log.topics[3].slice(26);
      const [id, value] = parseUint256Pair(log.data);
      erc1155Transfers.push({
        tokenAddress: address, operator: operator.toLowerCase(),
        from: from.toLowerCase(), to: to.toLowerCase(),
        id: id.toString(), value: value.toString(), logIndex, isBatch: false,
      });
      eventLog.eventName = 'TransferSingle (ERC-1155)';
    } else if (topic0 === SIG.TRANSFER_BATCH) {
      // ERC-1155 TransferBatch — data has dynamic arrays, skip deep decode
      const operator = '0x' + log.topics[1].slice(26);
      const from     = '0x' + log.topics[2].slice(26);
      const to       = '0x' + log.topics[3].slice(26);
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

// ── ERC-20 Transfer (legacy helper, now uses parseAllLogs) ───

export function parseTokenTransfers(receipt: any): TokenTransfer[] {
  const { erc20Transfers } = parseAllLogs(receipt);
  return erc20Transfers.map(t => ({
    tokenAddress: t.tokenAddress,
    from: t.from,
    to: t.to,
    amount: t.amount,
    logIndex: t.logIndex,
  }));
}

// ── Native ETH transfers from call tree ──────────────────────

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

export function buildStateDiffs(prestateResult: any): AddressStateDiff[] {
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
  const gasLimit = parseHexOrDecimal((node as any).gas ?? node.gasUsed);
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
