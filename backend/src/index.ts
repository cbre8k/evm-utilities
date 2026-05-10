// ============================================================
// index.ts — Express app entry point
// ============================================================
import 'module-alias/register'; // resolve @shared/* path alias at runtime
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
import runRouter from './routes/run';
import { config } from './config';

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
app.use('/run', runRouter);

// ── Error handler (must be last) ─────────────────────────────
app.use(errorHandler);

// ── Startup ───────────────────────────────────────────────────
async function start() {
  // Always start listening first — routes will return 503 if infra is down
  app.listen(config.port, () => {
    console.log(`[server] listening on http://localhost:${config.port}`);
    console.log(`[server] env: ${config.nodeEnv}`);
  });

  // Connect to infrastructure — non-fatal, will retry on each request
  connectMongo().catch((err) =>
    console.warn('[server] mongo not available:', err.message)
  );

  try {
    getRedis();
  } catch (err: any) {
    console.warn('[server] redis not available:', err.message);
  }

  connectRabbitMQ()
    .then(() => {
      // Start workers only when RabbitMQ is available
      import('./workers/index').catch((err) =>
        console.warn('[server] workers failed to start:', err.message)
      );
    })
    .catch((err) =>
      console.warn('[server] rabbitmq not available (workers disabled):', err.message)
    );
}

start().catch((err) => {
  console.error('[server] fatal startup error:', err);
  process.exit(1);
});
