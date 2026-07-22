// ============================================================
// workers/index.ts — starts all workers in one process
// ============================================================
import '../aliases'; // resolve @shared/* alias (compiled JS only) — must precede @shared imports

import { connectMongo } from '../db/mongo';
import { getRedis } from '../db/redis';
import { connectRabbitMQ } from '../db/rabbitmq';
import { startTraceWorker } from './traceWorker';
import { startSimulateWorker } from './simulateWorker';
import { startDecodeWorker } from './decodeWorker';
import { createLogger } from '@shared/utils/logger';

const log = createLogger('workers');

async function main() {
  log.info('starting...');

  await connectMongo();
  getRedis(); // init redis connection
  await connectRabbitMQ();

  await Promise.all([
    startTraceWorker(),
    startSimulateWorker(),
    startDecodeWorker(),
  ]);

  log.info('all workers running');
}

main().catch((err) => {
  log.error('fatal error:', err);
  process.exit(1);
});
