"use strict";
// ============================================================
// middleware/rateLimiter.ts — Redis-backed sliding window
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimiter = rateLimiter;
const redis_1 = require("../db/redis");
const config_1 = require("../config");
function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string')
        return forwarded.split(',')[0].trim();
    return req.socket.remoteAddress ?? 'unknown';
}
async function rateLimiter(req, res, next) {
    try {
        const ip = getClientIp(req);
        const key = `rl:${ip}`;
        const now = Date.now();
        const windowMs = 60_000;
        const max = config_1.config.jobs.rateLimitPerMin;
        const redis = (0, redis_1.getRedis)();
        const pipe = redis.pipeline();
        pipe.zadd(key, now, String(now));
        pipe.zremrangebyscore(key, 0, now - windowMs);
        pipe.zcard(key);
        pipe.expire(key, Math.ceil(windowMs / 1000));
        const results = await pipe.exec();
        const count = results?.[2]?.[1] ?? 0;
        if (count > max) {
            res.status(429).json({
                error: 'Rate limit exceeded. Try again later.',
                retryAfterSeconds: 60,
            });
            return;
        }
    }
    catch {
        // Redis unavailable — fail open (allow request through)
    }
    next();
}
//# sourceMappingURL=rateLimiter.js.map