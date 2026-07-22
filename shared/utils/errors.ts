// ============================================================
// shared/utils/errors.ts — Narrowing helpers for caught values
// ============================================================

/**
 * Extract a human-readable message from an unknown caught value.
 * `catch` binds `unknown`, so this is the safe way to read `.message`.
 */
export function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
