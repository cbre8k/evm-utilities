// ============================================================
// backend/src/utils/sourceMap.ts — Re-export from shared
// ============================================================

export type { SourceLocation } from '@shared/utils/sourceMap';
export { buildPcToInstMapping, parseSourceMap, getLineForOffset } from '@shared/utils/sourceMap';
