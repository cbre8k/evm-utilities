import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import {
  getClientIp,
  checkRateLimit,
  acquireJob,
  releaseJob,
  PROCESS_TIMEOUT_MS,
} from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// --- PRE-WARM: Symlink-based workspace pool ---
// Instead of copying 2.8MB per request, use symlinks for immutable lib/
// and only write the mutable test file.

const projectRoot = process.cwd();
const sourceFoundryDir = path.join(projectRoot, 'foundry');

function setupLightWorkspace(sessionId: string, scriptContent?: string): string {
  const tempDir = path.join(os.tmpdir(), `foundry-${sessionId}`);

  // Create minimal directory structure
  fs.mkdirSync(path.join(tempDir, 'test'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'script'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, '.home'), { recursive: true });

  // Symlink immutable directories (lib is 1.2MB, read-only)
  const libSource = path.join(sourceFoundryDir, 'lib');
  const libDest = path.join(tempDir, 'lib');
  if (!fs.existsSync(libDest)) {
    fs.symlinkSync(libSource, libDest, 'dir');
  }

  // Copy only small config files (4KB total)
  const configFiles = ['foundry.toml'];
  for (const file of configFiles) {
    const src = path.join(sourceFoundryDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(tempDir, file));
    }
  }

  // Copy src/Counter.sol (needed for forge compilation context)
  const counterSrc = path.join(sourceFoundryDir, 'src', 'Counter.sol');
  if (fs.existsSync(counterSrc)) {
    fs.copyFileSync(counterSrc, path.join(tempDir, 'src', 'Counter.sol'));
  }

  // Write simulation test if provided
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

export async function POST(req: NextRequest) {
  // --- RATE LIMITING ---
  const ip = getClientIp(
    req.headers.get('x-forwarded-for'),
    req.headers.get('x-real-ip')
  );
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(rateCheck.retryAfterMs / 1000)) },
      }
    );
  }

  // --- CONCURRENCY LIMITING ---
  if (!acquireJob()) {
    return NextResponse.json(
      { error: 'Server is busy. Too many concurrent requests. Please retry shortly.' },
      { status: 503 }
    );
  }

  const body = await req.json();
  const { type, inputs } = body;
  
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (msg: string) => {
        try {
          controller.enqueue(encoder.encode(msg));
        } catch (e) {
          // Controller likely closed, ignore
        }
      };

      let child: any = null;
      let isAborted = false;

      // Handle client disconnect explicitly
      req.signal.addEventListener('abort', () => {
        isAborted = true;
        if (child) {
          try {
            child.kill('SIGTERM'); 
          } catch (e) {
            console.error('Failed to kill child process:', e);
          }
        }
        releaseJob();
        try { controller.close(); } catch {}
      });

      try {
        let args: string[] = [];
        let command = '';
        let tempDir = '';
        
        // --- 1. SETUP ENVIRONMENT ---
        // Safety check: ensure source exists
        if (!fs.existsSync(sourceFoundryDir)) {
          send('Error: Source foundry directory not found.\n');
          releaseJob();
          controller.close();
          return;
        }

        // --- 2. LOCATE BINARIES ---
        const projectBin = path.join(projectRoot, 'bin');
        const homeDir = process.env.HOME || '/root';
        const userBin = path.join(homeDir, '.foundry/bin');
        
        let forgeBin = 'forge';
        let castBin = 'cast';

        if (fs.existsSync(path.join(projectBin, 'forge'))) {
          forgeBin = path.join(projectBin, 'forge');
          castBin = path.join(projectBin, 'cast');
        } else if (fs.existsSync(path.join(userBin, 'forge'))) {
          forgeBin = path.join(userBin, 'forge');
          castBin = path.join(userBin, 'cast');
        }

        // --- 3. PREPARE COMMAND ---
        const formatField = (f: string) => f === 'txHash' ? 'transaction hash' : f === 'rpcUrl' ? 'rpc url' : f;

        if (type === 'TRACE') {
          const required = ['txHash', 'rpcUrl'];
          const missing = required.filter((field: string) => !inputs[field]);

          if (missing.length > 0) {
            send(`Error: Missing ${missing.map(formatField).join(' and ')}\n`);
            releaseJob();
            controller.close();
            return;
          }
          // Trace doesn't need a workspace — cast runs standalone
          command = castBin;
          args = ['run', inputs.txHash, '--rpc-url', inputs.rpcUrl];
          if (inputs.quick) args.push('--quick');
          args.push('--color', 'always');
          
          send(`> cast ${args.join(' ')}\r\n\r\n`);

        } else if (type === 'SIMULATE') {
          const required = ['sender', 'target', 'calldata', 'rpcUrl'];
          const missing = required.filter((field: string) => !inputs[field]);

          if (missing.length > 0) {
            send(`Error: Missing ${missing.map(formatField).join(', ')}\n`);
            releaseJob();
            controller.close();
            return;
          }
          
          // Lightweight workspace: symlink lib/, copy only config + test file
          const sessionId = Math.random().toString(36).substring(7);
          tempDir = setupLightWorkspace(sessionId, inputs.scriptContent);
          
          command = forgeBin;
          args = ['test', '--mt', 'testSimulation', '-vvvv', '--color', 'always'];
          
          send(`> forge ${args.join(' ')}\r\n\r\n`);
        } else {
          send('Error: Unknown operation type\n');
          releaseJob();
          controller.close();
          return;
        }

        // --- 4. EXECUTE ---
        const cwd = tempDir || projectRoot;
        const fakeHome = tempDir ? path.join(tempDir, '.home') : path.join(os.tmpdir(), '.foundry-home');
        if (!fs.existsSync(fakeHome)) fs.mkdirSync(fakeHome, { recursive: true });

        child = spawn(command, args, {
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
          }
        });

        child.stdout.on('data', (data: any) => {
          if (!isAborted) send(data.toString());
        });
        child.stderr.on('data', (data: any) => {
          if (!isAborted) send(data.toString());
        });

        child.on('error', (err: any) => {
          if (isAborted) return;
          send(`\r\nFailed to start subprocess: ${err.message}\r\n`);
          releaseJob();
        });

        child.on('close', (code: any) => {
          if (!isAborted) {
            send(`\r\nProcess exited with code ${code}`);
            releaseJob();
            try { controller.close(); } catch {}
          }
          
          // CLEANUP: Remove temp dir (only for simulate)
          if (tempDir) cleanupWorkspace(tempDir);
        });

      } catch (err: any) {
        if (!isAborted) {
          send(`\r\nSystem Error: ${err.message}`);
          releaseJob();
          try { controller.close(); } catch {}
        }
      }
    },
    cancel() {
      // Fallback cleanup if managing via stream reader cancel
    }
  });

  return new NextResponse(stream);
}
