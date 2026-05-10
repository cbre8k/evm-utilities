"use strict";
// ============================================================
// config.ts — central env var access
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.config = {
    port: parseInt(process.env.PORT || '4000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    mongo: {
        uri: process.env.MONGO_URI || 'mongodb://localhost:27017/evm-utilities',
    },
    redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
    },
    rabbitmq: {
        url: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
    },
    jobs: {
        processTimeoutMs: parseInt(process.env.PROCESS_TIMEOUT_MS || '120000', 10),
        maxConcurrent: parseInt(process.env.MAX_CONCURRENT_JOBS || '5', 10),
        rateLimitPerMin: parseInt(process.env.RATE_LIMIT_PER_MIN || '30', 10),
    },
    // Redis TTLs in seconds
    ttl: {
        trace: 3600, // 1 hour
        selector: 604800, // 7 days
        job: 3600, // 1 hour
        share: 0, // permanent (no TTL)
    },
};
//# sourceMappingURL=config.js.map