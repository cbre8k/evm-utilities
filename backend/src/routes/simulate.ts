// ============================================================
// routes/simulate.ts — POST /simulate  (enqueue simulate job)
// ============================================================

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { publishJob, QUEUES } from '../db/rabbitmq';
import { getRedis } from '../db/redis';
import { Simulation } from '../models/Simulation';
import { config } from '../config';
import { maskRpcUrl } from '@shared/utils/rpcUrl';
import { createLogger } from '@shared/utils/logger';

const log = createLogger('simulate');

const router = Router();

// POST /simulate
// Body: { inputs: ForgeSimulationInputs | TraceCallManySimulationInputs }
// Returns: { jobId }
router.post('/', async (req, res, next) => {
  try {
    const { inputs } = req.body as { inputs: Record<string, any> };

    const isTraceCallManyJob = inputs?.mode === 'traceCallMany' && Array.isArray(inputs?.quotes);
    const isForgeJob = !!inputs?.scriptContent;

    if (!inputs?.rpcUrl || (!isTraceCallManyJob && !isForgeJob)) {
      res.status(400).json({ error: 'inputs.rpcUrl and either inputs.scriptContent or inputs.mode="traceCallMany" with inputs.quotes are required' });
      return;
    }

    const jobId = uuid();
    const redis = getRedis();
    log.info(`enqueue job=${jobId} rpc=${maskRpcUrl(inputs.rpcUrl)}`);

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
