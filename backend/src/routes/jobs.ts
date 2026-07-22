// ============================================================
// routes/jobs.ts — GET /jobs/:jobId/stream  (SSE)
// ============================================================

import { Router } from 'express';
import { getRedis } from '../db/redis';
import { createLogger } from '@shared/utils/logger';

const log = createLogger('jobs/stream');

const router = Router();
const POLL_INTERVAL_MS = 500;

/** Shape of the JSON blob workers store under `job:<id>:output`. */
interface JobResultPayload {
  output?: string;
  exitCode?: number;
  success?: boolean;
  error?: string;
}

// GET /jobs/:jobId/stream
// Server-Sent Events — streams job status until done/failed
router.get('/:jobId/stream', async (req, res) => {
  const { jobId } = req.params;
  const redis = getRedis();
  let poller: NodeJS.Timeout | undefined;
  let closed = false;
  let lastOutputText = '';

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (data: object) => {
    if (closed || res.writableEnded) return;
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (poller) clearInterval(poller);
    if (!res.writableEnded) res.end();
  };

  req.on('close', cleanup);

  const poll = async () => {
    try {
      const [status, rawOutput, shareHash] = await Promise.all([
        redis.get(`job:${jobId}:status`),
        redis.get(`job:${jobId}:output`),
        redis.get(`job:${jobId}:shareHash`),
      ]);

      // Parse output chunk to stream incrementally
      let parsed: JobResultPayload | null = null;
      let outputDelta = '';
      if (rawOutput) {
        try { parsed = JSON.parse(rawOutput); } catch {}
        const outputText = typeof parsed?.output === 'string' ? parsed.output : '';
        if (outputText.length > lastOutputText.length) {
          outputDelta = outputText.slice(lastOutputText.length);
          lastOutputText = outputText;
        } else if (outputText !== lastOutputText) {
          outputDelta = outputText;
          lastOutputText = outputText;
        }
      }

      if (!status) {
        send({ status: 'not_found' });
        cleanup();
        return;
      }

      if (status === 'queued' || status === 'running') {
        send({
          status,
          output: outputDelta,
          shareHash: shareHash ?? undefined,
        });
        return;
      }

      // Terminal states: done / failed
      if (status === 'done' || status === 'failed') {
        send({
          status,
          output: parsed?.output ?? '',
          result: parsed,
          shareHash: shareHash ?? undefined,
          shareUrl: shareHash ? `/explorer?trace=${shareHash}` : undefined,
          exitCode: parsed?.exitCode,
          success: parsed?.success,
          error: parsed?.error,
        });
        cleanup();
      }
    } catch (err) {
      log.error('poll error:', err);
      cleanup();
    }
  };

  await poll();
  if (!closed) {
    poller = setInterval(poll, POLL_INTERVAL_MS);
  }
});

// GET /jobs/:jobId — simple status poll (non-SSE fallback)
router.get('/:jobId', async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const redis = getRedis();

    const [status, rawOutput, shareHash] = await Promise.all([
      redis.get(`job:${jobId}:status`),
      redis.get(`job:${jobId}:output`),
      redis.get(`job:${jobId}:shareHash`),
    ]);

    if (!status) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    let result: unknown = null;
    if (rawOutput) {
      try { result = JSON.parse(rawOutput); } catch {}
    }

    res.json({ jobId, status, result, shareHash });
  } catch (err) {
    next(err);
  }
});

export default router;
