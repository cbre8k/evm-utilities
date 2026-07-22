// ============================================================
// shared/constants/selectors.ts — 4byte / selector API config
// ============================================================

/** Per-request budget for a signature-database lookup. */
export const SIGNATURE_LOOKUP_TIMEOUT_MS = 5_000;

/** OpenChain signature database — preferred for event topic lookups. */
export const OPENCHAIN_API = {
  LOOKUP: 'https://api.openchain.xyz/signature-database/v1/lookup',
} as const;

export const FOURBYTE_API = {
  STATS: 'https://api.4byte.sourcify.dev/signature-database/v1/stats',
  LOOKUP: 'https://api.4byte.sourcify.dev/signature-database/v1/lookup',
  SEARCH: 'https://api.4byte.sourcify.dev/signature-database/v1/search',
  HEALTH: 'https://api.4byte.sourcify.dev/health',
} as const;
