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

function maskRpcUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    if (url.username) url.username = '***';
    if (url.password) url.password = '***';

    for (const key of url.searchParams.keys()) {
      if (/key|token|secret|auth|api/i.test(key)) {
        url.searchParams.set(key, '***');
      }
    }

    const parts = url.pathname.split('/').filter(Boolean);
    const last = parts.at(-1);
    if (last && last.length > 12 && /[a-z0-9_-]{12,}/i.test(last)) {
      parts[parts.length - 1] = `${last.slice(0, 4)}...${last.slice(-4)}`;
      url.pathname = `/${parts.join('/')}`;
    }

    return url.toString();
  } catch {
    return rawUrl.replace(/([?&](?:api_?key|key|token|secret|auth)=)[^&]+/gi, '$1***');
  }
}

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
    console.log(`[simulate route] enqueue job=${jobId} rpc=${maskRpcUrl(inputs.rpcUrl)}`);

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
