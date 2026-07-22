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

export function opcodeShortLabel(op: string): string {
  return SHORT_OPCODE_LABELS[op] ?? op;
}

export function decodeEventName(topics: string[]): string {
  if (!topics[0]) return '';
  const sig = topics[0].startsWith('0x') ? topics[0].slice(0, 10) : `0x${topics[0].slice(0, 8)}`;
  return EVENT_SIGNATURES[sig] ?? sig;
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
