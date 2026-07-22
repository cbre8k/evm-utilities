// ============================================================
// shared/utils/tokens.ts — Native-token address conventions
// ============================================================

/** Sentinel address aggregators use to mean "the chain's native coin". */
export const NATIVE_TOKEN_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/** Bare symbols some aggregator APIs send instead of an address. */
const NATIVE_SYMBOLS = new Set(['eth', 'bnb']);

/**
 * True when `address` refers to the chain's native coin rather than an ERC-20.
 * Accepts the 0xEeee… sentinel, the zero address, and the bare symbols that
 * some aggregator responses use in place of an address.
 */
export function isNativeToken(address: string): boolean {
  const clean = address.toLowerCase().trim();
  return clean === NATIVE_TOKEN_ADDRESS || clean === ZERO_ADDRESS || NATIVE_SYMBOLS.has(clean);
}
