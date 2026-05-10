"use strict";
// ============================================================
// services/rpcService.ts — JSON-RPC calls + full trace parsing
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChainId = getChainId;
exports.getCode = getCode;
exports.getTokenSymbol = getTokenSymbol;
exports.buildTokenLabelMap = buildTokenLabelMap;
exports.getTransaction = getTransaction;
exports.getTransactionReceipt = getTransactionReceipt;
exports.getBlockByNumber = getBlockByNumber;
exports.buildTxOverview = buildTxOverview;
exports.debugTraceTransaction = debugTraceTransaction;
exports.getPrestateTrace = getPrestateTrace;
exports.getFilteredStructLog = getFilteredStructLog;
exports.normalizeCallTree = normalizeCallTree;
exports.parseAllLogs = parseAllLogs;
exports.parseTokenTransfers = parseTokenTransfers;
exports.extractNativeTransfers = extractNativeTransfers;
exports.buildStateDiffs = buildStateDiffs;
exports.buildGasTree = buildGasTree;
const opcodes_1 = require("../utils/opcodes");
// ── EVM event topics ─────────────────────────────────────────
const SIG = {
    TRANSFER: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
    TRANSFER_SINGLE: '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62',
    TRANSFER_BATCH: '0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb',
    APPROVAL: '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925',
};
// ── Generic JSON-RPC ─────────────────────────────────────────
async function rpcCall(rpcUrl, method, params) {
    const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (!res.ok)
        throw new Error(`RPC HTTP ${res.status} for ${method}`);
    const data = await res.json();
    if (data.error)
        throw new Error(`RPC [${method}]: ${data.error.message}`);
    if (data.result === undefined)
        throw new Error(`RPC no result for ${method}`);
    return data.result;
}
function decodeAbiString(hex) {
    if (!hex || hex === '0x')
        return null;
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    try {
        if (clean.length === 64) {
            const bytes = Buffer.from(clean, 'hex');
            const value = bytes.toString('utf8').replace(/\0+$/g, '').trim();
            return value || null;
        }
        if (clean.length >= 192) {
            const offset = Number(BigInt(`0x${clean.slice(0, 64)}`));
            const lengthPos = offset * 2;
            const length = Number(BigInt(`0x${clean.slice(lengthPos, lengthPos + 64)}`));
            const valueHex = clean.slice(lengthPos + 64, lengthPos + 64 + length * 2);
            const value = Buffer.from(valueHex, 'hex').toString('utf8').replace(/\0+$/g, '').trim();
            return value || null;
        }
    }
    catch {
        return null;
    }
    return null;
}
// ── Chain / tx data ──────────────────────────────────────────
async function getChainId(rpcUrl) {
    const hex = await rpcCall(rpcUrl, 'eth_chainId', []);
    return parseInt(hex, 16);
}
async function getCode(rpcUrl, address) {
    return rpcCall(rpcUrl, 'eth_getCode', [address.toLowerCase(), 'latest']);
}
async function getTokenSymbol(rpcUrl, address) {
    try {
        const result = await rpcCall(rpcUrl, 'eth_call', [
            { to: address.toLowerCase(), data: '0x95d89b41' },
            'latest',
        ]);
        const symbol = decodeAbiString(result);
        if (!symbol)
            return null;
        if (!/^[\x20-\x7E]{1,32}$/.test(symbol))
            return null;
        return symbol;
    }
    catch {
        return null;
    }
}
async function buildTokenLabelMap(rpcUrl, tokenAddresses) {
    const unique = [...new Set(tokenAddresses.map(address => address.toLowerCase()).filter(Boolean))];
    const entries = await Promise.all(unique.map(async (address) => [address, await getTokenSymbol(rpcUrl, address)]));
    return Object.fromEntries(entries.filter(([, symbol]) => !!symbol));
}
async function getTransaction(rpcUrl, txHash) {
    return rpcCall(rpcUrl, 'eth_getTransactionByHash', [txHash]);
}
async function getTransactionReceipt(rpcUrl, txHash) {
    return rpcCall(rpcUrl, 'eth_getTransactionReceipt', [txHash]);
}
async function getBlockByNumber(rpcUrl, blockNumber) {
    return rpcCall(rpcUrl, 'eth_getBlockByNumber', [blockNumber, false]);
}
async function buildTxOverview(rpcUrl, txHash) {
    const [tx, receipt] = await Promise.all([
        getTransaction(rpcUrl, txHash),
        getTransactionReceipt(rpcUrl, txHash),
    ]);
    if (!tx)
        throw new Error(`Transaction not found: ${txHash}`);
    if (!receipt)
        throw new Error(`Receipt not found: ${txHash}`);
    const block = tx.blockNumber ? await getBlockByNumber(rpcUrl, tx.blockNumber) : null;
    return {
        hash: tx.hash,
        from: tx.from?.toLowerCase() ?? '',
        to: tx.to?.toLowerCase() ?? null,
        value: tx.value ?? '0x0',
        gasUsed: receipt.gasUsed ?? '0x0',
        gasLimit: tx.gas ?? '0x0',
        gasPrice: tx.gasPrice ?? tx.maxFeePerGas ?? '0x0',
        blockNumber: parseInt(tx.blockNumber, 16),
        blockHash: tx.blockHash,
        timestamp: block?.timestamp ? parseInt(block.timestamp, 16) : undefined,
        txType: tx.type ?? '0x0',
        txIndex: parseInt(tx.transactionIndex, 16),
        nonce: parseInt(tx.nonce, 16),
        status: receipt.status === '0x1' ? 'success' : 'failed',
        input: tx.input,
    };
}
// ── debug_traceTransaction (callTracer + withLog) ────────────
async function debugTraceTransaction(rpcUrl, txHash) {
    return rpcCall(rpcUrl, 'debug_traceTransaction', [
        txHash,
        { tracer: 'callTracer', tracerConfig: { withLog: true } },
    ]);
}
// ── debug_traceTransaction (prestateTracer diffMode) ─────────
async function getPrestateTrace(rpcUrl, txHash) {
    try {
        return await rpcCall(rpcUrl, 'debug_traceTransaction', [
            txHash,
            { tracer: 'prestateTracer', tracerConfig: { diffMode: true } },
        ]);
    }
    catch {
        // diffMode not supported — fall back to regular prestate
        try {
            const pre = await rpcCall(rpcUrl, 'debug_traceTransaction', [
                txHash,
                { tracer: 'prestateTracer' },
            ]);
            return { pre, post: {} };
        }
        catch {
            return null;
        }
    }
}
/**
 * Fetch the full structlog trace and filter to interesting opcodes only.
 * The raw structlog can be millions of entries — we keep only the subset
 * needed to show SLOAD/SSTORE, jumps, events, and call boundaries.
 */
