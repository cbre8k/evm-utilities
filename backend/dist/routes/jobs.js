"use strict";
// ============================================================
// routes/jobs.ts — GET /jobs/:jobId/stream  (SSE)
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const redis_1 = require("../db/redis");
const router = (0, express_1.Router)();
const POLL_INTERVAL_MS = 500;
// GET /jobs/:jobId/stream
// Server-Sent Events — streams job status until done/failed
router.get('/:jobId/stream', async (req, res) => {
    const { jobId } = req.params;
    const redis = (0, redis_1.getRedis)();
    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const send = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    const cleanup = () => {
        clearInterval(poller);
        res.end();
    };
    req.on('close', cleanup);
    let lastOutput = '';
    const poller = setInterval(async () => {
        try {
            const [status, rawOutput, shareHash] = await Promise.all([
                redis.get(`job:${jobId}:status`),
                redis.get(`job:${jobId}:output`),
                redis.get(`job:${jobId}:shareHash`),
            ]);
            // Parse output chunk to stream incrementally
            let parsed = null;
            if (rawOutput && rawOutput !== lastOutput) {
                lastOutput = rawOutput;
                try {
                    parsed = JSON.parse(rawOutput);
                }
                catch { }
            }
            if (!status) {
                send({ status: 'not_found' });
                cleanup();
                return;
            }
            if (status === 'queued' || status === 'running') {
                send({
                    status,
                    output: parsed?.output ?? '',
                    shareHash: shareHash ?? undefined,
                });
                return;
            }
            // Terminal states: done / failed
            if (status === 'done' || status === 'failed') {
                send({
                    status,
                    output: parsed?.output ?? '',
                    result: parsed,
                    shareHash: shareHash ?? undefined,
                    shareUrl: shareHash ? `/explorer?trace=${shareHash}` : undefined,
                    exitCode: parsed?.exitCode,
                    success: parsed?.success,
                    error: parsed?.error,
                });
                cleanup();
            }
        }
        catch (err) {
            console.error('[jobs/stream] poll error:', err);
            cleanup();
        }
    }, POLL_INTERVAL_MS);
});
// GET /jobs/:jobId — simple status poll (non-SSE fallback)
router.get('/:jobId', async (req, res, next) => {
    try {
        const { jobId } = req.params;
        const redis = (0, redis_1.getRedis)();
        const [status, rawOutput, shareHash] = await Promise.all([
            redis.get(`job:${jobId}:status`),
            redis.get(`job:${jobId}:output`),
            redis.get(`job:${jobId}:shareHash`),
        ]);
        if (!status) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }
        let result = null;
        if (rawOutput) {
            try {
                result = JSON.parse(rawOutput);
            }
            catch { }
        }
        res.json({ jobId, status, result, shareHash });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=jobs.js.map