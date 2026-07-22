// ============================================================
// shared/utils/decoded.ts — Helpers over ABI-decoded payloads
// ============================================================

import type { DecodedCalldata, DecodedOutput } from '../types/decoded';

/**
 * True when decoded calldata is worth rendering. A function with no arguments
 * still counts — only a decode that produced blank argument values does not.
 */
export function hasMeaningfulDecodedCalldata(decoded: DecodedCalldata | null | undefined): boolean {
  if (!decoded?.functionName) return false;
  if (!Array.isArray(decoded.args) || decoded.args.length === 0) return true;

  return decoded.args.some((arg) => {
    const value = String(arg?.value ?? '').trim();
    return value !== '' && value !== '""';
  });
}

/**
 * True when a decoded return value is worth rendering — it must name a
 * function and carry at least one non-empty value. Guards against decoders
 * that succeed structurally but produce only blanks.
 */
export function hasMeaningfulDecodedOutput(decoded: DecodedOutput | null | undefined): boolean {
  if (!decoded?.functionName) return false;
  if (!Array.isArray(decoded.values) || decoded.values.length === 0) return false;

  return decoded.values.some((output) => {
    const value = String(output?.value ?? '').trim();
    return value !== '' && value !== '""';
  });
}
