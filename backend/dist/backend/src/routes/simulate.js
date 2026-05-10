"use strict";
// ============================================================
// routes/simulate.ts — POST /simulate  (enqueue simulate job)
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const uuid_1 = require("uuid");
const rabbitmq_1 = require("../db/rabbitmq");
const redis_1 = require("../db/redis");
const Simulation_1 = require("../models/Simulation");
const config_1 = require("../config");
const router = (0, express_1.Router)();
// POST /simulate
// Body: { inputs: SimulationInputs & { rpcUrl, scriptContent } }
// Returns: { jobId }
router.post('/', async (req, res, next) => {
    try {
        const { inputs } = req.body;
        if (!inputs?.rpcUrl || !inputs?.scriptContent) {
            res.status(400).json({ error: 'inputs.rpcUrl and inputs.scriptContent are required' });
            return;
        }
        const jobId = (0, uuid_1.v4)();
        const redis = (0, redis_1.getRedis)();
        // Persist initial simulation record
        await Simulation_1.Simulation.create({ jobId, inputs, status: 'queued', output: '' });
        await redis.setex(`job:${jobId}:status`, config_1.config.ttl.job, 'queued');
        await (0, rabbitmq_1.publishJob)(rabbitmq_1.QUEUES.TX_SIMULATE, { jobId, inputs });
        res.json({ jobId });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=simulate.js.map