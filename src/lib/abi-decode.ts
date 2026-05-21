/**
 * Client-side ABI decode: enriches a TraceNode tree using private aliases.
 * The raw ABI never leaves the browser — only decoded function names and args
 * are embedded in the node, matching the same fields the backend sets for
 * publicly verified contracts.
 */

import { Interface, type InterfaceAbi, type LogDescription, type TransactionDescription } from 'ethers';
import type { PrivateAlias, AbiItem } from '@/contexts/PrivateAliasContext';
import type { TraceNode, TraceLog } from '@/types/explorer';

// ── Interface cache ───────────────────────────────────────────────────────────

const ifaceCache = new Map<string, Interface>();

function getInterface(alias: PrivateAlias): Interface {
  const cached = ifaceCache.get(alias.address);
  if (cached) return cached;
  const iface = new Interface(alias.abi as InterfaceAbi);
  ifaceCache.set(alias.address, iface);
  return iface;
}

// ── Decode a single call node ─────────────────────────────────────────────────

function decodeCallNode(node: TraceNode, iface: Interface): void {
  if (!node.input || node.input.length < 10) return;
  let parsed: TransactionDescription | null = null;
  try {
    parsed = iface.parseTransaction({ data: node.input, value: node.value ?? '0x0' });
  } catch {
    return; // ABI mismatch — leave node unchanged
  }
  if (!parsed) return;

  node.function_name = parsed.name;
  node.decodedFunction = parsed.signature;
  node.decodedArgs = parsed.args.map((v, i) => {
    const frag = parsed!.fragment.inputs[i];
    return {
      name: frag?.name ?? `arg${i}`,
      type: frag?.type ?? 'unknown',
      value: String(v),
    };
  });
}

// ── Decode a single event/log entry ──────────────────────────────────────────

function decodeLogEntry(log: TraceLog, iface: Interface): void {
  if (!log.topics?.length) return;
  let parsed: LogDescription | null = null;
  try {
    parsed = iface.parseLog({ topics: log.topics, data: log.data ?? '0x' });
  } catch {
    return; // event not in this ABI
  }
  if (!parsed) return;

  log.name = parsed.name;
  log.inputs = parsed.args.map((v, i) => {
    const frag = parsed!.fragment.inputs[i];
    return {
      name: frag?.name ?? `arg${i}`,
      type: frag?.type ?? 'unknown',
      value: String(v),
      indexed: frag?.indexed ?? false,
    };
  });
}

// ── Walk the trace tree ───────────────────────────────────────────────────────

function walkNode(
  node: TraceNode,
  aliasMap: Map<string, Interface>,
): void {
  const toAddr = node.to?.toLowerCase();
  if (toAddr) {
    const iface = aliasMap.get(toAddr);
    if (iface) decodeCallNode(node, iface);
  }

  for (const child of node.children ?? []) {
    walkNode(child, aliasMap);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Enrich a TraceNode tree and its event logs in-place using private alias ABIs.
 * Returns the same tree reference (mutates in place for performance).
 * Non-destructive: any decode failure leaves the original node unchanged.
 */
export function applyPrivateAliases(
  tree: TraceNode,
  aliases: PrivateAlias[],
  logs: TraceLog[] = [],
): TraceNode {
  if (!aliases.length) return tree;

  // Build address → Interface map
  const aliasMap = new Map<string, Interface>();
  for (const alias of aliases) {
    try {
      aliasMap.set(alias.address, getInterface(alias));
    } catch { /* invalid ABI — skip */ }
  }

  // Enrich call tree
  walkNode(tree, aliasMap);

  // Enrich event logs
  for (const log of logs) {
    const addr = log.address?.toLowerCase();
    if (!addr) continue;
    const iface = aliasMap.get(addr);
    if (iface) decodeLogEntry(log, iface);
  }

  return tree;
}

/** Invalidate cached Interface for an address (call after alias update/remove). */
export function invalidateAliasCache(address: string): void {
  ifaceCache.delete(address.toLowerCase());
}

/** Validate raw ABI JSON string — returns parsed array or throws. */
export function parseAbiJson(raw: string): AbiItem[] {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('ABI must be a JSON array');
  // Light structural check: each item should be an object with a "type" field
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) throw new Error('ABI items must be objects');
  }
  // Verify ethers can parse it
  new Interface(parsed as InterfaceAbi);
  return parsed as AbiItem[];
}
