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
  return node.contract_name
    || (node.to ? short(node.to, addressLabels, tokenLabels, tokenAddresses) : undefined)
    || 'NEW CONTRACT';
}

export function nodeFunctionName(node: TraceNode) {
  return node.function_name
    || node.decodedFunction?.split('(')[0]
    || (node.input?.length >= 10 ? node.input.slice(0, 10) : '');
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

export function opcodeShortLabel(op: string): string {
  return SHORT_OPCODE_LABELS[op] ?? op;
}

export function decodeEventName(topics: string[]): string {
  if (!topics[0]) return 'Unknown';
  const prefix = topics[0].slice(0, 10);
  return EVENT_SIGNATURES[prefix] ?? `0x${topics[0].slice(2, 10)}`;
}

/**
 * Derive stack context for JUMP/JUMPI opcodes (internal function calls).
 * Extracts parameter values from the stack based on expected count.
 * stack[0] = dest PC (JUMP) or dest PC (JUMPI), stack[1] = condition (JUMPI only).
 */
export function deriveJumpContext(
  op: string,
  stack?: string[],
  expectedParamCount?: number,
): { params: string[] } | null {
  if (!stack || stack.length < 1) return null;
  const items = [...stack];
  // JUMP: [dest, ...rest]  JUMPI: [dest, condition, ...rest]
  const paramStartIdx = op === 'JUMPI' ? 2 : 1;

  if (items.length <= paramStartIdx) return null;

  let params: string[];
  if (expectedParamCount !== undefined && expectedParamCount > 0) {
    params = items.slice(paramStartIdx, paramStartIdx + expectedParamCount);
  } else {
    // Without known param count, don't guess — avoids showing return_pc as a param
    return null;
  }

  const formattedParams = params.reverse().map(v => {
    if (!v || v === '0x0' || v === ZERO_WORD) return '0';
    return v.startsWith('0x') ? v : `0x${v}`;
  });

  return { params: formattedParams };
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
