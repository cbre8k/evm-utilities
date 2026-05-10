"use strict";
// ============================================================
// routes/health.ts
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongo_1 = require("../db/mongo");
const redis_1 = require("../db/redis");
const rabbitmq_1 = require("../db/rabbitmq");
const router = (0, express_1.Router)();
router.get('/', async (_req, res) => {
    const [mongo, redis, rabbitmq] = await Promise.all([
        Promise.resolve((0, mongo_1.getMongoStatus)()),
        (0, redis_1.getRedisStatus)(),
        (0, rabbitmq_1.getRabbitMQStatus)(),
    ]);
    const ok = mongo && redis && rabbitmq;
    res.status(ok ? 200 : 503).json({
        ok,
        services: { mongo, redis, rabbitmq },
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
    });
});
exports.default = router;
//# sourceMappingURL=health.js.map