"use strict";
// ============================================================
// services/foundryService.ts — spawns cast / forge
// ============================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSimulation = runSimulation;
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const projectRoot = path_1.default.resolve(__dirname, '../../../'); // evm-utilities root
const sourceFoundryDir = path_1.default.join(projectRoot, 'foundry');
// ── Binary resolution ─────────────────────────────────────────
function findBinaries() {
    const projectBin = path_1.default.join(projectRoot, 'bin');
    const homeDir = process.env.HOME || '/root';
    const userBin = path_1.default.join(homeDir, '.foundry/bin');
    if (fs_1.default.existsSync(path_1.default.join(projectBin, 'forge'))) {
        return { forge: path_1.default.join(projectBin, 'forge'), cast: path_1.default.join(projectBin, 'cast') };
    }
    if (fs_1.default.existsSync(path_1.default.join(userBin, 'forge'))) {
        return { forge: path_1.default.join(userBin, 'forge'), cast: path_1.default.join(userBin, 'cast') };
    }
    return { forge: 'forge', cast: 'cast' };
}
// ── Lightweight workspace ─────────────────────────────────────
function setupWorkspace(sessionId, scriptContent) {
    const tempDir = path_1.default.join(os_1.default.tmpdir(), `foundry-${sessionId}`);
    fs_1.default.mkdirSync(path_1.default.join(tempDir, 'test'), { recursive: true });
    fs_1.default.mkdirSync(path_1.default.join(tempDir, 'src'), { recursive: true });
    fs_1.default.mkdirSync(path_1.default.join(tempDir, '.home'), { recursive: true });
    const libSource = path_1.default.join(sourceFoundryDir, 'lib');
    const libDest = path_1.default.join(tempDir, 'lib');
    if (!fs_1.default.existsSync(libDest))
        fs_1.default.symlinkSync(libSource, libDest, 'dir');
    const configFiles = ['foundry.toml'];
    for (const file of configFiles) {
        const src = path_1.default.join(sourceFoundryDir, file);
        if (fs_1.default.existsSync(src))
            fs_1.default.copyFileSync(src, path_1.default.join(tempDir, file));
    }
    const counterSrc = path_1.default.join(sourceFoundryDir, 'src', 'Counter.sol');
    if (fs_1.default.existsSync(counterSrc)) {
        fs_1.default.copyFileSync(counterSrc, path_1.default.join(tempDir, 'src', 'Counter.sol'));
    }
    fs_1.default.writeFileSync(path_1.default.join(tempDir, 'test', 'Simulation.t.sol'), scriptContent);
    return tempDir;
}
function cleanupWorkspace(tempDir) {
    try {
        fs_1.default.rmSync(tempDir, { recursive: true, force: true });
    }
    catch { }
}
async function runSimulation(scriptContent, onChunk, signal) {
    const { forge } = findBinaries();
    const sessionId = Math.random().toString(36).substring(7);
    const tempDir = setupWorkspace(sessionId, scriptContent);
    const { projectBin, userBin } = resolvePaths();
    const fakeHome = path_1.default.join(tempDir, '.home');
    return new Promise((resolve) => {
        let outputBuf = '';
        const child = (0, child_process_1.spawn)(forge, ['test', '--mt', 'testSimulation', '-vvvv', '--color', 'always'], {
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
        });
        signal?.addEventListener('abort', () => {
            try {
                child.kill('SIGTERM');
            }
            catch { }
        });
        child.stdout.on('data', (d) => {
            const chunk = d.toString();
            outputBuf += chunk;
            onChunk(chunk);
        });
        child.stderr.on('data', (d) => {
            const chunk = d.toString();
            outputBuf += chunk;
            onChunk(chunk);
        });
        child.on('close', (code) => {
            cleanupWorkspace(tempDir);
            const exitCode = code ?? 1;
            const success = exitCode === 0 &&
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
    const projectBin = path_1.default.join(projectRoot, 'bin');
    const homeDir = process.env.HOME || '/root';
    const userBin = path_1.default.join(homeDir, '.foundry/bin');
    return { projectBin, userBin };
}
//# sourceMappingURL=foundryService.js.map