// ============================================================
// workers/traceSourceAnnotation.ts
// Maps EVM structLog entries back to Solidity source: fetches verified
// debug info, builds a PC→source-location index, and resolves internal
// (JUMP/JUMPI) call parameters. Extracted from traceWorker.ts.
// ============================================================

import { getRuntimeDebugInfo } from '../services/sourcifyService';
import { buildPcToInstMapping, getLineForOffset, parseSourceMap } from '../utils/sourceMap';
import type { SourceLocation } from '../utils/sourceMap';
import { createLogger } from '@shared/utils/logger';

const log = createLogger('traceWorker');

export type FunctionRange = {
  start: number;
  end: number;
  label: string;
  functionName: string;
  fileIndex: number;
  params: Array<{ name: string; type: string }>;
  returnsValue: boolean;
};

export type RuntimeAnnotator = {
  annotatePc: (pc: number) => TraceSourceMeta;
};

export type TraceSourceMeta = {
  sourceLabel?: string;
  sourceFile?: string;
  sourceLine?: number;
  sourceJump?: string;
  sourceParams?: Array<{ name: string; type: string }>;
  sourceFunction?: string;
  sourceReturnsValue?: boolean;
  sourceLocation?: SourceLocation;
};

export type StructLogEntry = {
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

export async function annotateStructLogWithSourceLabels(
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
