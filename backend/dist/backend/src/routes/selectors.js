"use strict";
// ============================================================
// routes/selectors.ts — GET /selectors/:hex
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const selectorService_1 = require("../services/selectorService");
const router = (0, express_1.Router)();
// GET /selectors/0xa9059cbb
router.get('/:hex', async (req, res, next) => {
    try {
        const { hex } = req.params;
        if (!/^0x[0-9a-fA-F]{8}$/.test(hex)) {
            res.status(400).json({ error: 'Invalid 4-byte selector (must be 0x + 8 hex chars)' });
            return;
        }
        const result = await (0, selectorService_1.lookupSelector)(hex.toLowerCase());
        if (!result) {
            res.status(404).json({ error: 'Selector not found' });
            return;
        }
        res.json(result);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=selectors.js.map