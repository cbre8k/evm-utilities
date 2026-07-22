// ============================================================
// src/lib/api.ts — Shared response helpers for Next route handlers
// ============================================================

import { NextResponse } from 'next/server';
import type { Logger } from '@shared/utils/logger';

/** Every error response from this app has the shape `{ error: string }`. */
export interface ApiErrorBody {
  error: string;
}

export function apiError(message: string, status: number): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Log an unexpected failure in full and return a generic 500 to the caller.
 * Internal error text never reaches the client — it can carry endpoint URLs,
 * upstream keys and stack detail.
 */
export function serverError(log: Logger, err: unknown): NextResponse<ApiErrorBody> {
  log.error('request failed', err);
  return apiError('Internal Server Error', 500);
}
