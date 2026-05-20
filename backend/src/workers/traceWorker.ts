// ============================================================
// workers/traceWorker.ts — full trace with all enrichments
// ============================================================

import type { ConsumeMessage, Channel } from 'amqplib';
import { QUEUES, consumeQueue, publishJob } from '../db/rabbitmq';
import { cacheGet, cacheSet, getRedis } from '../db/redis';
import { Trace } from '../models/Trace';
import { Share } from '../models/Share';
import { Transaction } from '../models/Transaction';
import { createTraceShare } from '../services/shareService';
import {
  buildTxOverview,
  buildTokenLabelMap,
  enrichErc20Transfers,
  debugTraceTransaction,
  getPrestateTrace,
  getFilteredStructLog,
  normalizeCallTree,
  parseAllLogs,
  extractNativeTransfers,
  buildStateDiffs,
  buildGasTree,
  getChainId,
  getTransactionReceipt,
} from '../services/rpcService';
import { decodeCalldata, decodeOutput, lookupEventNames } from '../services/selectorService';
import { getRuntimeDebugInfo, getVerifiedContractName } from '../services/sourcifyService';
import { config } from '../config';
import type { TraceJobMessage } from '../types';
import { buildPcToInstMapping, getLineForOffset, parseSourceMap } from '../utils/sourceMap';
import type { SourceLocation } from '../utils/sourceMap';

type FunctionRange = {
  start: number;
  end: number;
  label: string;
  functionName: string;
  fileIndex: number;
  params: Array<{ name: string; type: string }>;
  returnsValue: boolean;
};

type RuntimeAnnotator = {
  annotatePc: (pc: number) => TraceSourceMeta;
};

type TraceSourceMeta = {
  sourceLabel?: string;
  sourceFile?: string;
  sourceLine?: number;
  sourceJump?: string;
  sourceParams?: Array<{ name: string; type: string }>;
  sourceFunction?: string;
  sourceReturnsValue?: boolean;
  sourceLocation?: SourceLocation;
};

type StructLogEntry = {
  pc: number;
  op: string;
  depth?: number;
  jumpTo?: string;
  sourceLabel?: string;
  sourceFile?: string;
  sourceLine?: number;
  sourceJump?: string;
  sourceStart?: number;
  sourceLength?: number;
  sourceFileIndex?: number;
  jumpTargetLabel?: string;
  jumpTargetFile?: string;
  jumpTargetLine?: number;
  jumpTargetParams?: Array<{ name: string; type: string }>;
  jumpTargetFunction?: string;
  jumpTargetFunctionParams?: string[];
  jumpResolvedParams?: string[];
  jumpTargetFunctionReturnsValue?: boolean;
  jumpStack?: string[];
  jumpMemory?: string[];
};


function collectTraceAddresses(node: any, out = new Set<string>()): string[] {
  if (node?.from) out.add(String(node.from).toLowerCase());
  if (node?.to) out.add(String(node.to).toLowerCase());
  for (const log of node?.logs ?? []) {
    if (log?.address) out.add(String(log.address).toLowerCase());
  }
  for (const child of node?.children ?? []) collectTraceAddresses(child, out);
  return [...out];
}

/** Set contract_name on every trace node from the resolved address labels. */
function setContractNames(
  node: any,
  labels: Record<string, string>,
  tokenLabels: Record<string, string>,
): void {
  if (node?.to) {
    const key = node.to.toLowerCase();
    node.contract_name = labels[key] ?? tokenLabels[key] ?? undefined;
  }
  for (const child of node?.children ?? []) setContractNames(child, labels, tokenLabels);
}

async function buildAddressLabelMap(
  chainId: number,
  addresses: string[],
  tokenLabels: Record<string, string>,
): Promise<Record<string, string>> {
  const unique = [...new Set(addresses.filter(Boolean).map(address => address.toLowerCase()))];
  const entries = await Promise.all(
    unique.map(async (address) => {
      if (tokenLabels[address]) return [address, tokenLabels[address]] as const;
      const name = await getVerifiedContractName(chainId, address);
      return [address, name] as const;
    }),
  );

  return Object.fromEntries(entries.filter(([, label]) => !!label)) as Record<string, string>;
}

function formatParamType(param: any): string {
  if (!param || typeof param !== 'object') return 'unknown';
  let type: string;
  if (param.typeDescriptions?.typeString) {
    type = String(param.typeDescriptions.typeString);
  } else if (param.typeName?.name) {
    type = String(param.typeName.name);
  } else if (param.typeName?.nodeType === 'ElementaryTypeName' && param.typeName?.name) {
    type = String(param.typeName.name);
  } else {
    return 'unknown';
  }
  // Solidity's typeDescriptions.typeString does NOT include the data-location qualifier
  // (calldata / memory / storage) — that is stored separately in the node's storageLocation
  // field.  Append it so that resolveInternalCallParams can distinguish calldata slices
  // (2 stack words) from memory references (1 stack word).
  const loc = typeof param.storageLocation === 'string' ? param.storageLocation : '';
  if (loc && loc !== 'default' && !type.includes(loc)) {
    type = `${type} ${loc}`;
  }
  return type;
}

function parseSrc(src?: string): { start: number; length: number; fileIndex: number } | null {
  if (!src) return null;
  const [start, length, fileIndex] = src.split(':').map((value) => parseInt(value, 10));
  if ([start, length, fileIndex].some((value) => Number.isNaN(value))) return null;
  return { start, length, fileIndex };
}

function collectFunctionRanges(node: any, currentContract?: string, out: FunctionRange[] = []): FunctionRange[] {
  if (!node || typeof node !== 'object') return out;

  let nextContract = currentContract;
  if (node.nodeType === 'ContractDefinition' && typeof node.name === 'string') {
    nextContract = node.name;
  }

  if (node.nodeType === 'FunctionDefinition') {
    const loc = parseSrc(node.src);
    if (loc) {
      let name = node.name || '';
      if (node.kind === 'constructor') name = 'constructor';
      if (node.kind === 'fallback') name = 'fallback';
      if (node.kind === 'receive') name = 'receive';
      const qualified = nextContract ? `${nextContract}.${name || 'function'}` : (name || 'function');
      const params = Array.isArray(node.parameters?.parameters)
        ? node.parameters.parameters.map((param: any, index: number) => ({
            name: param?.name || `arg${index}`,
            type: formatParamType(param),
          }))
        : [];
      const returnsValue = Array.isArray(node.returnParameters?.parameters)
        ? node.returnParameters.parameters.length > 0
        : false;
      out.push({
        start: loc.start,
        end: loc.start + loc.length,
        label: qualified,
        functionName: name || 'function',
        fileIndex: loc.fileIndex,
        params,
        returnsValue,
      });
    }
  }

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) collectFunctionRanges(item, nextContract, out);
    } else if (value && typeof value === 'object') {
      collectFunctionRanges(value, nextContract, out);
    }
  }

  return out;
}

