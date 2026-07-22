// ============================================================
// shared/utils/rpcUrl.ts — Redact secrets from RPC endpoint URLs
// ============================================================

const SECRET_PARAM_RE = /key|token|secret|auth|api/i;
const SECRET_QUERY_RE = /([?&](?:api_?key|key|token|secret|auth)=)[^&]+/gi;

/** Path segments at least this long are treated as embedded API keys. */
const MIN_SECRET_SEGMENT_LEN = 12;

/**
 * Mask credentials in an RPC URL so it is safe to log or return to a client.
 * Redacts basic-auth userinfo, secret-looking query params, and long trailing
 * path segments (the shape most providers use for project/API keys).
 * Falls back to a regex scrub when the input is not a parseable URL.
 */
export function maskRpcUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    if (url.username) url.username = '***';
    if (url.password) url.password = '***';

    for (const key of url.searchParams.keys()) {
      if (SECRET_PARAM_RE.test(key)) url.searchParams.set(key, '***');
    }

    const parts = url.pathname.split('/').filter(Boolean);
    const last = parts.at(-1);
    if (last && last.length > MIN_SECRET_SEGMENT_LEN && /[a-z0-9_-]{12,}/i.test(last)) {
      parts[parts.length - 1] = `${last.slice(0, 4)}...${last.slice(-4)}`;
      url.pathname = `/${parts.join('/')}`;
    }

    return url.toString();
  } catch {
    return rawUrl.replace(SECRET_QUERY_RE, '$1***');
  }
}
