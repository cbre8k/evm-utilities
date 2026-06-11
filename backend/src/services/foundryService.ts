// ============================================================
// services/foundryService.ts — spawns cast / forge
// ============================================================

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const projectRoot = path.resolve(__dirname, '../../../'); // evm-utilities root
const sourceFoundryDir = path.join(projectRoot, 'foundry');
const ANSI_ESCAPE_RE = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const FORK_RPC_RE = /vm\.createSelectFork\("([^"]+)"\)/;

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

function extractForkRpc(scriptContent: string): string | undefined {
  return scriptContent.match(FORK_RPC_RE)?.[1];
}

// ── Binary resolution ─────────────────────────────────────────

function findBinaries(): { forge: string; cast: string } {
  const projectBin = path.join(projectRoot, 'bin');
  const homeDir = process.env.HOME || '/root';
  const userBin = path.join(homeDir, '.foundry/bin');

  if (fs.existsSync(path.join(projectBin, 'forge'))) {
    return { forge: path.join(projectBin, 'forge'), cast: path.join(projectBin, 'cast') };
  }
  if (fs.existsSync(path.join(userBin, 'forge'))) {
    return { forge: path.join(userBin, 'forge'), cast: path.join(userBin, 'cast') };
  }
  return { forge: 'forge', cast: 'cast' };
}

// ── Lightweight workspace ─────────────────────────────────────

function setupWorkspace(sessionId: string, scriptContent: string): string {
  const tempDir = path.join(os.tmpdir(), `foundry-${sessionId}`);
  fs.mkdirSync(path.join(tempDir, 'test'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, '.home'), { recursive: true });

  const libSource = path.join(sourceFoundryDir, 'lib');
  const libDest = path.join(tempDir, 'lib');
  if (!fs.existsSync(libDest)) fs.symlinkSync(libSource, libDest, 'dir');

  const configFiles = ['foundry.toml'];
  for (const file of configFiles) {
    const src = path.join(sourceFoundryDir, file);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(tempDir, file));
  }

  const counterSrc = path.join(sourceFoundryDir, 'src', 'Counter.sol');
  if (fs.existsSync(counterSrc)) {
    fs.copyFileSync(counterSrc, path.join(tempDir, 'src', 'Counter.sol'));
  }

  fs.writeFileSync(path.join(tempDir, 'test', 'Simulation.t.sol'), scriptContent);
  return tempDir;
}

function cleanupWorkspace(tempDir: string): void {
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
}

// ── Run simulation ───────────────────────────────────────────

export interface FoundryResult {
  output: string;
  exitCode: number;
  success: boolean;
}

export async function runSimulation(
  scriptContent: string,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal
): Promise<FoundryResult> {
  const { forge } = findBinaries();
  const sessionId = Math.random().toString(36).substring(7);
  const forkRpc = extractForkRpc(scriptContent);
  onChunk(`[FOUNDRY] workspace_init session=${sessionId}\n`);
  if (forkRpc) {
    onChunk(`[FOUNDRY] fork_rpc=${maskRpcUrl(forkRpc)}\n`);
    console.log(`[foundryService] simulate fork rpc=${maskRpcUrl(forkRpc)}`);
  }
  const tempDir = setupWorkspace(sessionId, scriptContent);
  const { projectBin, userBin } = resolvePaths();
  const fakeHome = path.join(tempDir, '.home');

  return new Promise((resolve) => {
    let outputBuf = `[FOUNDRY] workspace_init session=${sessionId}\n`;
    if (forkRpc) {
      outputBuf += `[FOUNDRY] fork_rpc=${maskRpcUrl(forkRpc)}\n`;
    }
    const args = ['test', '--mt', 'testSimulation', '--decode-internal', '-vvvv', '--color', 'always'];
    const commandLine = `[FOUNDRY] spawn ${forge} ${args.join(' ')}\n`;
    outputBuf += commandLine;
    onChunk(commandLine);

    const child = spawn(
      forge,
      args,
      {
        cwd: tempDir,
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
      }
    );

    child.once('spawn', () => {
      const chunk = '[FOUNDRY] compile_and_test_started\n';
      outputBuf += chunk;
      onChunk(chunk);
    });

    signal?.addEventListener('abort', () => {
      const chunk = '[FOUNDRY] abort_signal\n';
      outputBuf += chunk;
      onChunk(chunk);
      try { child.kill('SIGTERM'); } catch {}
    });

    child.stdout.on('data', (d: Buffer) => {
      const chunk = d.toString();
      outputBuf += chunk;
      onChunk(chunk);
    });

    child.stderr.on('data', (d: Buffer) => {
      const chunk = d.toString();
      outputBuf += chunk;
      onChunk(chunk);
    });

    child.on('close', (code) => {
      cleanupWorkspace(tempDir);
      const exitCode = code ?? 1;
      const closeChunk = `[FOUNDRY] process_closed exitCode=${exitCode}\n`;
      outputBuf += closeChunk;
      onChunk(closeChunk);
      const plainOutput = outputBuf.replace(ANSI_ESCAPE_RE, '');
      const success =
        exitCode === 0 &&
        (plainOutput.includes('Suite result: ok') ||
          plainOutput.includes('[PASS]') ||
          plainOutput.includes('Transaction successfully executed'));
      resolve({ output: outputBuf, exitCode, success });
    });

    child.on('error', (err) => {
      cleanupWorkspace(tempDir);
      const msg = `\r\nFailed to start forge: ${err.message}\r\n`;
      outputBuf += msg;
      onChunk(msg);
      resolve({ output: outputBuf, exitCode: 1, success: false });
    });
  });
}

function resolvePaths() {
  const projectBin = path.join(projectRoot, 'bin');
  const homeDir = process.env.HOME || '/root';
  const userBin = path.join(homeDir, '.foundry/bin');
  return { projectBin, userBin };
}
