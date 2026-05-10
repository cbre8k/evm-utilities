// ============================================================
// routes/health.ts
// ============================================================

import { Router } from 'express';
import { getMongoStatus } from '../db/mongo';
import { getRedisStatus } from '../db/redis';
import { getRabbitMQStatus } from '../db/rabbitmq';

const router = Router();

router.get('/', async (_req, res) => {
  const [mongo, redis, rabbitmq] = await Promise.all([
    Promise.resolve(getMongoStatus()),
    getRedisStatus(),
    getRabbitMQStatus(),
  ]);

  const ok = mongo && redis && rabbitmq;
  res.status(ok ? 200 : 503).json({
    ok,
    services: { mongo, redis, rabbitmq },
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

export default router;
