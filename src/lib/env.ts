// ============================================================
// src/lib/env.ts — Server-side environment access for Next routes
// ============================================================

/**
 * Base URL of the Express backend that owns tracing, simulation and shares.
 * Next route handlers proxy to it; the localhost default matches
 * `npm run dev` in backend/ (see backend/src/config.ts `port`).
 *
 * `BACKENDURL` is the historical spelling still used by existing .env files;
 * `BACKEND_URL` is the one documented in .env.example. Both are accepted.
 */
export const BACKEND_URL =
  process.env.BACKEND_URL || process.env.BACKENDURL || 'http://localhost:4000';
