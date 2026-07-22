// ============================================================
// services/foundryWorkspace.ts — Foundry binary + workspace setup
// Shared by routes/run.ts (streaming) and foundryService.ts (jobs)
// ============================================================

import fs from 'fs';
import path from 'path';
import os from 'os';
import { createLogger } from '@shared/utils/logger';

const log = createLogger('foundry');

/**
 * Walk up from this file until we find the repo root (has package.json + foundry/).
 * Resolving by walking rather than a fixed `../../..` keeps this correct both
 * under tsx (backend/src/services) and compiled output (dist/backend/src/services).
 */
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
  return process.cwd();
}

export const PROJECT_ROOT = findProjectRoot();
export const SOURCE_FOUNDRY_DIR = path.join(PROJECT_ROOT, 'foundry');

export interface FoundryBinaries {
  forge: string;
  cast: string;
  /** Directories prepended to PATH so forge can invoke its siblings. */
  projectBin: string;
  userBin: string;
}

/**
 * Locate the forge/cast binaries. Checks the in-repo bin/ first (macOS dev via
 * scripts/install-foundry.js), then the Render build output, then a standard
 * foundryup install. Falls back to bare names so PATH can resolve them.
 */
export function locateFoundryBinaries(): FoundryBinaries {
  const projectBin = path.join(PROJECT_ROOT, 'bin');
  const homeDir = process.env.HOME || '/root';
  const userBin = path.join(homeDir, '.foundry/bin');

  const candidates = [
    projectBin,
    path.join(PROJECT_ROOT, 'backend', 'foundry-bin'),
    userBin,
    '/root/.foundry/bin',
    '/opt/render/.foundry/bin',
    '/opt/render/project/src/backend/foundry-bin',
    '/usr/local/bin',
  ];

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'forge'))) {
      return { forge: path.join(dir, 'forge'), cast: path.join(dir, 'cast'), projectBin, userBin };
    }
  }

  return { forge: 'forge', cast: 'cast', projectBin, userBin };
}

/**
 * Create an isolated Foundry project in tmp: symlinked lib/, copied config and
 * fixtures, and the caller's test script. Returns the workspace path.
 */
export function setupWorkspace(sessionId: string, scriptContent?: string): string {
  const tempDir = path.join(os.tmpdir(), `foundry-${sessionId}`);

  for (const sub of ['test', 'src', 'script', '.home']) {
    fs.mkdirSync(path.join(tempDir, sub), { recursive: true });
  }

  const libDest = path.join(tempDir, 'lib');
  if (!fs.existsSync(libDest)) {
    fs.symlinkSync(path.join(SOURCE_FOUNDRY_DIR, 'lib'), libDest, 'dir');
  }

  for (const file of ['foundry.toml']) {
    const src = path.join(SOURCE_FOUNDRY_DIR, file);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(tempDir, file));
  }

  const counterSrc = path.join(SOURCE_FOUNDRY_DIR, 'src', 'Counter.sol');
  if (fs.existsSync(counterSrc)) {
    fs.copyFileSync(counterSrc, path.join(tempDir, 'src', 'Counter.sol'));
  }

  if (scriptContent) {
    fs.writeFileSync(path.join(tempDir, 'test', 'Simulation.t.sol'), scriptContent);
  }

  return tempDir;
}

export function cleanupWorkspace(tempDir: string): void {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (err) {
    log.error(`failed to clean up ${tempDir}`, err);
  }
}

/**
 * Environment for a forge/cast child process: binaries on PATH, forced colour
 * so the frontend terminal renders ANSI, and HOME pinned inside the workspace
 * so concurrent runs never share Foundry's cache.
 */
export function foundrySpawnEnv(fakeHome: string, bins: FoundryBinaries): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: `${bins.projectBin}:${bins.userBin}:${process.env.PATH}`,
    FORCE_COLOR: '1',
    TERM: 'xterm-256color',
    COLUMNS: '100',
    LINES: '24',
    HOME: fakeHome,
    FOUNDRY_FUZZ_RUNS: '1',
  };
}