function findMatchingBrace(source: string, openIndex: number): number {
  let depth = 0;

  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }

  return source.length;
}

function maskSolidityComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n\r]*/g, (match) =>
    match.replace(/[^\n\r]/g, ' '),
  );
}

function parseFunctionParams(paramsText: string): Array<{ name: string; type: string }> {
  if (!paramsText.trim()) return [];

  return paramsText
    .split(',')
    .map((raw, index) => {
      const parts = raw.trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) return { name: `arg${index}`, type: 'unknown' };

      const last = parts[parts.length - 1];
      const hasName = /^[A-Za-z_$][\w$]*$/.test(last) &&
        !['memory', 'storage', 'calldata', 'payable'].includes(last);
      const name = hasName ? last : `arg${index}`;
      const typeParts = hasName ? parts.slice(0, -1) : parts;
      // Preserve location qualifiers (calldata/memory/storage) in the type string so that
      // resolveInternalCallParams can distinguish calldata slices (2 stack words) from
      // memory references (1 stack word).  Only strip 'payable' which carries no ABI meaning.
      const type = typeParts
        .filter((part) => part !== 'payable')
        .join(' ') || 'unknown';

      return { name, type };
    });
}

function collectFunctionRangesFromSource(
  source: string,
  fileIndex: number,
  fallbackContract?: string | null,
): FunctionRange[] {
  const ranges: FunctionRange[] = [];
  const contracts: Array<{ name: string; start: number; end: number }> = [];
  const searchableSource = maskSolidityComments(source);
  const contractPattern = /\b(?:abstract\s+)?(?:contract|library|interface)\s+([A-Za-z_$][\w$]*)[^{;]*\{/g;
  let contractMatch: RegExpExecArray | null;

  while ((contractMatch = contractPattern.exec(searchableSource))) {
    const openIndex = searchableSource.indexOf('{', contractMatch.index);
    contracts.push({
      name: contractMatch[1],
      start: contractMatch.index,
      end: openIndex >= 0 ? findMatchingBrace(searchableSource, openIndex) : source.length,
    });
  }

  const functionPattern = /\b(function\s+([A-Za-z_$][\w$]*)|constructor|fallback|receive)\s*\(([^)]*)\)([^{;]*)[;{]/g;
  let functionMatch: RegExpExecArray | null;

  while ((functionMatch = functionPattern.exec(searchableSource))) {
    const declarationEnd = functionPattern.lastIndex;
    const bodyStart = searchableSource[declarationEnd - 1] === '{' ? declarationEnd - 1 : -1;
    const enclosing = contracts
      .filter((contract) => functionMatch!.index >= contract.start && functionMatch!.index < contract.end)
      .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
    const contractName = enclosing?.name ?? fallbackContract ?? undefined;
    const kind = functionMatch[1];
    const functionName = kind.startsWith('function ')
      ? functionMatch[2]
      : kind;
    const end = bodyStart >= 0
      ? findMatchingBrace(searchableSource, bodyStart)
      : searchableSource.indexOf(';', declarationEnd - 1) + 1 || declarationEnd;
    const returnsValue = /\breturns\s*\(([^)]*)\)/.test(functionMatch[4] ?? '');
    const label = contractName ? `${contractName}.${functionName}` : functionName;

    ranges.push({
      start: functionMatch.index,
      end,
      label,
      functionName,
      fileIndex,
      params: parseFunctionParams(functionMatch[3] ?? ''),
      returnsValue,
    });
  }

  return ranges;
}

async function buildRuntimeAnnotator(chainId: number, address: string): Promise<RuntimeAnnotator | null> {
  const info = await getRuntimeDebugInfo(chainId, address);
  if (!info?.runtimeBytecode || !info.runtimeSourceMap) return null;

  const pcToInst = buildPcToInstMapping(info.runtimeBytecode);
  const locations = parseSourceMap(info.runtimeSourceMap);
  const outputSources = info.stdJsonOutput?.sources ?? {};
  const fileIndexToPath = new Map<number, string>();

  Object.entries(outputSources).forEach(([path, sourceInfo]) => {
    const id = typeof (sourceInfo as any)?.id === 'number' ? (sourceInfo as any).id : undefined;
    if (typeof id === 'number') fileIndexToPath.set(id, path);
  });
  Object.keys(info.sources ?? {}).forEach((path) => {
    const sourceInfo = (info.stdJsonOutput?.sources ?? {})[path] as any;
    const id = typeof sourceInfo?.id === 'number' ? sourceInfo.id : undefined;
    if (typeof id === 'number' && !fileIndexToPath.has(id)) fileIndexToPath.set(id, path);
  });

  const astFunctionRanges = Object.values(outputSources)
    .flatMap((sourceInfo) => collectFunctionRanges((sourceInfo as any)?.ast))
    .sort((a, b) => (a.end - a.start) - (b.end - b.start));
  const sourceFunctionRanges = Object.entries(info.sources ?? {})
    .flatMap(([path, sourceInfo]) => {
      const fileIndex = typeof (outputSources as any)?.[path]?.id === 'number'
        ? (outputSources as any)[path].id
        : undefined;
      const source = (sourceInfo as any)?.content;
      if (typeof fileIndex !== 'number' || !source) return [];
      return collectFunctionRangesFromSource(source, fileIndex, info.contractName);
    })
    .sort((a, b) => (a.end - a.start) - (b.end - b.start));
  const functionRanges = astFunctionRanges.length > 0 ? astFunctionRanges : sourceFunctionRanges;

  return {
    annotatePc(pc: number) {
      const inst = pcToInst[pc];
      const loc = typeof inst === 'number' ? locations[inst] : undefined;
      if (!loc || loc.fileIndex < 0 || loc.start < 0) return {};

      const path = fileIndexToPath.get(loc.fileIndex);
      const source = path ? info.sources[path]?.content : undefined;
      const range = functionRanges.find(
        (candidate) =>
          candidate.fileIndex === loc.fileIndex &&
          loc.start >= candidate.start &&
          loc.start < candidate.end,
      );

      return {
        sourceLabel: range?.label,
        sourceFile: path ? path.split('/').pop() ?? path : undefined,
        sourceLine: source ? getLineForOffset(source, loc.start) : undefined,
        sourceParams: range?.params,
        sourceFunction: range?.functionName,
        sourceReturnsValue: range?.returnsValue,
        sourceLocation: loc,
      };
    },
  };
}

function applySourceMeta(entry: StructLogEntry, meta: TraceSourceMeta): void {
  if (meta.sourceLabel) entry.sourceLabel = meta.sourceLabel;
  if (meta.sourceFile) entry.sourceFile = meta.sourceFile;
  if (meta.sourceLine) entry.sourceLine = meta.sourceLine;
  if (meta.sourceLocation) {
    entry.sourceStart = meta.sourceLocation.start;
    entry.sourceLength = meta.sourceLocation.length;
    entry.sourceFileIndex = meta.sourceLocation.fileIndex;
  }
  if (meta.sourceLocation?.jump && meta.sourceLocation.jump !== '-') {
    entry.sourceJump = meta.sourceLocation.jump;
  }
}

function applyJumpTargetMeta(entry: StructLogEntry, meta: TraceSourceMeta): void {
  if (meta.sourceLabel) entry.jumpTargetLabel = meta.sourceLabel;
  if (meta.sourceFile) entry.jumpTargetFile = meta.sourceFile;
  if (meta.sourceLine) entry.jumpTargetLine = meta.sourceLine;
  if (meta.sourceParams?.length) entry.jumpTargetParams = meta.sourceParams;
  if (meta.sourceFunction) entry.jumpTargetFunction = meta.sourceFunction;
  if (meta.sourceParams) entry.jumpTargetFunctionParams = meta.sourceParams.map((param) => param.name);
  if (typeof meta.sourceReturnsValue === 'boolean') {
    entry.jumpTargetFunctionReturnsValue = meta.sourceReturnsValue;
  }
}

function parseJumpDestination(jumpTo?: string): number | null {
  if (!jumpTo) return null;
  const pc = Number.parseInt(String(jumpTo).replace(/^0x/i, ''), 16);
  return Number.isNaN(pc) ? null : pc;
}

class JumpDispatcher {
  private pendingJumpIn: { entry: StructLogEntry; targetPc: number } | null = null;

  constructor(private readonly calldata?: string) {}

  dispatch(entry: StructLogEntry, annotator: RuntimeAnnotator): void {
    const currentMeta = annotator.annotatePc(entry.pc);
    applySourceMeta(entry, currentMeta);

    if (entry.op === 'JUMPDEST') {
      this.handleJumpDest(entry, currentMeta);
      return;
    }

    if (entry.op !== 'JUMP') return;

    const targetPc = parseJumpDestination(entry.jumpTo);
    if (targetPc === null) {
      this.pendingJumpIn = null;
      return;
    }

    const targetMeta = annotator.annotatePc(targetPc);
    applyJumpTargetMeta(entry, targetMeta);

    const jumpKind = currentMeta.sourceLocation?.jump;
    if (jumpKind === 'i') {
      this.pendingJumpIn = { entry, targetPc };
    } else {
      this.pendingJumpIn = null;
    }
  }

  private handleJumpDest(entry: StructLogEntry, meta: TraceSourceMeta): void {
    if (!this.pendingJumpIn) return;
    if (this.pendingJumpIn.targetPc !== entry.pc) {
      this.pendingJumpIn = null;
      return;
    }

    const jumpEntry = this.pendingJumpIn.entry;
    applyJumpTargetMeta(jumpEntry, meta);

    // Resolve call parameters now that jumpTargetParams is authoritative from the JUMPDEST.
    // annotatePc(targetPc) at JUMP time sometimes misses the function range; the JUMPDEST's
    // own source map entry is the reliable lookup point.
    if (
      jumpEntry.sourceJump === 'i' &&
      jumpEntry.jumpTargetParams?.length &&
      jumpEntry.jumpStack?.length &&
      !jumpEntry.jumpResolvedParams
    ) {
      const resolved = resolveInternalCallParams('JUMP', jumpEntry.jumpStack, jumpEntry.jumpTargetParams, this.calldata);
      if (resolved) jumpEntry.jumpResolvedParams = resolved;
    }

    this.pendingJumpIn = null;
  }
}

// ── Internal call parameter resolution ───────────────────────

/**
 * Extract a calldata slice and return a human-readable decoded value.
 *
 * @param calldata  Full transaction calldata ("0x" + hex).
 * @param offset    Byte offset into calldata where the slice begins.
 * @param byteLen   Byte length of the slice.
 * @param type      Solidity type string (e.g. "uint256[] calldata", "bytes calldata").
 * @param baseTypeFn  The same baseType() helper used in resolve.
 */
function sliceCalldata(
  calldata: string,
  offset: bigint,
  byteLen: bigint,
  type: string,
  baseTypeFn: (t: string) => string,
): string | null {
  // Sanity guards — reject obviously wrong (e.g. swapped offset/length) values
  if (offset < 0n || byteLen < 0n) return null;
  if (byteLen === 0n) return type.includes('bytes') || type.includes('string') ? '0x' : '[]';
  // Refuse implausibly large values to avoid Number precision loss / huge allocations
  if (offset > 65536n || byteLen > 65536n) return null;

  const hex = calldata.startsWith('0x') ? calldata.slice(2) : calldata;
  const byteStart = Number(offset);
  const byteCount = Number(byteLen);
  if ((byteStart + byteCount) * 2 > hex.length) return null; // out of bounds

  const slice = hex.slice(byteStart * 2, (byteStart + byteCount) * 2);
  const b = baseTypeFn(type);

  // bytes / string
  if (b === 'bytes') return byteCount === 0 ? '0x' : '0x' + slice;
  if (b === 'string') {
    try {
      const bytes = Uint8Array.from(slice.match(/.{2}/g)!.map(h => parseInt(h, 16)));
      return '"' + new TextDecoder().decode(bytes) + '"';
    } catch { return '0x' + slice; }
  }

  // Array type: every EVM value element is padded to 32 bytes
  if (b.endsWith('[]') || b.includes('[')) {
    const elemType = b.replace(/\[.*/, '').trim(); // strip [] suffix
    const elemCount = Math.floor(byteCount / 32);
    if (elemCount === 0) return '[]';
    const elements: string[] = [];
    for (let i = 0; i < elemCount; i++) {
      const word = '0x' + slice.slice(i * 64, (i + 1) * 64);
      if (elemType.includes('address')) {
        elements.push('0x' + word.slice(-40));
      } else {
        // uint*, int*, bytes32, etc. — compact hex (trim leading zeros)
        try { elements.push('0x' + BigInt(word).toString(16)); } catch { elements.push(word); }
      }
    }
    return '[' + elements.join(', ') + ']';
  }

  return '0x' + slice; // fallback: raw hex
}

/**
 * Decode parameters for a Solidity internal function call from the EVM stack.
 *
 * Stack layout at JUMP — Solidity pushes args so the FIRST declared param ends
 * up closest to the stack top:
 *   peek(0)   = jump destination
 *   peek(1)   = first declared param's first word
 *   peek(2)   = first declared param's second word (for 2-word calldata slices)
 *   ...
 *   peek(N)   = last declared param's last word
 *
 * Case 1 — static value types (address, uint*, int*, bool, bytesN):
 *   1 stack word; decoded directly.
 *
 * Case 2 — memory-dynamic types (bytes memory, string memory, unqualified bytes/string):
 *   1 stack word (memory pointer); value is not decodable without memory access → '?'.
 *
 * Case 3 — calldata-dynamic types (bytes calldata, string calldata):
 *   2 stack words: (offset, length) — a calldata slice pointer.
 *   Shown as calldata[offset+length] pointer notation; no data is read because
 *   there is no mload-equivalent for calldata in the trace context.
 */
function resolveInternalCallParams(
  op: string,
  jumpStack: string[],
  params: Array<{ name: string; type: string }>,
  calldata?: string,
): string[] | null {
  if (!params.length || !jumpStack.length) return null;

  // Parse a stack word as a BigInt; returns null on failure.
  const toBigInt = (h: string): bigint | null => {
    try { return BigInt(h.startsWith('0x') ? h : `0x${h}`); } catch { return null; }
  };

  // Strip ABI location modifiers to get the canonical Solidity base type
  const baseType = (t: string) =>
    t.toLowerCase().trim().replace(/\b(calldata|memory|storage|payable)\b/g, '').replace(/\s+/g, ' ').trim();

  const isDyn = (t: string) => {
    const b = baseType(t);
    return b === 'bytes' || b === 'string' || b.endsWith('[]') || b.includes('[]');
  };
  // Calldata-dynamic: ONLY when the type explicitly carries the 'calldata' qualifier.
  // Two stack words: (calldata-offset, byte-length).
  const isCalldataDyn = (t: string) => isDyn(t) && t.toLowerCase().includes('calldata');
  // Memory-dynamic: dynamic types with 'memory' qualifier OR without any qualifier
  // (Solidity defaults unqualified reference types to 'memory' for internal params).
  // One stack word: a memory pointer — we can't decode the value without memory access.
  const isMemDyn = (t: string) => isDyn(t) && !isCalldataDyn(t);

  // Every param occupies at least 1 stack word; calldata-dynamic occupy 2.
  const stackStart = op === 'JUMPI' ? 2 : 1; // skip dest (+ JUMPI condition)
  const wordsNeeded = params.reduce((sum, p) => sum + (isCalldataDyn(p.type) ? 2 : 1), 0);

  if (jumpStack.length < stackStart + wordsNeeded) return null;

  /**
   * Decode one attempt given a `words` slice (already offset past dest/condition).
   * `words[0]` corresponds to the LAST declared parameter (Solidity reversal),
   * or the first if called with the forward slice.
   */
  const decode = (words: string[]): string[] => {
    const result: string[] = [];
    let idx = 0;
    for (const p of params) {
      if (isMemDyn(p.type)) {
        idx++; // consume the 1-word memory pointer — value is not decodable without memory access
        result.push('?'); // Case 2: memory-dynamic, skip value
        continue;
      }

      if (isCalldataDyn(p.type)) {
        // Case 3: two stack words — (offset, length) calldata pointer pair.
        // If we have the raw calldata, decode the actual bytes; otherwise fall
        // back to the compact pointer notation calldata[offset+byteLen].
        const w1 = words[idx], w2 = words[idx + 1];
        idx += 2;
        if (!w1 || !w2) { result.push('?'); continue; }
        const off = toBigInt(w1);
        const len = toBigInt(w2);
        if (off !== null && len !== null) {
          const decoded = calldata ? sliceCalldata(calldata, off, len, p.type, baseType) : null;
          result.push(decoded ?? `calldata[${w1}+${len}]`);
        } else {
          result.push('?');
        }
        continue;
      }

      // Case 1: static value type — 1 stack word
      const w = words[idx++];
      if (!w) { result.push('?'); continue; }
      const b = baseType(p.type);
      const raw = w.startsWith('0x') ? w.slice(2) : w;
      if (b.includes('address')) {
        result.push('0x' + raw.slice(-40));
      } else if (b === 'bool') {
        try { result.push(BigInt(w) === 0n ? 'false' : 'true'); } catch { result.push(w); }
      } else if (b.startsWith('uint')) {
        try { result.push(BigInt(w).toString()); } catch { result.push(w); }
      } else if (b.startsWith('int')) {
        // Sign-extend from 256-bit two's complement
        try {
          const u = BigInt(w);
          const TWO_255 = 1n << 255n;
          const signed = u >= TWO_255 ? u - (1n << 256n) : u;
          result.push(signed.toString());
        } catch { result.push(w); }
      } else {
        result.push(w); // bytes32, etc.
      }
    }
    return result;
  };

  /**
   * Score a decoded result: lower = better.
   * Penalises obvious type mismatches (e.g. address word with high bits set,
   * bool that is neither 0 nor 1).
   */
  const score = (values: string[]): number => {
    let penalty = 0;
    for (let i = 0; i < params.length; i++) {
      const v = values[i] ?? '?';
      if (v === '?') { penalty += 3; continue; }
      const b = baseType(params[i].type);
      const raw = v.startsWith('0x') ? v.slice(2) : v;
      if (b.includes('address')) {
        // An address should have its high 12 bytes zeroed
        if (raw.length > 40 && raw.slice(0, raw.length - 40).replace(/0/g, '') !== '') penalty += 5;
        // A value shorter than 40 hex chars cannot be a full Ethereum address
        if (raw.length < 40) penalty += 3;
        // Very short values (clearly a PC, offset, or other small integer, not an address)
        if (raw.length < 10) penalty += 5;
        if (raw === '0'.repeat(raw.length)) penalty += 2; // zero address is suspicious
      }
      if (b === 'bool' && v !== 'false' && v !== 'true') penalty += 5;
    }
    return penalty;
  };

  // Solidity pushes args so that the FIRST declared param ends up closest to the
  // stack top (lowest peek index after dest).  For calldata slices the offset word
  // is pushed after the length word, so offset sits at a lower peek index (closer
  // to dest) than length.
  //
  // Therefore rawSlice[0] = first-param's first word, rawSlice[1] = first-param's
  // second word (if calldata), etc. — this is the "fwd" / declaration order.
  // "rev" (reversed) is kept only as a scoring fallback for safety.
  const rawSlice = jumpStack.slice(stackStart, stackStart + wordsNeeded);
  const fwd = decode(rawSlice);                // declaration order — the canonical correct order
  const rev = decode([...rawSlice].reverse()); // reversed — fallback sanity check

  // Prefer fwd unless rev clearly scores better (lower = fewer type mismatches).
  // Using strict < so ties always go to fwd.
  const best = score(rev) < score(fwd) ? rev : fwd;
  return best.every(v => v === '?') ? null : best;
}

async function annotateStructLogWithSourceLabels(
  structLog: StructLogEntry[],
  root: any,
  chainId: number,
  txCalldata?: string,
): Promise<StructLogEntry[]> {
  if (!structLog.length) return structLog;

  const annotated = [...structLog];
  const callQueue: any[] = [];
  const annotatorCache = new Map<string, RuntimeAnnotator | null>();
  const dispatchers = new Map<string, JumpDispatcher>();

  function collectCalls(node: any) {
    for (const child of node?.children ?? []) {
      callQueue.push(child);
      collectCalls(child);
    }
  }

  collectCalls(root);

  // Pre-collect all unique contract addresses that have JUMP/JUMPDEST entries
  // and build their annotators in parallel — avoids sequential Sourcify fetches.
  const uniqueAddresses = new Set<string>();
  const activeFramesScan = [root];
  let scanCallIdx = 0;
  for (const entry of annotated) {
    const frameDepth = Math.max(0, (entry.depth ?? 1) - 1);
    const rowDepth = Math.max(1, entry.depth ?? 1);
    activeFramesScan.length = frameDepth + 1;
    const frame = activeFramesScan[frameDepth] ?? root;
    if (entry.op === 'CALL' || entry.op === 'CALLCODE' || entry.op === 'STATICCALL' ||
        entry.op === 'DELEGATECALL' || entry.op === 'CREATE' || entry.op === 'CREATE2') {
      const node = callQueue[scanCallIdx++] ?? null;
      if (node) activeFramesScan[rowDepth] = node;
    }
    if ((entry.op === 'JUMP' || entry.op === 'JUMPI' || entry.op === 'JUMPDEST')) {
      const addr = ((frame?.to ?? frame?.from ?? '') as string).toLowerCase();
      if (addr) uniqueAddresses.add(addr);
    }
  }
  await Promise.all(
    [...uniqueAddresses].map(async (addr) => {
      annotatorCache.set(addr, await buildRuntimeAnnotator(chainId, addr));
    }),
  );

  const activeFrames = [root];
  let callIdx = 0;

  for (let i = 0; i < annotated.length; i += 1) {
    const entry = annotated[i];
    const frameDepth = Math.max(0, (entry.depth ?? 1) - 1);
    const rowDepth = Math.max(1, entry.depth ?? 1);
    activeFrames.length = frameDepth + 1;
    const currentFrame = activeFrames[frameDepth] ?? root;
    const currentAddress = (currentFrame?.to ?? currentFrame?.from ?? '').toLowerCase();

    if (entry.op === 'CALL' || entry.op === 'CALLCODE' || entry.op === 'STATICCALL' ||
        entry.op === 'DELEGATECALL' || entry.op === 'CREATE' || entry.op === 'CREATE2') {
      const node = callQueue[callIdx++] ?? null;
      if (node) activeFrames[rowDepth] = node;
    }

    if (entry.op !== 'JUMP' && entry.op !== 'JUMPI' && entry.op !== 'JUMPDEST') continue;
    if (!currentAddress) continue;

    const annotator = annotatorCache.get(currentAddress) ?? null;
    if (!annotator) continue;

    const dispatcherKey = `${frameDepth}:${currentAddress}`;
    const dispatcher = dispatchers.get(dispatcherKey) ?? new JumpDispatcher(txCalldata);
    dispatchers.set(dispatcherKey, dispatcher);

    if (entry.op === 'JUMP' || entry.op === 'JUMPDEST') {
      dispatcher.dispatch(entry, annotator);
      // Attempt to decode internal call parameters for call-site JUMPs ('i').
      // Return JUMPs ('o') are excluded to avoid false decodes (the stack at a
      // return JUMP contains return values / return PCs, not function arguments).
      // Note: most decodes happen inside handleJumpDest (above); this block is a
      // fast-path for the rare case where annotatePc(targetPc) already resolved
      // the function range at JUMP time.
      if (entry.op === 'JUMP' && entry.sourceJump === 'i') {
        if (entry.jumpTargetParams?.length && entry.jumpStack?.length && !entry.jumpResolvedParams) {
          const resolved = resolveInternalCallParams(
            'JUMP',
            entry.jumpStack,
            entry.jumpTargetParams,
            txCalldata,
          );
          if (resolved) entry.jumpResolvedParams = resolved;
        }
      }
      continue;
    }

    // JUMPI — annotate current PC and jump target
    const meta = annotator.annotatePc(entry.pc);
    applySourceMeta(entry, meta);
    const targetPc = parseJumpDestination(entry.jumpTo);
    if (targetPc !== null) {
      applyJumpTargetMeta(entry, annotator.annotatePc(targetPc));
    }
    // Attempt to decode internal call parameters for JUMPI call sites as well
    if (entry.jumpTargetParams?.length && entry.jumpStack?.length) {
      const resolved = resolveInternalCallParams(
        'JUMPI',
        entry.jumpStack,
        entry.jumpTargetParams,
        txCalldata,
      );
      if (resolved) entry.jumpResolvedParams = resolved;
    }
  }

  return annotated;
}

export async function startTraceWorker(): Promise<void> {
  await consumeQueue(QUEUES.TX_TRACE, handleTraceJob);
}

export async function buildTraceResultPayload(
  rpcUrl: string,
  txHash: string,
  chainId: number,
  verbose = false,
) {
  const [txOverview, rawCallTree, receipt, prestateResult, rawStructLog] = await Promise.all([
    buildTxOverview(rpcUrl, txHash),
    debugTraceTransaction(rpcUrl, txHash),
    getTransactionReceipt(rpcUrl, txHash),
    getPrestateTrace(rpcUrl, txHash),
    getFilteredStructLog(rpcUrl, txHash),
  ]);

  const normalizedTree = normalizeCallTree(rawCallTree);
  const structLog = await annotateStructLogWithSourceLabels(rawStructLog, normalizedTree, chainId, txOverview.input);
  const {
    allLogs,
    erc20Transfers,
    erc721Transfers,
    erc1155Transfers,
  } = parseAllLogs(receipt);

  // Enrich inline trace logs with event names from decoded receipt logs
  const eventNameByTopic = new Map<string, string>();
  for (const log of allLogs) {
    if (log.eventName && log.topics?.[0]) {
      eventNameByTopic.set(log.topics[0].toLowerCase(), log.eventName);
    }
  }
  await enrichTreeLogs(normalizedTree, eventNameByTopic);

  // Apply resolved names back to allLogs for frontend consumption
  for (const log of allLogs) {
    if (!log.eventName && log.topics?.[0]) {
      const name = eventNameByTopic.get(log.topics[0].toLowerCase());
      if (name) log.eventName = name;
    }
  }

  const nativeTransfers = extractNativeTransfers(normalizedTree);
  const stateDiffs = buildStateDiffs(prestateResult);
  const gasTree = buildGasTree(normalizedTree, parseInt(txOverview.gasUsed, 16));
  const decodedCalldata = txOverview.input
    ? await decodeCalldata(txOverview.input, txOverview.to, chainId)
    : undefined;
  const decodedOutput = txOverview.input && normalizedTree.output
    ? await decodeOutput(txOverview.input, normalizedTree.output, txOverview.to, chainId)
    : undefined;
  const tokenLabels = await buildTokenLabelMap(
    rpcUrl,
    erc20Transfers.map(transfer => transfer.tokenAddress),
  );
  const enrichedErc20Transfers = await enrichErc20Transfers(rpcUrl, erc20Transfers, tokenLabels);
  const addressLabels = await buildAddressLabelMap(
    chainId,
    collectTraceAddresses(normalizedTree),
    tokenLabels,
  );

  setContractNames(normalizedTree, addressLabels, tokenLabels);

  await annotateTree(normalizedTree, chainId);

  return {
    chainId,
    txOverview,
    normalizedTree,
    structLog,
    addressLabels,
    tokenLabels,
    allLogs,
    erc20Transfers: enrichedErc20Transfers,
    erc721Transfers,
    erc1155Transfers,
    nativeTransfers,
    stateDiffs,
    gasTree,
    decodedCalldata,
    decodedOutput,
  };
}

async function handleTraceJob(msg: ConsumeMessage, _ch: Channel): Promise<void> {
  const { jobId, txHash, rpcUrl, fallbackRpcUrls = [], chainId: providedChainId, verbose = false } =
    JSON.parse(msg.content.toString()) as any;

  console.log(`[traceWorker] processing job ${jobId} — tx ${txHash}`);

  const redis = getRedis();
  const statusKey   = `job:${jobId}:status`;
  const outputKey   = `job:${jobId}:output`;
  const shareHashKey = `job:${jobId}:shareHash`;
  const traceKey    = `trace:${providedChainId}:${txHash.toLowerCase()}`;

  try {
    await redis.setex(statusKey, config.ttl.job, 'running');

    // ── 1. Redis cache ────────────────────────────────────────
    const cached = await cacheGet<any>(traceKey);
    if (cached) {
      console.log(`[traceWorker] cache hit for ${txHash}`);
      const chainId = providedChainId ?? cached.chainId ?? (await getChainId(rpcUrl));
      let payload = await ensureTxOverviewMetadata(cached, rpcUrl, txHash, chainId, fallbackRpcUrls);
      payload = await ensureDecodedArtifacts(payload, chainId, rpcUrl);
      if (payload !== cached) await cacheSet(traceKey, payload, config.ttl.trace);
      await redis.setex(statusKey, config.ttl.job, 'done');
      await redis.setex(outputKey, config.ttl.job, JSON.stringify(payload));
      if (payload.shareHash) await redis.setex(shareHashKey, config.ttl.job, payload.shareHash);
      return;
    }

    // ── 2. MongoDB cache ──────────────────────────────────────
    const chainId = providedChainId ?? (await getChainId(rpcUrl));
    const dbTrace = await Trace.findOne({ txHash: txHash.toLowerCase(), chainId });
    if (dbTrace) {
      console.log(`[traceWorker] mongo hit for ${txHash}`);
      let payload = await ensureTxOverviewMetadata(dbTrace.toObject(), rpcUrl, txHash, chainId, fallbackRpcUrls);
      payload = await ensureDecodedArtifacts(payload, chainId, rpcUrl);
      await cacheSet(traceKey, payload, config.ttl.trace);
      await redis.setex(statusKey, config.ttl.job, 'done');
      await redis.setex(outputKey, config.ttl.job, JSON.stringify(payload));
      if (dbTrace.shareHash) await redis.setex(shareHashKey, config.ttl.job, dbTrace.shareHash);
      return;
    }

    // ── 3. Fetch from RPC (parallel where possible) ───────────
    const [txOverview, rawCallTree, receipt, prestateResult, rawStructLog] = await Promise.all([
      buildTxOverview(rpcUrl, txHash, fallbackRpcUrls),
      debugTraceTransaction(rpcUrl, txHash),
      getTransactionReceipt(rpcUrl, txHash),
      getPrestateTrace(rpcUrl, txHash),
      getFilteredStructLog(rpcUrl, txHash),
    ]);

    const normalizedTree  = normalizeCallTree(rawCallTree);
    const structLog = await annotateStructLogWithSourceLabels(rawStructLog, normalizedTree, chainId, txOverview.input);
    const {
      allLogs,
      erc20Transfers,
      erc721Transfers,
      erc1155Transfers,
    } = parseAllLogs(receipt);

    // Enrich inline trace logs with event names from decoded receipt logs
    const eventNameByTopic2 = new Map<string, string>();
    for (const log of allLogs) {
      if (log.eventName && log.topics?.[0]) {
        eventNameByTopic2.set(log.topics[0].toLowerCase(), log.eventName);
      }
    }
    await enrichTreeLogs(normalizedTree, eventNameByTopic2);

    // Apply resolved names back to allLogs for frontend consumption
    for (const log of allLogs) {
      if (!log.eventName && log.topics?.[0]) {
        const name = eventNameByTopic2.get(log.topics[0].toLowerCase());
        if (name) log.eventName = name;
      }
    }

    const nativeTransfers  = extractNativeTransfers(normalizedTree);
    const stateDiffs       = buildStateDiffs(prestateResult);
    const gasTree          = buildGasTree(normalizedTree, parseInt(txOverview.gasUsed, 16));
    const decodedCalldata  = txOverview.input
      ? await decodeCalldata(txOverview.input, txOverview.to, chainId)
      : undefined;
    const decodedOutput    = txOverview.input && normalizedTree.output
      ? await decodeOutput(txOverview.input, normalizedTree.output, txOverview.to, chainId)
      : undefined;
    const tokenLabels      = await buildTokenLabelMap(
      rpcUrl,
      erc20Transfers.map(transfer => transfer.tokenAddress),
    );
    const enrichedErc20Transfers = await enrichErc20Transfers(rpcUrl, erc20Transfers, tokenLabels);
    const addressLabels    = await buildAddressLabelMap(
      chainId,
      collectTraceAddresses(normalizedTree),
      tokenLabels,
    );

    setContractNames(normalizedTree, addressLabels, tokenLabels);

    // ── 4. Annotate tree nodes with decoded function names ────
    await annotateTree(normalizedTree, chainId);

    // ── 4. Persist Transaction ────────────────────────────────
    await Transaction.findOneAndUpdate(
      { hash: txHash.toLowerCase(), chainId },
      {
        hash: txHash.toLowerCase(),
        chainId,
        blockNumber: txOverview.blockNumber,
        from: txOverview.from,
        to: txOverview.to,
        value: txOverview.value,
        gas: parseInt(txOverview.gasLimit, 16),
        gasPrice: txOverview.gasPrice,
        input: txOverview.input,
        status: txOverview.status,
        fetchedAt: new Date(),
      },
      { upsert: true }
    );

    // ── 5. Share (idempotent) ─────────────────────────────────
    const share = await createTraceShare({
      txHash: txHash.toLowerCase(),
      rpcUrl,
      chainId,
      txOverview,
      normalizedTrace: normalizedTree,
      tokenTransfers: enrichedErc20Transfers,
      decodedCalldata: decodedCalldata ?? undefined,
      decodedOutput: decodedOutput ?? undefined,
    });

    // ── 6. Persist Trace ──────────────────────────────────────
    await Trace.findOneAndUpdate(
      { txHash: txHash.toLowerCase(), chainId },
      {
        txHash: txHash.toLowerCase(),
        chainId,
        shareHash: share.hash,
        txOverview,
        rawCallTree,
        normalizedTree,
        tokenTransfers: enrichedErc20Transfers,
        decodedCalldata,
        decodedOutput,
        structLog,
        addressLabels,
        tokenLabels,
        allLogs,
        erc20Transfers: enrichedErc20Transfers,
        erc721Transfers,
        erc1155Transfers,
        nativeTransfers,
        stateDiffs,
        gasTree,
        gasUsed: txOverview.gasUsed,
        fetchedAt: new Date(),
      },
      { upsert: true }
    );

    // ── 7. Build result payload ───────────────────────────────
    const resultPayload = {
      chainId,
      txOverview,
      normalizedTree,
      structLog,
      addressLabels,
      tokenLabels,
      allLogs,
      erc20Transfers: enrichedErc20Transfers,
      erc721Transfers,
      erc1155Transfers,
      nativeTransfers,
      stateDiffs,
      gasTree,
      decodedCalldata,
      decodedOutput,
      shareHash: share.hash,
      shareUrl: `/explorer?trace=${share.hash}`,
    };

    await cacheSet(traceKey, resultPayload, config.ttl.trace);
    await redis.setex(statusKey, config.ttl.job, 'done');
    await redis.setex(outputKey, config.ttl.job, JSON.stringify(resultPayload));
    await redis.setex(shareHashKey, config.ttl.job, share.hash);

    // Publish decode jobs for unique selectors in the tree (in parallel)
    const selectors = collectSelectors(normalizedTree);
    await Promise.all(
      selectors.map((sel) => publishJob(QUEUES.TX_DECODE, { jobId: `${jobId}-${sel}`, selector: sel })),
    );

    console.log(`[traceWorker] done job ${jobId} — shareHash ${share.hash}`);
  } catch (err: any) {
    console.error(`[traceWorker] error job ${jobId}:`, err.message);
    await redis.setex(statusKey, config.ttl.job, 'failed');
    await redis.setex(outputKey, config.ttl.job, JSON.stringify({ error: err.message }));
    throw err;
  }
}

async function ensureTxOverviewMetadata(payload: any, rpcUrl: string, txHash: string, chainId?: number, fallbackRpcUrls: string[] = []): Promise<any> {
  if (payload?.txOverview?.timestamp && payload?.txOverview?.txType) return payload;

  const freshOverview = await buildTxOverview(rpcUrl, txHash, fallbackRpcUrls);
  const txOverview = {
    ...payload.txOverview,
    timestamp: payload.txOverview?.timestamp ?? freshOverview.timestamp,
    txType: payload.txOverview?.txType ?? freshOverview.txType ?? '0x0',
  };
  const enriched = { ...payload, txOverview };
  const resolvedChainId = chainId ?? payload.chainId;

  if (resolvedChainId) {
    await Trace.updateOne(
      { txHash: txHash.toLowerCase(), chainId: resolvedChainId },
      { $set: { txOverview } }
    ).exec();
    await Share.updateOne(
      { txHash: txHash.toLowerCase(), chainId: resolvedChainId, type: 'trace' },
      { $set: { txOverview } }
    ).exec();
  }

  return enriched;
}

function collectSelectors(node: any, seen = new Set<string>()): string[] {
  if (node?.input && node.input.length >= 10) seen.add(node.input.slice(0, 10));
  for (const child of node?.children ?? []) collectSelectors(child, seen);
  return [...seen];
}

/**
 * Enrich inline trace logs with event names.
 * 1. Apply names from receipt logs (already decoded Transfer, Approval, etc.)
 * 2. Collect unknown topic0s and batch-lookup via 4byte / OpenChain APIs
 * 3. Apply the results back to the logs
 */
async function enrichTreeLogs(
  node: any,
  eventNameByTopic: Map<string, string>,
): Promise<void> {
  // First pass: apply known names and collect unknowns
  const unknownTopics = new Set<string>();
  collectUnknownTopics(node, eventNameByTopic, unknownTopics);

  // Batch lookup unknowns via 4byte / OpenChain
  if (unknownTopics.size > 0) {
    const looked = await lookupEventNames([...unknownTopics]);
    for (const [topic, name] of looked) {
      eventNameByTopic.set(topic, name);
    }
  }

  // Second pass: apply all resolved names
  applyEventNames(node, eventNameByTopic);
}

function collectUnknownTopics(
  node: any,
  known: Map<string, string>,
  unknowns: Set<string>,
): void {
  const logs = node?.logs as any[] | undefined;
  if (logs?.length) {
    for (const log of logs) {
      if (log.name) continue;
      const topic0 = log.topics?.[0]?.toLowerCase();
      if (topic0 && !known.has(topic0)) {
        unknowns.add(topic0);
      }
    }
  }
  for (const child of node?.children ?? []) {
    collectUnknownTopics(child, known, unknowns);
  }
}

function applyEventNames(
  node: any,
  nameByTopic: Map<string, string>,
): void {
  const logs = node?.logs as any[] | undefined;
  if (logs?.length) {
    for (const log of logs) {
      if (log.name) continue;
      const topic0 = log.topics?.[0]?.toLowerCase();
      if (topic0 && nameByTopic.has(topic0)) {
        log.name = nameByTopic.get(topic0);
      }
    }
  }
  for (const child of node?.children ?? []) {
    applyEventNames(child, nameByTopic);
  }
}

/** Check if any log in the tree is missing a name */
function hasUnnamedLogs(node: any): boolean {
  const logs = node?.logs as any[] | undefined;
  if (logs?.length) {
    for (const log of logs) {
      if (!log.name && log.topics?.[0]) return true;
    }
  }
  for (const child of node?.children ?? []) {
    if (hasUnnamedLogs(child)) return true;
  }
  return false;
}

/**
 * Walk the call tree and annotate each node with decodedFunction + decodedArgs
 * by looking up its 4-byte selector and ABI-decoding the calldata in place.
 * Must be called BEFORE the result payload is built / cached.
 */
async function annotateTree(node: any, chainId: number): Promise<boolean> {
  let changed = false;
  if (node?.input && node.input.length >= 10) {
    const decoded = await decodeCalldata(node.input, node.to, chainId);
    if (decoded) {
      const previousFunction = node.decodedFunction;
      const previousArgs = JSON.stringify(node.decodedArgs ?? []);
      node.decodedFunction = decoded.functionName;
      node.decodedArgs     = decoded.args;
      changed ||= previousFunction !== node.decodedFunction || previousArgs !== JSON.stringify(node.decodedArgs ?? []);
    }
    // Also decode output if available and not yet decoded
    if (node.output && node.output !== '0x' && !node.decoded_output?.length) {
      const decodedOut = await decodeOutput(node.input, node.output, node.to, chainId);
      if (decodedOut?.values?.length) {
        node.decoded_output = decodedOut.values;
        changed = true;
      }
    }
  }
  // Process all children concurrently — avoids N+1 sequential decode awaits
  const childResults = await Promise.all(
    (node?.children ?? []).map((child: any) => annotateTree(child, chainId)),
  );
  changed = childResults.some(Boolean) || changed;
  return changed;
}

function hasMeaningfulDecodedCalldata(decoded: any): boolean {
  if (!decoded?.functionName) return false;
  if (!Array.isArray(decoded.args) || decoded.args.length === 0) return true;

  return decoded.args.some((arg: any) => {
    const value = String(arg?.value ?? '').trim();
    return value !== '' && value !== '""';
  });
}

function hasMeaningfulDecodedOutput(decoded: any): boolean {
  if (!decoded?.functionName) return false;
  if (!Array.isArray(decoded.values) || decoded.values.length === 0) return false;

  return decoded.values.some((output: any) => {
    const value = String(output?.value ?? '').trim();
    return value !== '' && value !== '""';
  });
}

async function ensureDecodedArtifacts(payload: any, chainId: number, rpcUrl: string): Promise<any> {
  let changed = false;
  const nextPayload = { ...payload };

  if (nextPayload?.txOverview?.input && !hasMeaningfulDecodedCalldata(nextPayload.decodedCalldata)) {
    const repaired = await decodeCalldata(nextPayload.txOverview.input, nextPayload.txOverview.to, chainId);
    if (hasMeaningfulDecodedCalldata(repaired)) {
      nextPayload.decodedCalldata = repaired;
      changed = true;
    }
  }

  if (nextPayload?.txOverview?.input && nextPayload?.normalizedTree?.output && !hasMeaningfulDecodedOutput(nextPayload.decodedOutput)) {
    const repairedOutput = await decodeOutput(
      nextPayload.txOverview.input,
      nextPayload.normalizedTree.output,
      nextPayload.txOverview.to,
      chainId,
    );
    if (hasMeaningfulDecodedOutput(repairedOutput)) {
      nextPayload.decodedOutput = repairedOutput;
      changed = true;
    }
  }

  if (nextPayload?.normalizedTree) {
    const treeChanged = await annotateTree(nextPayload.normalizedTree, chainId);
    changed = treeChanged || changed;

    // Enrich event names from 4byte/OpenChain if any logs are unnamed
    if (hasUnnamedLogs(nextPayload.normalizedTree)) {
      const knownNames = new Map<string, string>();
      // Seed from allLogs (receipt-decoded event names)
      if (Array.isArray(nextPayload.allLogs)) {
        for (const log of nextPayload.allLogs) {
          if (log.eventName && log.topics?.[0]) {
            knownNames.set(log.topics[0].toLowerCase(), log.eventName);
          }
        }
      }
      await enrichTreeLogs(nextPayload.normalizedTree, knownNames);
      changed = true;
    }
  }

  if ((!nextPayload.tokenLabels || Object.keys(nextPayload.tokenLabels).length === 0) && Array.isArray(nextPayload.erc20Transfers) && nextPayload.erc20Transfers.length > 0) {
    nextPayload.tokenLabels = await buildTokenLabelMap(
      rpcUrl,
      nextPayload.erc20Transfers.map((transfer: { tokenAddress: string }) => transfer.tokenAddress),
    );
    changed = Object.keys(nextPayload.tokenLabels).length > 0 || changed;
  }

  if (!nextPayload.addressLabels || Object.keys(nextPayload.addressLabels).length === 0) {
    nextPayload.addressLabels = await buildAddressLabelMap(
      chainId,
      collectTraceAddresses(nextPayload.normalizedTree),
      nextPayload.tokenLabels ?? {},
    );
    if (Object.keys(nextPayload.addressLabels).length > 0) {
      setContractNames(nextPayload.normalizedTree, nextPayload.addressLabels, nextPayload.tokenLabels ?? {});
    }
    changed = Object.keys(nextPayload.addressLabels).length > 0 || changed;
  }

  if (!changed) return payload;

  await Trace.updateOne(
    { txHash: nextPayload.txHash?.toLowerCase(), chainId },
    {
      $set: {
        decodedCalldata: nextPayload.decodedCalldata,
        decodedOutput: nextPayload.decodedOutput,
        normalizedTree: nextPayload.normalizedTree,
        structLog: nextPayload.structLog ?? [],
        addressLabels: nextPayload.addressLabels ?? {},
        tokenLabels: nextPayload.tokenLabels ?? {},
        allLogs: nextPayload.allLogs ?? [],
        erc20Transfers: nextPayload.erc20Transfers ?? [],
        erc721Transfers: nextPayload.erc721Transfers ?? [],
        erc1155Transfers: nextPayload.erc1155Transfers ?? [],
        nativeTransfers: nextPayload.nativeTransfers ?? [],
        stateDiffs: nextPayload.stateDiffs ?? [],
        asset_changes: nextPayload.asset_changes ?? [],
        exposure_changes: nextPayload.exposure_changes ?? [],
        balance_changes: nextPayload.balance_changes ?? [],
        gasTree: nextPayload.gasTree,
      },
    }
  ).exec();

  await Share.updateOne(
    { txHash: nextPayload.txHash?.toLowerCase(), chainId, type: 'trace' },
    {
      $set: {
        decodedCalldata: nextPayload.decodedCalldata,
        decodedOutput: nextPayload.decodedOutput,
        normalizedTrace: nextPayload.normalizedTree,
      },
    }
  ).exec();

  return nextPayload;
}
