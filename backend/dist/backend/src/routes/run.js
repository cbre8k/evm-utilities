"use strict";
// ============================================================
// routes/run.ts — POST /run  (stream cast/forge execution)
// ============================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const child_process_1 = require("child_process");
const config_1 = require("../config");
const router = (0, express_1.Router)();
const MAX_CONCURRENT = config_1.config.jobs.maxConcurrent;
const PROCESS_TIMEOUT_MS = config_1.config.jobs.processTimeoutMs;
let activeJobs = 0;
// ── Foundry paths ────────────────────────────────────────────
const projectRoot = path_1.default.resolve(__dirname, '..', '..', '..');
const sourceFoundryDir = path_1.default.join(projectRoot, 'foundry');
function locateBinaries() {
    const projectBin = path_1.default.join(projectRoot, 'bin');
    const homeDir = process.env.HOME || '/root';
    const userBin = path_1.default.join(homeDir, '.foundry/bin');
    let forgeBin = 'forge';
    let castBin = 'cast';
    if (fs_1.default.existsSync(path_1.default.join(projectBin, 'forge'))) {
        forgeBin = path_1.default.join(projectBin, 'forge');
        castBin = path_1.default.join(projectBin, 'cast');
    }
    else if (fs_1.default.existsSync(path_1.default.join(userBin, 'forge'))) {
        forgeBin = path_1.default.join(userBin, 'forge');
        castBin = path_1.default.join(userBin, 'cast');
    }
    return { forgeBin, castBin, projectBin, userBin };
}
function setupLightWorkspace(sessionId, scriptContent) {
    const tempDir = path_1.default.join(os_1.default.tmpdir(), `foundry-${sessionId}`);
    fs_1.default.mkdirSync(path_1.default.join(tempDir, 'test'), { recursive: true });
    fs_1.default.mkdirSync(path_1.default.join(tempDir, 'src'), { recursive: true });
    fs_1.default.mkdirSync(path_1.default.join(tempDir, 'script'), { recursive: true });
    fs_1.default.mkdirSync(path_1.default.join(tempDir, '.home'), { recursive: true });
    const libSource = path_1.default.join(sourceFoundryDir, 'lib');
    const libDest = path_1.default.join(tempDir, 'lib');
    if (!fs_1.default.existsSync(libDest)) {
        fs_1.default.symlinkSync(libSource, libDest, 'dir');
    }
    const configFiles = ['foundry.toml'];
    for (const file of configFiles) {
        const src = path_1.default.join(sourceFoundryDir, file);
        if (fs_1.default.existsSync(src)) {
            fs_1.default.copyFileSync(src, path_1.default.join(tempDir, file));
        }
    }
    const counterSrc = path_1.default.join(sourceFoundryDir, 'src', 'Counter.sol');
    if (fs_1.default.existsSync(counterSrc)) {
        fs_1.default.copyFileSync(counterSrc, path_1.default.join(tempDir, 'src', 'Counter.sol'));
    }
    if (scriptContent) {
        fs_1.default.writeFileSync(path_1.default.join(tempDir, 'test', 'Simulation.t.sol'), scriptContent);
    }
    return tempDir;
}
function cleanupWorkspace(tempDir) {
    try {
        fs_1.default.rmSync(tempDir, { recursive: true, force: true });
    }
    catch (e) {
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
    const send = (msg) => {
        try {
            res.write(msg);
        }
        catch { }
    };
    const { forgeBin, castBin, projectBin, userBin } = locateBinaries();
    const formatField = (f) => f === 'txHash' ? 'transaction hash' : f === 'rpcUrl' ? 'rpc url' : f;
    let command = '';
    let args = [];
    let tempDir = '';
    if (type === 'TRACE') {
        const required = ['txHash', 'rpcUrl'];
        const missing = required.filter((field) => !inputs[field]);
        if (missing.length > 0) {
            send(`Error: Missing ${missing.map(formatField).join(' and ')}\n`);
            activeJobs--;
            res.end();
            return;
        }
        command = castBin;
        args = ['run', inputs.txHash, '--rpc-url', inputs.rpcUrl];
        if (inputs.quick)
            args.push('--quick');
        args.push('--color', 'always');
        send(`> cast ${args.join(' ')}\r\n\r\n`);
    }
    else if (type === 'SIMULATE') {
        const sessionId = Math.random().toString(36).substring(7);
        tempDir = setupLightWorkspace(sessionId, inputs.scriptContent);
        command = forgeBin;
        args = ['test', '--mt', 'testSimulation', '-vvvv', '--color', 'always'];
        send(`> forge ${args.join(' ')}\r\n\r\n`);
    }
    else {
        send('Error: Unknown operation type\n');
        activeJobs--;
        res.end();
        return;
    }
    // Check foundry directory
    if (!fs_1.default.existsSync(sourceFoundryDir) && type === 'SIMULATE') {
        send('Error: Source foundry directory not found.\n');
        activeJobs--;
        res.end();
        return;
    }
    const cwd = tempDir || projectRoot;
    const fakeHome = tempDir ? path_1.default.join(tempDir, '.home') : path_1.default.join(os_1.default.tmpdir(), '.foundry-home');
    if (!fs_1.default.existsSync(fakeHome))
        fs_1.default.mkdirSync(fakeHome, { recursive: true });
    const child = (0, child_process_1.spawn)(command, args, {
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
        try {
            child.kill('SIGTERM');
        }
        catch { }
        activeJobs--;
    });
    child.stdout.on('data', (data) => {
        if (!isAborted)
            send(data.toString());
    });
    child.stderr.on('data', (data) => {
        if (!isAborted)
            send(data.toString());
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
        if (tempDir)
            cleanupWorkspace(tempDir);
    });
    // Timeout safety net
    const timeout = setTimeout(() => {
        if (!isAborted) {
            try {
                child.kill('SIGTERM');
            }
            catch { }
            send('\r\nProcess timed out.\r\n');
        }
    }, PROCESS_TIMEOUT_MS);
    child.on('close', () => clearTimeout(timeout));
});
exports.default = router;
//# sourceMappingURL=run.js.map