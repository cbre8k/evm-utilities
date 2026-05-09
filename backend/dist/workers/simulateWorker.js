"use strict";
// ============================================================
// workers/simulateWorker.ts — consumes tx.simulate queue
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.startSimulateWorker = startSimulateWorker;
const rabbitmq_1 = require("../db/rabbitmq");
const redis_1 = require("../db/redis");
const Simulation_1 = require("../models/Simulation");
const shareService_1 = require("../services/shareService");
const foundryService_1 = require("../services/foundryService");
const config_1 = require("../config");
async function startSimulateWorker() {
    await (0, rabbitmq_1.consumeQueue)(rabbitmq_1.QUEUES.TX_SIMULATE, handleSimulateJob);
}
async function handleSimulateJob(msg, _ch) {
    const { jobId, inputs } = JSON.parse(msg.content.toString());
    console.log(`[simulateWorker] processing job ${jobId}`);
    const redis = (0, redis_1.getRedis)();
    const statusKey = `job:${jobId}:status`;
    const outputKey = `job:${jobId}:output`;
    const shareHashKey = `job:${jobId}:shareHash`;
    try {
        await redis.setex(statusKey, config_1.config.ttl.job, 'running');
        await Simulation_1.Simulation.findOneAndUpdate({ jobId }, { status: 'running' });
        let accumulatedOutput = '';
        const result = await (0, foundryService_1.runSimulation)(inputs.scriptContent, async (chunk) => {
            accumulatedOutput += chunk;
            // Write chunk to Redis for SSE streaming
            await redis.setex(outputKey, config_1.config.ttl.job, JSON.stringify({ status: 'running', output: accumulatedOutput }));
        });
        // ── Persist result ────────────────────────────────────────
        const { from, to, calldata, value, blockNumber, shouldDealToken, tokenAddress, spender, amount, rpcUrl } = inputs;
        const share = await (0, shareService_1.createSimulateShare)({
            rpcUrl,
            inputs: { from, to, calldata, value, blockNumber,
                shouldDealToken, tokenAddress, spender, amount },
            output: result.output,
            exitCode: result.exitCode,
            success: result.success,
        });
        await Simulation_1.Simulation.findOneAndUpdate({ jobId }, {
            status: result.success ? 'done' : 'failed',
            output: result.output,
            exitCode: result.exitCode,
            success: result.success,
            shareHash: share.hash,
            completedAt: new Date(),
        });
        const finalPayload = JSON.stringify({
            status: 'done',
            output: result.output,
            exitCode: result.exitCode,
            success: result.success,
            shareHash: share.hash,
            shareUrl: `/s/${share.hash}`,
        });
        await redis.setex(statusKey, config_1.config.ttl.job, result.success ? 'done' : 'failed');
        await redis.setex(outputKey, config_1.config.ttl.job, finalPayload);
        await redis.setex(shareHashKey, config_1.config.ttl.job, share.hash);
        console.log(`[simulateWorker] done job ${jobId} — shareHash ${share.hash}`);
    }
    catch (err) {
        console.error(`[simulateWorker] error job ${jobId}:`, err.message);
        await redis.setex(statusKey, config_1.config.ttl.job, 'failed');
        await redis.setex(outputKey, config_1.config.ttl.job, JSON.stringify({ status: 'failed', error: err.message }));
        await Simulation_1.Simulation.findOneAndUpdate({ jobId }, { status: 'failed', completedAt: new Date() });
        throw err;
    }
}
//# sourceMappingURL=simulateWorker.js.map