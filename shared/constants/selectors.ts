// ============================================================
// shared/constants/selectors.ts — 4byte / selector API config
// ============================================================

export const FOURBYTE_API = {
  STATS: 'https://api.4byte.sourcify.dev/signature-database/v1/stats',
  LOOKUP: 'https://api.4byte.sourcify.dev/signature-database/v1/lookup',
  SEARCH: 'https://api.4byte.sourcify.dev/signature-database/v1/search',
  HEALTH: 'https://api.4byte.sourcify.dev/health',
} as const;
