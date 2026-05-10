"use strict";
// ============================================================
// routes/share.ts — GET /share/:hash  (resolve share)
//                   POST /share        (create simulate share directly)
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const shareService_1 = require("../services/shareService");
const router = (0, express_1.Router)();
// GET /share/:hash
router.get('/:hash', async (req, res, next) => {
    try {
        const { hash } = req.params;
        const share = await (0, shareService_1.getShare)(hash);
        if (!share) {
            res.status(404).json({ error: 'Share not found' });
            return;
        }
        res.json(share);
    }
    catch (err) {
        next(err);
    }
});
// POST /share — create a simulate share directly (for direct-spawn path)
// Body: { rpcUrl, inputs, output, exitCode, success }
router.post('/', async (req, res, next) => {
    try {
        const { rpcUrl, inputs, output, exitCode, success } = req.body;
        if (!rpcUrl || !output) {
            res.status(400).json({ error: 'rpcUrl and output are required' });
            return;
        }
        const share = await (0, shareService_1.createSimulateShare)({ rpcUrl, inputs, output, exitCode, success });
        res.json({
            hash: share.hash,
            shareUrl: `/s/${share.hash}`,
            type: share.type,
            createdAt: share.createdAt,
        });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=share.js.map