// ============================================================
// middleware/rateLimiter.ts — Redis-backed sliding window
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { getRedis } from '../db/redis';
import { config } from '../config';

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}

export async function rateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const ip = getClientIp(req);
    const key = `rl:${ip}`;
    const now = Date.now();
    const windowMs = 60_000;
    const max = config.jobs.rateLimitPerMin;

    const redis = getRedis();
    const pipe = redis.pipeline();
    pipe.zadd(key, now, String(now));
    pipe.zremrangebyscore(key, 0, now - windowMs);
    pipe.zcard(key);
    pipe.expire(key, Math.ceil(windowMs / 1000));
    const results = await pipe.exec();

    const count = (results?.[2]?.[1] as number) ?? 0;

    if (count > max) {
      res.status(429).json({
        error: 'Rate limit exceeded. Try again later.',
        retryAfterSeconds: 60,
      });
      return;
    }
  } catch {
    // Redis unavailable — fail open (allow request through)
  }

  next();
}
