// ============================================================
// routes/selectors.ts — GET /selectors/:hex
// ============================================================

import { Router } from 'express';
import { lookupSelector } from '../services/selectorService';

const router = Router();

// GET /selectors/0xa9059cbb
router.get('/:hex', async (req, res, next) => {
  try {
    const { hex } = req.params;
    if (!/^0x[0-9a-fA-F]{8}$/.test(hex)) {
      res.status(400).json({ error: 'Invalid 4-byte selector (must be 0x + 8 hex chars)' });
      return;
    }

    const result = await lookupSelector(hex.toLowerCase());
    if (!result) {
      res.status(404).json({ error: 'Selector not found' });
      return;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
