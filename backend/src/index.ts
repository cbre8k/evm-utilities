// ============================================================
// index.ts — Express app entry point
// ============================================================
import './aliases'; // resolve @shared/* alias (compiled JS only) — must precede @shared imports
import 'dotenv/config'; // must be first — loads .env before any other import

import express from 'express';
import cors from 'cors';
import { connectMongo } from './db/mongo';
import { getRedis } from './db/redis';
import { connectRabbitMQ } from './db/rabbitmq';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import healthRouter from './routes/health';
import explorerRouter from './routes/explorer';
import simulateRouter from './routes/simulate';
import jobsRouter from './routes/jobs';
import shareRouter from './routes/share';
import selectorsRouter from './routes/selectors';
import sourcifyRouter from './routes/sourcify';
import etherscanRouter from './routes/etherscan';
import runRouter from './routes/run';
import metricsRouter from './routes/metrics';
import { config } from './config';
import { createLogger } from '@shared/utils/logger';
import { errMessage } from '@shared/utils/errors';

const log = createLogger('server');

const app = express();

// ── Global middleware ─────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '2mb' }));
app.use(rateLimiter);

// ── Routes ───────────────────────────────────────────────────
app.use('/health', healthRouter);
app.use('/explorer', explorerRouter);
app.use('/simulate', simulateRouter);
app.use('/jobs', jobsRouter);
app.use('/share', shareRouter);
app.use('/selectors', selectorsRouter);
app.use('/sourcify', sourcifyRouter);
app.use('/etherscan', etherscanRouter);
app.use('/run', runRouter);
app.use('/metrics', metricsRouter);

// ── Error handler (must be last) ─────────────────────────────
app.use(errorHandler);

// ── Startup ───────────────────────────────────────────────────
async function start() {
  // Always start listening first — routes will return 503 if infra is down
  app.listen(config.port, () => {
    log.info(`listening on http://localhost:${config.port}`);
    log.info(`env: ${config.nodeEnv}`);
  });

  // Connect to infrastructure — non-fatal, will retry on each request
  connectMongo().catch((err) =>
    log.warn('mongo not available:', errMessage(err))
  );

  try {
    getRedis();
  } catch (err) {
    log.warn('redis not available:', errMessage(err));
  }

  connectRabbitMQ()
    .then(() => {
      // Start workers only when RabbitMQ is available
      import('./workers/index').catch((err) =>
        log.warn('workers failed to start:', errMessage(err))
      );
    })
    .catch((err) =>
      log.warn('rabbitmq not available (workers disabled):', errMessage(err))
    );
}

start().catch((err) => {
  log.error('fatal startup error:', err);
  process.exit(1);
});
