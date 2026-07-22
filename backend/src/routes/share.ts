// ============================================================
// routes/share.ts — GET /share/:hash  (resolve share)
//                   POST /share        (create simulate share directly)
// ============================================================

import { Router } from 'express';
import { getShare, createSimulateShare } from '../services/shareService';
import type { ShareSimulateData } from '../types';

const router = Router();

// GET /share/:hash
router.get('/:hash', async (req, res, next) => {
  try {
    const { hash } = req.params;
    const share = await getShare(hash);

    if (!share) {
      res.status(404).json({ error: 'Share not found' });
      return;
    }

    res.json(share);
  } catch (err) {
    next(err);
  }
});

// POST /share — create a simulate share directly (for direct-spawn path)
// Body: { rpcUrl, inputs, output, exitCode, success }
router.post('/', async (req, res, next) => {
  try {
    const { rpcUrl, inputs, output, exitCode, success } = req.body as ShareSimulateData;

    if (!rpcUrl || !output) {
      res.status(400).json({ error: 'rpcUrl and output are required' });
      return;
    }

    const share = await createSimulateShare({ rpcUrl, inputs, output, exitCode, success });

    res.json({
      hash: share.hash,
      shareUrl: `/s/${share.hash}`,
      type: share.type,
      createdAt: share.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
