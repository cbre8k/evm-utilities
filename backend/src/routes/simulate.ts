// ============================================================
// routes/simulate.ts — POST /simulate  (enqueue simulate job)
// ============================================================

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { publishJob, QUEUES } from '../db/rabbitmq';
import { getRedis } from '../db/redis';
import { Simulation } from '../models/Simulation';
import { config } from '../config';

const router = Router();

// POST /simulate
// Body: { inputs: SimulationInputs & { rpcUrl, scriptContent } }
// Returns: { jobId }
router.post('/', async (req, res, next) => {
  try {
    const { inputs } = req.body as { inputs: Record<string, any> };

    if (!inputs?.rpcUrl || !inputs?.scriptContent) {
      res.status(400).json({ error: 'inputs.rpcUrl and inputs.scriptContent are required' });
      return;
    }

    const jobId = uuid();
    const redis = getRedis();

    // Persist initial simulation record
    await Simulation.create({ jobId, inputs, status: 'queued', output: '' });
    await redis.setex(`job:${jobId}:status`, config.ttl.job, 'queued');

    await publishJob(QUEUES.TX_SIMULATE, { jobId, inputs });

    res.json({ jobId });
  } catch (err) {
    next(err);
  }
});

export default router;
