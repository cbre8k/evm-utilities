import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

export const dynamic = 'force-dynamic';

function copyRecursiveSync(src: string, dest: string, excludes: string[] = []) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = stats && stats.isDirectory();

  const basename = path.basename(src);
  if (excludes.includes(basename)) return;

  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
      // Ensure directory is writable
      try {
        fs.chmodSync(dest, 0o777);
      } catch (e) {
        console.warn(`Failed to chmod directory ${dest}`, e);
      }
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName), excludes);
    });
  } else {
    fs.copyFileSync(src, dest);
    // Ensure destination file is writable
    try {
      fs.chmodSync(dest, 0o666);
    } catch (e) {
      console.warn(`Failed to chmod ${dest}`, e);
    }
  }
}

export async function POST(req: NextRequest) {
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
        try { controller.close(); } catch {}
      });

      try {
        let args: string[] = [];
        let command = '';
        
        // --- 1. SETUP ENVIRONMENT ---
        const projectRoot = process.cwd();
        
        // For Vercel/Production: Use /tmp to allow writing
        const sessionId = Math.random().toString(36).substring(7);
        const tempDir = path.join(os.tmpdir(), `foundry-${sessionId}`);
        
        // Copy the 'foundry' template from the project to the temp dir
        const sourceFoundryDir = path.join(projectRoot, 'foundry');
        
        // Safety check: ensure source exists
        if (!fs.existsSync(sourceFoundryDir)) {
          send('Error: Source foundry directory not found.\n');
          controller.close();
          return;
        }

        // Copy everything to temp (expensive but necessary for isolation and read-only fs)
        // Optimization: In a real app, maybe only copy what's needed or pre-warm /tmp
        copyRecursiveSync(sourceFoundryDir, tempDir, ['out', 'cache', 'broadcast', '.git']);

        const foundryDir = tempDir;

        // --- 2. LOCATE BINARIES ---
        // Priority 1: Local 'bin' folder (deployed with app)
        // Priority 2: User's home .foundry (local dev)
        // Priority 3: Global PATH
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
        if (type === 'TRACE') {
          if (!inputs.txHash || !inputs.rpcUrl) {
            send('Error: Missing Tx Hash or RPC URL\n');
            controller.close();
            return;
          }
          command = castBin;
          args = ['run', inputs.txHash, '--rpc-url', inputs.rpcUrl, '--color', 'always'];
          
          send(`> cast ${args.join(' ')}\r\n\r\n`);

        } else if (type === 'SIMULATE') {
          // Validation
          const required = ['sender', 'to', 'calldata'];
          const missing = required.filter((field: string) => !inputs[field]);
          if (missing.length > 0) {
            send(`Error: Missing required fields: ${missing.join(', ')}\n`);
            controller.close();
            return;
          }
          
          // Write Test File relative to the TEMP foundry dir
          const testFile = path.join(foundryDir, 'test', 'Simulation.t.sol');
          
          // Ensure directory exists (it should after copy, but being safe)
          if (!fs.existsSync(path.dirname(testFile))) {
            fs.mkdirSync(path.dirname(testFile), { recursive: true });
          }

          fs.writeFileSync(testFile, inputs.scriptContent);
          
          command = forgeBin;
          // -vvvv for detailed traces
          args = ['test', '--mt', 'testSimulation', '-vvvv', '--color', 'always'];
          
          send(`> forge ${args.join(' ')}\r\n\r\n`);
        } else {
          send('Error: Unknown operation type\n');
          controller.close();
          return;
        }

        // --- 4. EXECUTE ---
        // Create a fake home directory for foundry to store its cache/config
        const fakeHome = path.join(tempDir, '.home');
        fs.mkdirSync(fakeHome, { recursive: true });

        child = spawn(command, args, {
          cwd: foundryDir,
          env: {
            ...process.env,
            // Ensure the binaries are in PATH if calling by name
            PATH: `${projectBin}:${userBin}:${process.env.PATH}`, 
            FORCE_COLOR: '1', // Force color for standard spawn
            TERM: 'xterm-256color', // Emulate a terminal
            COLUMNS: '100', // Force width for progress bars
            LINES: '24',    // Force height
            HOME: fakeHome // Override HOME so foundry writes to tmp
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
        });

        child.on('close', (code: any) => {
          if (!isAborted) {
            send(`\r\nProcess exited with code ${code}`);
            try { controller.close(); } catch {}
          }
          
          // CLEANUP: Remove temp dir
          try {
              fs.rmSync(tempDir, { recursive: true, force: true });
          } catch (e) {
              console.error("Failed to cleanup temp dir", e);
          }
        });

      } catch (err: any) {
        if (!isAborted) {
          send(`\r\nSystem Error: ${err.message}`);
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
