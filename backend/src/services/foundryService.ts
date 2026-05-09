// ============================================================
// services/foundryService.ts — spawns cast / forge
// ============================================================

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const projectRoot = path.resolve(__dirname, '../../../'); // evm-utilities root
const sourceFoundryDir = path.join(projectRoot, 'foundry');

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
  const tempDir = setupWorkspace(sessionId, scriptContent);
  const { projectBin, userBin } = resolvePaths();
  const fakeHome = path.join(tempDir, '.home');

  return new Promise((resolve) => {
    let outputBuf = '';

    const child = spawn(
      forge,
      ['test', '--mt', 'testSimulation', '-vvvv', '--color', 'always'],
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

    signal?.addEventListener('abort', () => {
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
      const success =
        exitCode === 0 &&
        (outputBuf.includes('Suite result: ok') ||
          outputBuf.includes('Transaction successfully executed'));
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
