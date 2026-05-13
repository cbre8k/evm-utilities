// ============================================================
// app/explorer/decodeEventBySignature.ts
// Parse an event signature text and ABI-decode its parameters
// from raw EVM topics + data.
// ============================================================

import { AbiCoder } from 'ethers';

export interface DecodedEventParam {
  /** ABI type string, e.g. "uint256", "address", "bytes32" */
  type: string;
  /** Human-readable display key, disambiguates duplicate types */
  key: string;
  value: string;
}

export interface DecodedEventResult {
  eventName: string;
  /** Full signature text, e.g. "PoolInitialized(bytes32,uint24,uint24)" */
  signature: string;
  params: DecodedEventParam[];
}

// ── Internal helpers ─────────────────────────────────────────

/** Split top-level comma-separated params (handles nested tuples/arrays). */
function splitParamTypes(inner: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of inner) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Returns true for ABI dynamic types whose indexed encoding is keccak256(value). */
function isDynamicIndexed(type: string): boolean {
  return type === 'bytes' || type === 'string' || type.endsWith(']');
}

/** Build unique display keys for a list of type strings (handles duplicates). */
function buildKeys(types: string[]): string[] {
  const counts = new Map<string, number>();
  for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);

  const seen = new Map<string, number>();
  return types.map(t => {
    if ((counts.get(t) ?? 0) <= 1) return t;
    const idx = seen.get(t) ?? 0;
    seen.set(t, idx + 1);
    return `${t}[${idx}]`;
  });
}

// ── Public API ───────────────────────────────────────────────

/**
 * Parse a text signature like "PoolInitialized(bytes32,uint24,uint24)".
 * Returns null on parse failure.
 */
export function parseSignature(sig: string): { name: string; paramTypes: string[] } | null {
  const m = sig.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\((.*)\)$/s);
  if (!m) return null;
  const paramTypes = m[2] ? splitParamTypes(m[2]) : [];
  return { name: m[1], paramTypes };
}

/**
 * Decode a raw EVM event using its full text signature.
 *
 * Strategy: assume the first (topics.length - 1) params are indexed
 * (stored in topics[1..N]), the remainder are ABI-encoded in data.
 * This matches the common convention but may be wrong for events that
 * interleave indexed/non-indexed params — in that case values will be
 * shown raw instead of throwing.
 */
export function decodeEventBySignature(
  signature: string,
  topics: string[],
  data: string,
): DecodedEventResult | null {
  const parsed = parseSignature(signature);
  if (!parsed) return null;

  const { name, paramTypes } = parsed;
  const indexedCount = Math.min(topics.length - 1, paramTypes.length);
  const indexedTypes = paramTypes.slice(0, indexedCount);
  const nonIndexedTypes = paramTypes.slice(indexedCount);
  const allTypes = [...indexedTypes, ...nonIndexedTypes];
  const keys = buildKeys(allTypes);

  const params: DecodedEventParam[] = [];
  const coder = AbiCoder.defaultAbiCoder();

  // ── Indexed params from topics[1:] ─────────────────────────
  for (let i = 0; i < indexedTypes.length; i++) {
    const type = indexedTypes[i];
    const topic = topics[i + 1] ?? '0x';
    const key = keys[i];

    if (isDynamicIndexed(type)) {
      // Stored as keccak256(value) — cannot be reversed
      params.push({ type, key, value: topic });
    } else {
      try {
        const [val] = coder.decode([type], topic);
        params.push({ type, key, value: String(val) });
      } catch {
        params.push({ type, key, value: topic });
      }
    }
  }

  // ── Non-indexed params from data ───────────────────────────
  const hasData = data && data !== '0x' && data.length > 2;
  if (nonIndexedTypes.length > 0) {
    if (hasData) {
      try {
        const decoded = coder.decode(nonIndexedTypes, data);
        for (let i = 0; i < nonIndexedTypes.length; i++) {
          params.push({ type: nonIndexedTypes[i], key: keys[indexedCount + i], value: String(decoded[i]) });
        }
      } catch {
        // Fallback: show raw 32-byte words
        const hex = data.startsWith('0x') ? data.slice(2) : data;
        for (let i = 0; i < nonIndexedTypes.length; i++) {
          const word = hex.slice(i * 64, (i + 1) * 64);
          params.push({ type: nonIndexedTypes[i], key: keys[indexedCount + i], value: word ? '0x' + word : data });
        }
      }
    } else {
      for (let i = 0; i < nonIndexedTypes.length; i++) {
        params.push({ type: nonIndexedTypes[i], key: keys[indexedCount + i], value: '—' });
      }
    }
  }

  return { eventName: name, signature, params };
}
