"use strict";
// ============================================================
// routes/explorer.ts — POST /explorer  (enqueue trace job)
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const uuid_1 = require("uuid");
const rabbitmq_1 = require("../db/rabbitmq");
const redis_1 = require("../db/redis");
const Trace_1 = require("../models/Trace");
const config_1 = require("../config");
const rpcService_1 = require("../services/rpcService");
const router = (0, express_1.Router)();
function normalizeTracePayload(trace) {
    return {
        chainId: trace.chainId,
        txOverview: trace.txOverview,
        normalizedTree: trace.normalizedTree,
        structLog: trace.structLog ?? [],
        addressLabels: trace.addressLabels ?? {},
        tokenLabels: trace.tokenLabels ?? {},
        allLogs: trace.allLogs ?? [],
        erc20Transfers: trace.erc20Transfers ?? [],
        erc721Transfers: trace.erc721Transfers ?? [],
        erc1155Transfers: trace.erc1155Transfers ?? [],
        nativeTransfers: trace.nativeTransfers ?? [],
        stateDiffs: trace.stateDiffs ?? [],
        gasTree: trace.gasTree,
        decodedCalldata: trace.decodedCalldata,
        decodedOutput: trace.decodedOutput,
        shareHash: trace.shareHash,
        shareUrl: trace.shareHash ? `/explorer?trace=${trace.shareHash}` : undefined,
    };
}
// GET /explorer/lookup?txHash=0x...&chainId=1
router.get('/lookup', async (req, res, next) => {
    try {
        const txHash = String(req.query.txHash ?? '').toLowerCase();
        const chainId = Number(req.query.chainId ?? 1);
        if (!txHash) {
            res.status(400).json({ error: 'txHash is required' });
            return;
        }
        const trace = await Trace_1.Trace.findOne({ txHash, chainId }).lean();
        if (!trace) {
            res.json({ found: false });
            return;
        }
        res.json({
            found: true,
            shareHash: trace.shareHash ?? undefined,
            traceId: String(trace._id),
            txHash,
            chainId,
        });
    }
    catch (err) {
        next(err);
    }
});
// GET /explorer/share/:hash
router.get('/share/:hash', async (req, res, next) => {
    try {
        const { hash } = req.params;
        const trace = await Trace_1.Trace.findOne({ shareHash: hash }).lean();
        if (!trace) {
            res.status(404).json({ error: 'Trace not found' });
            return;
        }
        res.json(normalizeTracePayload(trace));
    }
    catch (err) {
        next(err);
    }
});
// POST /explorer/overview
// Body: { txHash, rpcUrl, chainId? }
// Returns the lightweight transaction overview before the full trace job finishes.
router.post('/overview', async (req, res, next) => {
    try {
        const { txHash, rpcUrl, chainId } = req.body;
        if (!txHash || !rpcUrl) {
            res.status(400).json({ error: 'txHash and rpcUrl are required' });
            return;
        }
        const txOverview = await (0, rpcService_1.buildTxOverview)(rpcUrl, txHash.toLowerCase());
        res.json({ chainId: chainId ?? 1, txOverview });
    }
    catch (err) {
        next(err);
    }
});
// POST /explorer
// Body: { txHash, rpcUrl, chainId? }
// Returns: { jobId }
router.post('/', async (req, res, next) => {
    try {
        const { txHash, rpcUrl, chainId, verbose = false } = req.body;
        if (!txHash || !rpcUrl) {
            res.status(400).json({ error: 'txHash and rpcUrl are required' });
            return;
        }
        const normalizedHash = txHash.toLowerCase();
        const jobId = (0, uuid_1.v4)();
        const redis = (0, redis_1.getRedis)();
        await redis.setex(`job:${jobId}:status`, config_1.config.ttl.job, 'queued');
        await (0, rabbitmq_1.publishJob)(rabbitmq_1.QUEUES.TX_TRACE, {
            jobId,
            txHash: normalizedHash,
            rpcUrl,
            chainId: chainId ?? 1,
            verbose,
        });
        res.json({ jobId });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=explorer.js.map