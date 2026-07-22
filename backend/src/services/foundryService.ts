// ============================================================
// services/foundryService.ts — spawns cast / forge
// ============================================================

import { spawn } from 'child_process';
import path from 'path';
import { maskRpcUrl } from '@shared/utils/rpcUrl';
import {
  cleanupWorkspace,
  foundrySpawnEnv,
  locateFoundryBinaries,
  setupWorkspace,
} from './foundryWorkspace';
import { createLogger } from '@shared/utils/logger';

const log = createLogger('foundryService');

const ANSI_ESCAPE_RE = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const FORK_RPC_RE = /vm\.createSelectFork\("([^"]+)"\)/;

function extractForkRpc(scriptContent: string): string | undefined {
  return scriptContent.match(FORK_RPC_RE)?.[1];
}

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
  const bins = locateFoundryBinaries();
  const sessionId = Math.random().toString(36).substring(7);
  const forkRpc = extractForkRpc(scriptContent);
  onChunk(`[FOUNDRY] workspace_init session=${sessionId}\n`);
  if (forkRpc) {
    onChunk(`[FOUNDRY] fork_rpc=${maskRpcUrl(forkRpc)}\n`);
    log.info(`simulate fork rpc=${maskRpcUrl(forkRpc)}`);
  }
  const tempDir = setupWorkspace(sessionId, scriptContent);
  const fakeHome = path.join(tempDir, '.home');

  return new Promise((resolve) => {
    let outputBuf = `[FOUNDRY] workspace_init session=${sessionId}\n`;
    if (forkRpc) {
      outputBuf += `[FOUNDRY] fork_rpc=${maskRpcUrl(forkRpc)}\n`;
    }
    const args = ['test', '--mt', 'testSimulation', '--decode-internal', '-vvvv', '--color', 'always'];
    const commandLine = `[FOUNDRY] spawn ${bins.forge} ${args.join(' ')}\n`;
    outputBuf += commandLine;
    onChunk(commandLine);

    const child = spawn(
      bins.forge,
      args,
      {
        cwd: tempDir,
        env: foundrySpawnEnv(fakeHome, bins),
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
