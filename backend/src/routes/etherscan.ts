// ============================================================
// routes/etherscan.ts — GET /etherscan/:chainId/:address
// ============================================================

import { Router } from 'express';
import { getContractSource } from '../services/etherscanService';

const router = Router();

router.get('/:chainId/:address', async (req, res, next) => {
  try {
    const { chainId, address } = req.params;
    const result = await getContractSource(Number(chainId), address);

    if (!result) {
      res.status(404).json({ error: 'Contract not verified on Etherscan' });
      return;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
