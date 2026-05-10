// ============================================================
// routes/run.ts — POST /run  (stream cast/forge execution)
// ============================================================

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { config } from '../config';

const router = Router();

const MAX_CONCURRENT = config.jobs.maxConcurrent;
const PROCESS_TIMEOUT_MS = config.jobs.processTimeoutMs;
let activeJobs = 0;

// ── Foundry paths ────────────────────────────────────────────
// Walk up from __dirname until we find the repo root (has package.json + foundry/)
function findProjectRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'foundry')) && fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: assume CWD is project root
  return process.cwd();
}
const projectRoot = findProjectRoot();
const sourceFoundryDir = path.join(projectRoot, 'foundry');

function locateBinaries() {
  const projectBin = path.join(projectRoot, 'bin');
  const homeDir = process.env.HOME || '/root';
  const userBin = path.join(homeDir, '.foundry/bin');

  // Also check common install locations
  const candidates = [
    projectBin,
    userBin,
    '/root/.foundry/bin',
    '/opt/render/.foundry/bin',
    '/usr/local/bin',
  ];

  let forgeBin = '';
  let castBin = '';

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'forge'))) {
      forgeBin = path.join(dir, 'forge');
      castBin = path.join(dir, 'cast');
      console.log(`[run] found foundry binaries in ${dir}`);
      break;
    }
  }

  if (!forgeBin) {
    console.warn('[run] foundry binaries not found in:', candidates.join(', '));
    forgeBin = 'forge';
    castBin = 'cast';
  }

  return { forgeBin, castBin, projectBin, userBin };
}

function setupLightWorkspace(sessionId: string, scriptContent?: string): string {
  const tempDir = path.join(os.tmpdir(), `foundry-${sessionId}`);

  fs.mkdirSync(path.join(tempDir, 'test'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'script'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, '.home'), { recursive: true });

  const libSource = path.join(sourceFoundryDir, 'lib');
  const libDest = path.join(tempDir, 'lib');
  if (!fs.existsSync(libDest)) {
    fs.symlinkSync(libSource, libDest, 'dir');
  }

  const configFiles = ['foundry.toml'];
  for (const file of configFiles) {
    const src = path.join(sourceFoundryDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(tempDir, file));
    }
  }

  const counterSrc = path.join(sourceFoundryDir, 'src', 'Counter.sol');
  if (fs.existsSync(counterSrc)) {
    fs.copyFileSync(counterSrc, path.join(tempDir, 'src', 'Counter.sol'));
  }

  if (scriptContent) {
    fs.writeFileSync(path.join(tempDir, 'test', 'Simulation.t.sol'), scriptContent);
  }

  return tempDir;
}

function cleanupWorkspace(tempDir: string) {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (e) {
    console.error('Failed to cleanup temp dir', e);
  }
}

// POST /run — streams output as text
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

  const { forgeBin, castBin, projectBin, userBin } = locateBinaries();
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
    command = castBin;
    args = ['run', inputs.txHash, '--rpc-url', inputs.rpcUrl];
    if (inputs.quick) args.push('--quick');
    args.push('--color', 'always');
    send(`> cast ${args.join(' ')}\r\n\r\n`);

  } else if (type === 'SIMULATE') {
    const sessionId = Math.random().toString(36).substring(7);
    tempDir = setupLightWorkspace(sessionId, inputs.scriptContent);
    command = forgeBin;
    args = ['test', '--mt', 'testSimulation', '-vvvv', '--color', 'always'];
    send(`> forge ${args.join(' ')}\r\n\r\n`);

  } else {
    send('Error: Unknown operation type\n');
    activeJobs--;
    res.end();
    return;
  }

  // Check foundry directory
  if (!fs.existsSync(sourceFoundryDir) && type === 'SIMULATE') {
    send('Error: Source foundry directory not found.\n');
    activeJobs--;
    res.end();
    return;
  }

  const cwd = tempDir || projectRoot;
  const fakeHome = tempDir ? path.join(tempDir, '.home') : path.join(os.tmpdir(), '.foundry-home');
  if (!fs.existsSync(fakeHome)) fs.mkdirSync(fakeHome, { recursive: true });

  const child = spawn(command, args, {
    cwd,
    env: {
      ...process.env,
      PATH: `${projectBin}:${userBin}:${process.env.PATH}`,
      FORCE_COLOR: '1',
      TERM: 'xterm-256color',
      COLUMNS: '100',
      LINES: '24',
      HOME: fakeHome,
      FOUNDRY_FUZZ_RUNS: '1',
    },
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
