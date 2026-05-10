// Upstash Redis-based rate limiter & concurrency guard
// Works in Vercel serverless (REST-based, no persistent connections)

import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_JOBS || '5', 10);
const MAX_REQUESTS_PER_WINDOW = parseInt(process.env.RATE_LIMIT_PER_MIN || '10', 10);
const PROCESS_TIMEOUT_MS = parseInt(process.env.PROCESS_TIMEOUT_MS || '120000', 10); // 2 min

// ── Upstash Redis client ────────────────────────────────────
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// ── Sliding-window rate limiter ─────────────────────────────
const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(MAX_REQUESTS_PER_WINDOW, '1 m'),
  prefix: 'ratelimit:run',
});

const CONCURRENCY_KEY = 'evm-utils:active-jobs';

export function getClientIp(headerForwardedFor: string | null, headerRealIp: string | null): string {
  if (headerForwardedFor) {
    return headerForwardedFor.split(',')[0].trim();
  }
  return headerRealIp || 'unknown';
}

export async function checkRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number; retryAfterMs: number }> {
  const { success, remaining, reset } = await ratelimit.limit(ip);
  return {
    allowed: success,
    remaining,
    retryAfterMs: success ? 0 : Math.max(0, reset - Date.now()),
  };
}

export async function acquireJob(): Promise<boolean> {
  const current = await redis.incr(CONCURRENCY_KEY);
  if (current > MAX_CONCURRENT) {
    await redis.decr(CONCURRENCY_KEY);
    return false;
  }
  // Auto-expire the key as a safety net (2× timeout)
  await redis.expire(CONCURRENCY_KEY, Math.ceil((PROCESS_TIMEOUT_MS * 2) / 1000));
  return true;
}

export async function releaseJob(): Promise<void> {
  const val = await redis.decr(CONCURRENCY_KEY);
  if (val < 0) await redis.set(CONCURRENCY_KEY, 0);
}

export async function getActiveJobs(): Promise<number> {
  return (await redis.get<number>(CONCURRENCY_KEY)) ?? 0;
}

export { redis, MAX_CONCURRENT, MAX_REQUESTS_PER_WINDOW, PROCESS_TIMEOUT_MS };
