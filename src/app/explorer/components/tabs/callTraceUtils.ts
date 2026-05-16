import type { TraceNode } from '@/types/explorer';
import {
  EVENT_SIGNATURES,
  MAX_INLINE_ARGS,
  RETURN_FALSE,
  RETURN_TRUE,
  SHORT_OPCODE_LABELS,
  ZERO_WORD,
} from './callTraceConstants';

export function short(
  addr: string | null | undefined,
  addressLabels: Record<string, string>,
  tokenLabels: Record<string, string> = {},
  tokenAddresses: Set<string> = new Set(),
) {
  if (!addr) return '—';
  const normalized = addr.toLowerCase();
  const tokenLabel = tokenLabels[normalized];
  if (tokenLabel) return tokenLabel;
  if (tokenAddresses.has(normalized)) return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
  const name = addressLabels[normalized];
  if (name) return name;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

export function shortSlot(slot: string) {
  if (!slot) return '0x0';
  const hex = slot.startsWith('0x') ? slot : `0x${slot}`;
  if (hex.length <= 18) return hex;
  return `${hex.slice(0, 10)}…${hex.slice(-8)}`;
}

export function shortVal(v: string) {
  if (!v || v === '0x0' || v === ZERO_WORD) return '0';
  if (v.length <= 18) return v;
  if (v.startsWith('0x')) return `${v.slice(0, 8)}…${v.slice(-6)}`;
  return v;
}

export function compactValue(v?: string) {
  if (!v || v === '0x' || v === '0x0') return '';
  try {
    const raw = v.startsWith('0x') ? BigInt(v) : BigInt(v);
    if (raw === 0n) return '';
    const whole = raw / 10n ** 18n;
    const frac = (raw % 10n ** 18n).toString().padStart(18, '0').slice(0, 6).replace(/0+$/, '');
    return `${frac ? `${whole}.${frac}` : whole.toString()} ETH`;
  } catch {
    return shortVal(v);
  }
}

export function nodeContractName(
  node: TraceNode,
  addressLabels: Record<string, string>,
  tokenLabels: Record<string, string>,
  tokenAddresses: Set<string>,
) {
  // Prefer address-label lookup for node.to (especially important for DELEGATECALL
  // where contract_name may reflect the proxy rather than the implementation)
  const toLabel = node.to
    ? (addressLabels[node.to.toLowerCase()] || tokenLabels[node.to.toLowerCase()])
    : undefined;
  return toLabel
    || node.contract_name
    || (node.to ? short(node.to, addressLabels, tokenLabels, tokenAddresses) : undefined)
    || 'NEW CONTRACT';
}

export function nodeFunctionName(node: TraceNode) {
  if (node.function_name) return node.function_name;
  if (node.decodedFunction) return node.decodedFunction.split('(')[0];
  if (node.input && node.input.length >= 10) return node.input.slice(0, 10);
  // Empty calldata → fallback/receive
  return 'fallback';
}

export function decodedArgs(node: TraceNode) {
  return node.decodedArgs?.length ? node.decodedArgs : node.decoded_input ?? [];
}

export function decodedOutputs(node: TraceNode) {
  return node.decoded_output ?? [];
}

export function argLabel(
  arg: { name?: string; type?: string; value: string; soltype?: { name?: string; type?: string } },
  index: number,
) {
  const name = arg.name || arg.soltype?.name || `arg${index}`;
  const type = arg.type || arg.soltype?.type;
  return type ? `${name}:${type}` : name;
}

export function previewArgs(args: ReturnType<typeof decodedArgs>) {
  const preview = args.slice(0, MAX_INLINE_ARGS);
  return { preview, remaining: Math.max(0, args.length - preview.length) };
}

export function isTruthyHex(v?: string): boolean {
  if (!v) return false;
  try { return BigInt(v) !== 0n; } catch { return false; }
}

export function decodeReturn(output: string): string {
  if (!output || output === '0x') return '';
  if (output === RETURN_TRUE) return 'true';
  if (output === RETURN_FALSE) return 'false';
  return shortVal(output);
}

export function decodeJumpReturn(
  returnStack?: string[],
  returnsValue?: boolean,
): string | null {
  if (!returnsValue || !returnStack || returnStack.length < 2) return null;
  const raw = returnStack[1];
  if (!raw || raw === '0x0' || raw === ZERO_WORD) return '0';

  const hex = raw.startsWith('0x') ? raw : `0x${raw}`;
  try {
    const n = BigInt(hex);
    if (n === 0n) return '0';
    if (n === 1n) return 'true';

    // Internal jump returns sometimes carry memory pointer offsets (0x20/0x40/0x80/0xa0...)
    // rather than the final value. Skip rendering these misleading pointers.
    if (n > 0n && n <= 0x200n && n % 32n === 0n) return null;

    return hex;
  } catch {
    return hex;
  }
}

/**
 * Decode raw ABI-encoded output hex into readable values.
 * Returns array of decoded strings (one per 32-byte word).
 * Handles: bool, uint256, address, bytes32.
 */
export function decodeRawOutput(output: string): string[] {
  if (!output || output === '0x' || output.length < 66) return [];
  const data = output.startsWith('0x') ? output.slice(2) : output;
  const wordCount = Math.floor(data.length / 64);
  if (wordCount === 0) return [];

  const results: string[] = [];
  for (let i = 0; i < wordCount && i < 8; i++) {
    const word = data.slice(i * 64, (i + 1) * 64);
    results.push(decodeWord(word));
  }
  return results;
}

function decodeWord(word: string): string {
  // All zeros = 0 or false
  if (word === '0'.repeat(64)) return '0';
  // Bool: single 1 in last byte
  if (word === '0'.repeat(63) + '1') return 'true';
  // Try as number first
  try {
    const num = BigInt('0x' + word);
    const str = num.toString();
    // If decimal repr is reasonable length, show as number
    if (str.length <= 20) return str;
    // If first 24 chars are zero (fits in 20 bytes), likely address
    if (word.slice(0, 24) === '0'.repeat(24)) {
      return '0x' + word.slice(24);
    }
    // Very large — show shortened hex
    return `0x${word.slice(0, 8)}…${word.slice(-6)}`;
  } catch {
    return `0x${word.slice(0, 8)}…${word.slice(-6)}`;
  }
}

export function opcodeShortLabel(op: string): string {
  return SHORT_OPCODE_LABELS[op] ?? op;
}

export function decodeEventName(topics: string[]): string {
  if (!topics[0]) return '';
  const sig = topics[0].startsWith('0x') ? topics[0].slice(0, 10) : `0x${topics[0].slice(0, 8)}`;
  return EVENT_SIGNATURES[sig] ?? sig;
}

/**
 * Derive stack context for JUMP/JUMPI opcodes (internal function calls).
 * Extracts parameter values from the stack based on expected count.
 * stack[0] = dest PC (JUMP/JUMPI), stack[1] = condition (JUMPI only),
 * stack[2] = return PC for internal function jumps (when params are known).
 */
export function deriveJumpContext(
  op: string,
  stack?: string[],
  expectedParamCount?: number,
  expectedParamTypes?: string[],
  expectedParamNames?: string[],
  jumpMemory?: string[],
): { params: string[] } | null {
  void expectedParamNames;
  if (!stack || stack.length < 1) return null;
  const normalizeHex = (value: string): string => {
    const raw = value.startsWith('0x') ? value.slice(2) : value;
    return `0x${raw.padStart(64, '0')}`;
  };
  const isDynamicType = (typ: string): boolean => {
    const t = typ.toLowerCase();
    return t === 'bytes' || t === 'string' || t.endsWith('[]') || t.startsWith('tuple');
  };
  const decodeFromMemory = (ptrHex: string, typ: string): string | null => {
    if (!jumpMemory || jumpMemory.length === 0) return null;
    try {
      const ptr = BigInt(ptrHex.startsWith('0x') ? ptrHex : `0x${ptrHex}`);
      if (ptr < 0n || ptr % 32n !== 0n) return null;
      const base = Number(ptr / 32n);
      if (!Number.isFinite(base) || base < 0 || base >= jumpMemory.length) return null;

      const lenWord = normalizeHex(jumpMemory[base]);
      const len = Number(BigInt(lenWord));
      if (!Number.isFinite(len) || len < 0) return null;

      if (typ === 'string' || typ === 'bytes') {
        const words = Math.ceil(len / 32);
        const chunks: string[] = [];
        for (let i = 0; i < words; i += 1) {
          const word = jumpMemory[base + 1 + i];
          if (!word) break;
          chunks.push(normalizeHex(word).slice(2));
        }
        if (chunks.length === 0) return typ === 'string' ? '""' : '0x';
        const dataHex = chunks.join('').slice(0, len * 2);
        if (typ === 'string') {
          try {
            return `"${Buffer.from(dataHex, 'hex').toString('utf8').replace(/\0+$/g, '')}"`;
          } catch {
            return `0x${dataHex}`;
          }
        }
        return `0x${dataHex}`;
      }

      if (typ.endsWith('[]')) {
        return `[len=${len}]`;
      }

      return null;
    } catch {
      return null;
    }
  };

  const items = [...stack];
  if (expectedParamCount === undefined || expectedParamCount <= 0) {
    // Without known param count, don't guess — avoids showing return_pc as a param
    return null;
  }
  const starts = op === 'JUMPI' ? [3, 2, 4] : [2, 1, 3, 4];
  const candidates: string[][] = [];

  for (const start of starts) {
    if (items.length < start + expectedParamCount) continue;
    const slice = items.slice(start, start + expectedParamCount);
    candidates.push(slice);
    candidates.push([...slice].reverse());
  }
  if (candidates.length === 0) return null;

  const score = (values: string[]): number => {
    let s = 0;
    for (let i = 0; i < values.length; i += 1) {
      const typ = (expectedParamTypes?.[i] || '').toLowerCase();
      const raw = values[i];
      const hex = raw && raw.startsWith('0x') ? raw : `0x${raw || '0'}`;
      try {
        const n = BigInt(hex);
        if (typ.includes('bool') && n !== 0n && n !== 1n) s += 4;
        if (typ.includes('address') && n <= 0xfffffn) s += 5;
        if (isDynamicType(typ)) {
          if (n < 0n || n % 32n !== 0n) s += 5;
          if (jumpMemory && jumpMemory.length > 0) {
            const idx = Number(n / 32n);
            if (!Number.isFinite(idx) || idx < 0 || idx >= jumpMemory.length) s += 2;
          }
        }
      } catch {
        s += 6;
      }
    }
    return s;
  };

  const params = candidates.sort((a, b) => score(a) - score(b))[0];
  const formattedParams = params.map((value, i) => {
    if (!value || value === '0x0' || value === ZERO_WORD) return '0';
    const hex = value.startsWith('0x') ? value : `0x${value}`;
    const typ = (expectedParamTypes?.[i] || '').toLowerCase();
    if (typ.includes('bool')) {
      try {
        return BigInt(hex) === 0n ? 'false' : 'true';
      } catch {
        return hex;
      }
    }
    if (typ.includes('address')) {
      const raw = hex.slice(2).padStart(64, '0');
      return `0x${raw.slice(24)}`;
    }
    if (isDynamicType(typ)) {
      const decoded = decodeFromMemory(hex, typ);
      if (decoded !== null) return decoded;
      return hex;
    }
    if (typ.includes('uint') || typ.includes('int')) {
      try {
        return BigInt(hex).toString();
      } catch {
        return hex;
      }
    }
    return hex;
  });

  return { params: formattedParams };
}

/**
 * Extract raw internal-jump argument words without semantic decoding.
 * Returns hex words exactly as seen in the jump stack window.
 */
export function rawJumpParams(
  op: string,
  stack?: string[],
  expectedParamCount?: number,
): string[] {
  if (!stack || stack.length === 0) return [];
  const count = expectedParamCount ?? 0;
  if (count <= 0) return [];
  const start = op === 'JUMPI' ? 2 : 1;
  if (stack.length <= start) return [];
  return stack
    .slice(start, start + count)
    .map((value) => (value.startsWith('0x') ? value : `0x${value}`));
}

/**
 * Build the tree connector prefix string for a trace row.
 * @param connectors  Array of booleans for each ancestor depth;
 *                    true = that ancestor still has more siblings below.
 * @param isLast      Whether the current item is the last in its parent's list.
 * @param isRoot      True for depth-0 entries (no prefix rendered).
 */
export function buildConnectorString(
  connectors: boolean[],
  isLast: boolean,
  isRoot: boolean,
): string {
  if (isRoot) return '';
  const prefix = connectors.map(hasMore => (hasMore ? '│ ' : '  ')).join('');
  const branch = isLast ? '└─' : '├─';
  return prefix + branch;
}
