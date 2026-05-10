"use strict";
// ============================================================
// services/shareService.ts — nanoid generation + CRUD
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTraceShare = createTraceShare;
exports.createSimulateShare = createSimulateShare;
exports.getShare = getShare;
const nanoid_1 = require("nanoid");
const Share_1 = require("../models/Share");
const redis_1 = require("../db/redis");
const SHARE_REDIS_PREFIX = 'share:';
// ── Create ───────────────────────────────────────────────────
async function createTraceShare(data) {
    // Idempotent: same txHash + chainId → same share
    const existing = await Share_1.Share.findOne({
        txHash: data.txHash.toLowerCase(),
        chainId: data.chainId,
        type: 'trace',
    });
    if (existing) {
        if (existing.txOverview && (!existing.txOverview.timestamp || !existing.txOverview.txType)) {
            existing.txOverview = {
                ...existing.txOverview,
                timestamp: existing.txOverview.timestamp ?? data.txOverview.timestamp,
                txType: existing.txOverview.txType ?? data.txOverview.txType,
            };
            await existing.save();
        }
        await refreshShareCache(existing);
        return existing;
    }
    const hash = (0, nanoid_1.nanoid)(10);
    const share = await Share_1.Share.create({
        hash,
        type: 'trace',
        rpcUrl: data.rpcUrl,
        chainId: data.chainId,
        txHash: data.txHash.toLowerCase(),
        txOverview: data.txOverview,
        normalizedTrace: data.normalizedTrace,
        tokenTransfers: data.tokenTransfers,
        decodedCalldata: data.decodedCalldata,
        decodedOutput: data.decodedOutput,
    });
    await refreshShareCache(share);
    return share;
}
async function createSimulateShare(data) {
    const hash = (0, nanoid_1.nanoid)(10);
    const share = await Share_1.Share.create({
        hash,
        type: 'simulate',
        rpcUrl: data.rpcUrl,
        simulateInputs: { ...data.inputs, rpcUrl: data.rpcUrl },
        simulateOutput: data.output,
        simulateExitCode: data.exitCode,
        simulateSuccess: data.success,
    });
    await refreshShareCache(share);
    return share;
}
// ── Read ─────────────────────────────────────────────────────
async function getShare(hash) {
    // 1. Redis
    const cached = await (0, redis_1.cacheGet)(SHARE_REDIS_PREFIX + hash);
    if (cached) {
        // increment view count asynchronously — don't block response
        Share_1.Share.updateOne({ hash }, { $inc: { viewCount: 1 } }).exec().catch(() => { });
        return cached;
    }
    // 2. MongoDB
    const share = await Share_1.Share.findOneAndUpdate({ hash }, { $inc: { viewCount: 1 } }, { new: true });
    if (!share)
        return null;
    await refreshShareCache(share);
    return share;
}
// ── Internal ─────────────────────────────────────────────────
async function refreshShareCache(share) {
    // Shares are permanent — no TTL
    await (0, redis_1.cacheSet)(SHARE_REDIS_PREFIX + share.hash, share.toObject());
}
//# sourceMappingURL=shareService.js.map