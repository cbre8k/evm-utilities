// Simple in-memory rate limiter & concurrency guard
// For multi-instance prod, replace with Redis-based solution

const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_JOBS || '5', 10);
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = parseInt(process.env.RATE_LIMIT_PER_MIN || '10', 10);
const PROCESS_TIMEOUT_MS = parseInt(process.env.PROCESS_TIMEOUT_MS || '120000', 10); // 2 min

let activeJobs = 0;

// Sliding window per IP
const requestLog = new Map<string, number[]>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of requestLog.entries()) {
    const valid = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    if (valid.length === 0) {
      requestLog.delete(ip);
    } else {
      requestLog.set(ip, valid);
    }
  }
}, 5 * 60_000);

export function getClientIp(headerForwardedFor: string | null, headerRealIp: string | null): string {
  if (headerForwardedFor) {
    return headerForwardedFor.split(',')[0].trim();
  }
  return headerRealIp || 'unknown';
}

export function checkRateLimit(ip: string): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  const timestamps = requestLog.get(ip) || [];
  const valid = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);

  if (valid.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldestInWindow = valid[0];
    const retryAfterMs = RATE_LIMIT_WINDOW_MS - (now - oldestInWindow);
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  valid.push(now);
  requestLog.set(ip, valid);
  return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - valid.length, retryAfterMs: 0 };
}

export function acquireJob(): boolean {
  if (activeJobs >= MAX_CONCURRENT) return false;
  activeJobs++;
  return true;
}

export function releaseJob(): void {
  activeJobs = Math.max(0, activeJobs - 1);
}

export function getActiveJobs(): number {
  return activeJobs;
}

export { MAX_CONCURRENT, RATE_LIMIT_WINDOW_MS, MAX_REQUESTS_PER_WINDOW, PROCESS_TIMEOUT_MS };
