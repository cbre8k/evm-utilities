// ============================================================
// routes/sourcify.ts — GET /explorer/source/:chainId/:address
// ============================================================

import { Router } from 'express';
import { getVerifiedSource } from '../services/sourcifyService';

const router = Router();

router.get('/:chainId/:address', async (req, res, next) => {
  try {
    const { chainId, address } = req.params;
    const result = await getVerifiedSource(Number(chainId), address);
    
    if (!result) {
      res.status(404).json({ error: 'Contract not verified on Sourcify' });
      return;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
