"use strict";
// ============================================================
// db/redis.ts — ioredis client singleton
// ============================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedis = getRedis;
exports.getRedisStatus = getRedisStatus;
exports.cacheGet = cacheGet;
exports.cacheSet = cacheSet;
exports.cacheDel = cacheDel;
const ioredis_1 = __importDefault(require("ioredis"));
const config_1 = require("../config");
let client = null;
function getRedis() {
    if (!client) {
        client = new ioredis_1.default(config_1.config.redis.url, {
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
async function getRedisStatus() {
    try {
        const pong = await getRedis().ping();
        return pong === 'PONG';
    }
    catch {
        return false;
    }
}
// ── Typed helpers ────────────────────────────────────────────
async function cacheGet(key) {
    const raw = await getRedis().get(key);
    if (!raw)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
async function cacheSet(key, value, ttlSeconds) {
    const json = JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
        await getRedis().setex(key, ttlSeconds, json);
    }
    else {
        await getRedis().set(key, json);
    }
}
async function cacheDel(key) {
    await getRedis().del(key);
}
//# sourceMappingURL=redis.js.map