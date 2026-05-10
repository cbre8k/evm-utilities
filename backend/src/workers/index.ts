// ============================================================
// workers/index.ts — starts all workers in one process
// ============================================================

import { connectMongo } from '../db/mongo';
import { getRedis } from '../db/redis';
import { connectRabbitMQ } from '../db/rabbitmq';
import { startTraceWorker } from './traceWorker';
import { startSimulateWorker } from './simulateWorker';
import { startDecodeWorker } from './decodeWorker';

async function main() {
  console.log('[workers] starting...');

  await connectMongo();
  getRedis(); // init redis connection
  await connectRabbitMQ();

  await Promise.all([
    startTraceWorker(),
    startSimulateWorker(),
    startDecodeWorker(),
  ]);

  console.log('[workers] all workers running');
}

main().catch((err) => {
  console.error('[workers] fatal error:', err);
  process.exit(1);
});
