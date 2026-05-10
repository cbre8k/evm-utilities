"use strict";
// ============================================================
// routes/sourcify.ts — GET /explorer/source/:chainId/:address
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const sourcifyService_1 = require("../services/sourcifyService");
const router = (0, express_1.Router)();
router.get('/:chainId/:address', async (req, res, next) => {
    try {
        const { chainId, address } = req.params;
        const result = await (0, sourcifyService_1.getVerifiedSource)(Number(chainId), address);
        if (!result) {
            res.status(404).json({ error: 'Contract not verified on Sourcify' });
            return;
        }
        res.json(result);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=sourcify.js.map