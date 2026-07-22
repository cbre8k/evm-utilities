// ============================================================
// routes/run.ts — POST /run  (stream cast/forge execution)
// ============================================================

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { config } from '../config';
import {
  PROJECT_ROOT,
  SOURCE_FOUNDRY_DIR,
  cleanupWorkspace,
  foundrySpawnEnv,
  locateFoundryBinaries,
  setupWorkspace,
} from '../services/foundryWorkspace';

const router = Router();

const MAX_CONCURRENT = config.jobs.maxConcurrent;
const PROCESS_TIMEOUT_MS = config.jobs.processTimeoutMs;
let activeJobs = 0;

// POST /run — streams cast/forge output back as chunked text
router.post('/', (req, res) => {
  // --- CONCURRENCY ---
  if (activeJobs >= MAX_CONCURRENT) {
    res.status(503).json({ error: 'Server is busy. Too many concurrent requests. Please retry shortly.' });
    return;
  }
  activeJobs++;

  const { type, inputs } = req.body;
  if (!type || !inputs) {
    activeJobs--;
    res.status(400).json({ error: 'Missing type or inputs' });
    return;
  }

  // SSE-style streaming
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (msg: string) => {
    try { res.write(msg); } catch {}
  };

  const bins = locateFoundryBinaries();
  const formatField = (f: string) => f === 'txHash' ? 'transaction hash' : f === 'rpcUrl' ? 'rpc url' : f;

  let command = '';
  let args: string[] = [];
  let tempDir = '';

  if (type === 'TRACE') {
    const required = ['txHash', 'rpcUrl'];
    const missing = required.filter((field: string) => !inputs[field]);
    if (missing.length > 0) {
      send(`Error: Missing ${missing.map(formatField).join(' and ')}\n`);
      activeJobs--;
      res.end();
      return;
    }
    command = bins.cast;
    args = ['run', inputs.txHash, '--rpc-url', inputs.rpcUrl];
    if (inputs.quick) args.push('--quick');
    args.push('--color', 'always');
    send(`> cast ${args.join(' ')}\r\n\r\n`);

  } else if (type === 'SIMULATE') {
    const sessionId = Math.random().toString(36).substring(7);
    tempDir = setupWorkspace(sessionId, inputs.scriptContent);
    command = bins.forge;
    args = ['test', '--mt', 'testSimulation', '-vvvv', '--decode-internal', '--color', 'always'];
    send(`> forge ${args.join(' ')}\r\n\r\n`);

  } else {
    send('Error: Unknown operation type\n');
    activeJobs--;
    res.end();
    return;
  }

  // Check foundry directory
  if (!fs.existsSync(SOURCE_FOUNDRY_DIR) && type === 'SIMULATE') {
    send('Error: Source foundry directory not found.\n');
    activeJobs--;
    res.end();
    return;
  }

  const cwd = tempDir || PROJECT_ROOT;
  const fakeHome = tempDir ? path.join(tempDir, '.home') : path.join(os.tmpdir(), '.foundry-home');
  if (!fs.existsSync(fakeHome)) fs.mkdirSync(fakeHome, { recursive: true });

  const child = spawn(command, args, {
    cwd,
    env: foundrySpawnEnv(fakeHome, bins),
  });

  let isAborted = false;

  req.on('close', () => {
    isAborted = true;
    try { child.kill('SIGTERM'); } catch {}
    activeJobs--;
  });

  child.stdout.on('data', (data) => {
    if (!isAborted) send(data.toString());
  });
  child.stderr.on('data', (data) => {
    if (!isAborted) send(data.toString());
  });

  child.on('error', (err) => {
    if (!isAborted) {
      send(`\r\nFailed to start subprocess: ${err.message}\r\n`);
      activeJobs--;
      res.end();
    }
  });

  child.on('close', (code) => {
    if (!isAborted) {
      send(`\r\nProcess exited with code ${code}`);
      activeJobs--;
      res.end();
    }
    if (tempDir) cleanupWorkspace(tempDir);
  });

  // Timeout safety net
  const timeout = setTimeout(() => {
    if (!isAborted) {
      try { child.kill('SIGTERM'); } catch {}
      send('\r\nProcess timed out.\r\n');
    }
  }, PROCESS_TIMEOUT_MS);

  child.on('close', () => clearTimeout(timeout));
});

export default router;