async function getFilteredStructLog(rpcUrl, txHash, verbose = false) {
    try {
        const result = await rpcCall(rpcUrl, 'debug_traceTransaction', [
            txHash,
            { disableStack: false, disableMemory: true, disableStorage: false },
        ]);
        const out = [];
        const logs = result?.structLogs ?? [];
        const maxEntries = verbose ? 100000 : 25000;
        let truncated = false;
        for (let i = 0; i < logs.length; i++) {
            const e = logs[i];
            const depth = e.depth ?? 1;
            // Filter logic:
            // Always skip noise (PUSH, DUP, SWAP)
            if (e.op.startsWith('PUSH') || e.op.startsWith('DUP') || e.op.startsWith('SWAP'))
                continue;
            // If not verbose, only keep "interesting" ops
            if (!verbose && !opcodes_1.INTERESTING_OPS.has(e.op))
                continue;
            const entry = {
                pc: e.pc ?? 0,
                op: e.op ?? '',
                gas: e.gas ?? 0,
                gasCost: e.gasCost ?? 0,
                depth: depth,
                error: e.error,
            };
            // For SLOAD/SSTORE, extract slot + value from storage map
            if ((e.op === 'SLOAD' || e.op === 'SSTORE') && e.storage) {
                const slots = Object.entries(e.storage);
                if (slots.length > 0) {
                    const [key, val] = slots[slots.length - 1]; // last written slot
                    entry.storageKey = key;
                    entry.storagePost = val;
                    // Look ahead for the pre-value in the previous SLOAD for this slot
                    if (e.op === 'SSTORE' && i > 0) {
                        const prev = logs[i - 1];
                        if (prev?.storage?.[key] !== undefined) {
                            entry.storagePre = prev.storage[key];
                        }
                    }
                }
            }
            if ((e.op === 'JUMP' || e.op === 'JUMPI') && Array.isArray(e.stack) && e.stack.length > 0) {
                const top = String(e.stack[e.stack.length - 1]);
                entry.jumpTo = top.startsWith('0x') ? top : `0x${top}`;
                if (e.op === 'JUMPI' && e.stack.length > 1) {
                    const cond = String(e.stack[e.stack.length - 2]);
                    entry.jumpCondition = cond.startsWith('0x') ? cond : `0x${cond}`;
                }
                entry.jumpStack = e.stack
                    .slice(Math.max(0, e.stack.length - 8))
                    .reverse()
                    .map((value) => {
                    const hex = String(value);
                    return hex.startsWith('0x') ? hex : `0x${hex}`;
                });
            }
            if (e.op === 'JUMP' && Array.isArray(e.memory) && e.memory.length > 0) {
                entry.jumpMemory = e.memory
                    .slice(0, 8)
                    .map((value) => {
                    const hex = String(value);
                    return hex.startsWith('0x') ? hex : `0x${hex}`;
                });
            }
            out.push(entry);
            if (out.length >= maxEntries) {
                truncated = true;
                break;
            }
        }
        if (truncated && out.length > 0) {
            out[out.length - 1].truncated = true;
        }
        return out;
    }
    catch {
        // Structlog not supported by this node — return empty (feature degrades gracefully)
        return [];
    }
}
let nodeCounter = 0;
function normalizeCallTree(raw, parentId, depth = 0) {
    const id = `node-${nodeCounter++}`;
    const children = (raw.calls ?? []).map((c) => normalizeCallTree(c, id, depth + 1));
    // Inline logs from callTracer withLog:true
    const logs = (raw.logs ?? []).map((l) => ({
        address: (l.address ?? '').toLowerCase(),
        topics: l.topics ?? [],
        data: l.data ?? '0x',
    }));
    return {
        id,
        parentId,
        depth,
        type: (raw.type ?? 'CALL').toUpperCase(),
        from: (raw.from ?? '').toLowerCase(),
        to: raw.to ? raw.to.toLowerCase() : null,
        input: raw.input ?? '0x',
        output: raw.output ?? '0x',
        value: raw.value ?? '0x0',
        gas: raw.gas ?? '0x0',
        gasUsed: raw.gasUsed ?? '0x0',
        error: raw.error,
        revertReason: raw.revertReason,
        logs: logs.length > 0 ? logs : undefined,
        children,
    };
}
// ── Full log parsing (all types) ─────────────────────────────
function parseAllLogs(receipt) {
    const allLogs = [];
    const erc20Transfers = [];
    const erc721Transfers = [];
    const erc1155Transfers = [];
    if (!Array.isArray(receipt.logs))
        return { allLogs, erc20Transfers, erc721Transfers, erc1155Transfers };
    for (const log of receipt.logs) {
        const topic0 = log.topics?.[0]?.toLowerCase();
        const logIndex = parseInt(log.logIndex, 16);
        const address = log.address?.toLowerCase();
        // Base log entry
        const eventLog = {
            address,
            topics: log.topics ?? [],
            data: log.data ?? '0x',
            logIndex,
        };
        if (topic0 === SIG.TRANSFER) {
            const topicCount = log.topics.length;
            if (topicCount === 3) {
                // ERC-20 Transfer(address from, address to, uint256 value)
                const from = '0x' + log.topics[1].slice(26);
                const to = '0x' + log.topics[2].slice(26);
                const amount = log.data !== '0x' ? BigInt(log.data).toString() : '0';
                erc20Transfers.push({ tokenAddress: address, from: from.toLowerCase(), to: to.toLowerCase(), amount, logIndex });
                eventLog.eventName = 'Transfer';
                eventLog.decoded = { from: from.toLowerCase(), to: to.toLowerCase(), value: amount };
            }
            else if (topicCount === 4) {
                // ERC-721 Transfer(address from, address to, uint256 tokenId)
                const from = '0x' + log.topics[1].slice(26);
                const to = '0x' + log.topics[2].slice(26);
                const tokenId = BigInt(log.topics[3]).toString();
                erc721Transfers.push({ tokenAddress: address, from: from.toLowerCase(), to: to.toLowerCase(), tokenId, logIndex });
                eventLog.eventName = 'Transfer (ERC-721)';
                eventLog.decoded = { from: from.toLowerCase(), to: to.toLowerCase(), tokenId };
            }
        }
        else if (topic0 === SIG.TRANSFER_SINGLE) {
            // ERC-1155 TransferSingle(address operator, address from, address to, uint256 id, uint256 value)
            const operator = '0x' + log.topics[1].slice(26);
            const from = '0x' + log.topics[2].slice(26);
            const to = '0x' + log.topics[3].slice(26);
            const [id, value] = parseUint256Pair(log.data);
            erc1155Transfers.push({
                tokenAddress: address, operator: operator.toLowerCase(),
                from: from.toLowerCase(), to: to.toLowerCase(),
                id: id.toString(), value: value.toString(), logIndex, isBatch: false,
            });
            eventLog.eventName = 'TransferSingle (ERC-1155)';
        }
        else if (topic0 === SIG.TRANSFER_BATCH) {
            // ERC-1155 TransferBatch — data has dynamic arrays, skip deep decode
            const operator = '0x' + log.topics[1].slice(26);
            const from = '0x' + log.topics[2].slice(26);
            const to = '0x' + log.topics[3].slice(26);
            erc1155Transfers.push({
                tokenAddress: address, operator: operator.toLowerCase(),
                from: from.toLowerCase(), to: to.toLowerCase(),
                id: '(batch)', value: '(batch)', logIndex, isBatch: true,
            });
            eventLog.eventName = 'TransferBatch (ERC-1155)';
        }
        else if (topic0 === SIG.APPROVAL) {
            eventLog.eventName = 'Approval';
        }
        allLogs.push(eventLog);
    }
    return { allLogs, erc20Transfers, erc721Transfers, erc1155Transfers };
}
function parseUint256Pair(data) {
    try {
        const hex = data.startsWith('0x') ? data.slice(2) : data;
        const a = BigInt('0x' + hex.slice(0, 64));
        const b = BigInt('0x' + hex.slice(64, 128));
        return [a, b];
    }
    catch {
        return [0n, 0n];
    }
}
// ── ERC-20 Transfer (legacy helper, now uses parseAllLogs) ───
function parseTokenTransfers(receipt) {
    const { erc20Transfers } = parseAllLogs(receipt);
    return erc20Transfers.map(t => ({
        tokenAddress: t.tokenAddress,
        from: t.from,
        to: t.to,
        amount: t.amount,
        logIndex: t.logIndex,
    }));
}
// ── Native ETH transfers from call tree ──────────────────────
function extractNativeTransfers(node, out = []) {
    const val = node.value && node.value !== '0x0' && node.value !== '0x'
        ? BigInt(node.value)
        : 0n;
    if (val > 0n) {
        out.push({
            from: node.from,
            to: node.to || null,
            value: node.value,
            callType: node.type,
            depth: node.depth,
            callId: node.id,
        });
    }
    for (const child of node.children)
        extractNativeTransfers(child, out);
    return out;
}
// ── State diffs from prestateTracer ──────────────────────────
function buildStateDiffs(prestateResult) {
    if (!prestateResult)
        return [];
    const { pre = {}, post = {} } = prestateResult;
    const addresses = new Set([...Object.keys(pre), ...Object.keys(post)]);
    const diffs = [];
    for (const addr of addresses) {
        const p = pre[addr] ?? {};
        const q = post[addr] ?? {};
        const storageChanges = [];
        const allSlots = new Set([
            ...Object.keys(p.storage ?? {}),
            ...Object.keys(q.storage ?? {}),
        ]);
        for (const slot of allSlots) {
            const before = p.storage?.[slot] ?? '0x0';
            const after = q.storage?.[slot] ?? '0x0';
            if (before !== after) {
                storageChanges.push({ slot, before, after });
            }
        }
        const balBefore = p.balance;
        const balAfter = q.balance;
        const nonceBefore = p.nonce;
        const nonceAfter = q.nonce;
        const codeChanged = (p.code ?? '0x') !== (q.code ?? '0x') && !!(q.code && q.code !== '0x');
        if (balBefore !== balAfter ||
            nonceBefore !== nonceAfter ||
            codeChanged ||
            storageChanges.length > 0) {
            diffs.push({
                address: addr.toLowerCase(),
                balanceBefore: balBefore,
                balanceAfter: balAfter,
                nonceBefore,
                nonceAfter,
                codeChanged,
                storageChanges,
            });
        }
    }
    return diffs;
}
// ── Gas profiler tree ─────────────────────────────────────────
function buildGasTree(node, totalGas) {
    const gasUsed = parseHexOrDecimal(node.gasUsed);
    const gasLimit = parseHexOrDecimal(node.gas ?? node.gasUsed);
    const childrenNodes = node.children.map(c => buildGasTree(c, totalGas));
    const childrenGas = childrenNodes.reduce((s, c) => s + c.gasUsed, 0);
    const label = node.decodedFunction ?? node.to ?? node.from ?? node.type;
    return {
        id: node.id,
        label,
        gasUsed,
        gasLimit,
        selfGas: Math.max(0, gasUsed - childrenGas),
        depth: node.depth,
        children: childrenNodes,
    };
}
function parseHexOrDecimal(v) {
    if (!v)
        return 0;
    try {
        return Number(v.startsWith('0x') ? BigInt(v) : BigInt(v));
    }
    catch {
        return 0;
    }
}
//# sourceMappingURL=rpcService.js.map