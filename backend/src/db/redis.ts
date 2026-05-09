// ============================================================
// db/redis.ts — ioredis client singleton
// ============================================================

import Redis from 'ioredis';
import { config } from '../config';

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
      enableReadyCheck: true,
    });

    client.on('connect', () => console.log('[redis] connected'));
    client.on('error', (err) => console.error('[redis] error:', err));
    client.on('close', () => console.warn('[redis] connection closed'));
  }
  return client;
}

export async function getRedisStatus(): Promise<boolean> {
  try {
    const pong = await getRedis().ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

// ── Typed helpers ────────────────────────────────────────────

export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await getRedis().get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const json = JSON.stringify(value);
  if (ttlSeconds && ttlSeconds > 0) {
    await getRedis().setex(key, ttlSeconds, json);
  } else {
    await getRedis().set(key, json);
  }
}

export async function cacheDel(key: string): Promise<void> {
  await getRedis().del(key);
}
