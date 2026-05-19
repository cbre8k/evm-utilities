// ============================================================
// routes/etherscan.ts — GET /etherscan/:chainId/:address
// ============================================================

import { Router } from 'express';
import { getContractSource } from '../services/etherscanService';

const router = Router();

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

router.get('/:chainId/:address', async (req, res, next) => {
  try {
    const { chainId, address } = req.params;
    const chainIdNum = parseInt(chainId, 10);
    if (isNaN(chainIdNum) || chainIdNum <= 0) {
      res.status(400).json({ error: 'Invalid chainId' });
      return;
    }
    if (!ADDR_RE.test(address)) {
      res.status(400).json({ error: 'Invalid address' });
      return;
    }
    const result = await getContractSource(chainIdNum, address);

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
