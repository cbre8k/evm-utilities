"use strict";
// ============================================================
// services/selectorService.ts — 4byte / openchain lookup
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.lookupSelector = lookupSelector;
exports.decodeCalldata = decodeCalldata;
exports.decodeOutput = decodeOutput;
exports.decodeCalldataArgs = decodeCalldataArgs;
exports.decodeOutputArgs = decodeOutputArgs;
exports.lookupEventName = lookupEventName;
exports.lookupEventNames = lookupEventNames;
const Selector_1 = require("../models/Selector");
const redis_1 = require("../db/redis");
const config_1 = require("../config");
const sourcifyService_1 = require("./sourcifyService");
const selectors_1 = require("@shared/constants/selectors");
const OPENCHAIN_API = 'https://api.openchain.xyz/signature-database/v1/lookup';
// ── Main lookup entry point ──────────────────────────────────
async function lookupSelector(hex // "0xa9059cbb"
) {
    const normalizedHex = hex.toLowerCase().slice(0, 10); // ensure "0x" + 8 chars
    const cacheKey = `selector:${normalizedHex}`;
    // 1. Redis
    const cached = await (0, redis_1.cacheGet)(cacheKey);
    if (cached)
        return cached;
    // 2. MongoDB
    const dbEntry = await Selector_1.Selector.findOne({ hex: normalizedHex });
    if (dbEntry) {
        const result = {
            functionName: dbEntry.functionName,
            args: dbEntry.args.map(({ name, type }) => ({ name, type, value: '' })),
        };
        await (0, redis_1.cacheSet)(cacheKey, result, config_1.config.ttl.selector);
        return result;
    }
    // 3. 4byte API
    const result = await fetchFrom4byte(normalizedHex) ?? await fetchFromOpenchain(normalizedHex);
    if (!result)
        return null;
    // Persist — strip 'value' field, Selector only stores name+type
    const argsToStore = result.args.map(({ name, type }) => ({ name, type }));
    await Selector_1.Selector.findOneAndUpdate({ hex: normalizedHex }, { functionName: result.functionName, args: argsToStore, hex: normalizedHex, source: '4byte', cachedAt: new Date() }, { upsert: true, new: true });
    await (0, redis_1.cacheSet)(cacheKey, result, config_1.config.ttl.selector);
    return result;
}
// ── Decode calldata ──────────────────────────────────────────
async function decodeCalldata(input, address, chainId) {
    if (!input || input === '0x' || input.length < 10)
        return null;
    const selector = input.slice(0, 10);
    const verifiedDecoded = await decodeWithVerifiedAbi(input, selector, address, chainId);
    if (verifiedDecoded)
        return verifiedDecoded;
    const result = await lookupSelector(selector);
    if (!result)
        return null;
    return {
        selector,
        functionName: result.functionName,
        args: decodeCalldataArgs(input, result.args),
    };
}
async function decodeOutput(input, output, address, chainId) {
    if (!input || input === '0x' || input.length < 10 || !output || output === '0x')
        return null;
    const selector = input.slice(0, 10);
    const matchedAbi = await findVerifiedFunctionAbi(selector, address, chainId);
    if (!matchedAbi?.outputs?.length || !matchedAbi.name)
        return null;
    const values = decodeOutputArgs(output, matchedAbi.outputs);
    return {
        functionName: matchedAbi.name,
        values,
    };
}
async function decodeWithVerifiedAbi(input, selector, address, chainId) {
    const matchedAbi = await findVerifiedFunctionAbi(selector, address, chainId);
    if (!matchedAbi)
        return null;
    const abiArgs = Array.isArray(matchedAbi.inputs) ? matchedAbi.inputs : [];
    return {
        selector,
        functionName: matchedAbi.name ?? '',
        args: decodeCalldataArgs(input, abiArgs.map((param, index) => ({
            name: typeof param?.name === 'string' && param.name.trim() ? param.name : `arg${index}`,
            type: String(param?.type ?? ''),
        }))),
    };
}
async function findVerifiedFunctionAbi(selector, address, chainId) {
    if (!address || !chainId)
        return null;
    const [verifiedContract, selectorResult] = await Promise.all([
        (0, sourcifyService_1.getVerifiedSource)(chainId, address),
        lookupSelector(selector),
    ]);
    if (!verifiedContract?.abi?.length || !selectorResult)
        return null;
    const matchedAbi = verifiedContract.abi.find((entry) => {
        if (entry?.type !== 'function' || entry?.name !== selectorResult.functionName)
            return false;
        const inputs = Array.isArray(entry.inputs) ? entry.inputs : [];
        if (inputs.length !== selectorResult.args.length)
            return false;
        return inputs.every((param, index) => (normalizeAbiType(param?.type) === normalizeAbiType(selectorResult.args[index]?.type)));
    });
    return matchedAbi ?? null;
}
function normalizeAbiType(type) {
    return String(type ?? '').replace(/\s+/g, '');
}
// ── ABI value decoding (no external deps) ───────────────────
/**
 * Given the raw calldata hex (including 0x + 4-byte selector) and the
 * arg schema from the 4byte / openchain lookup, decode the actual values.
 */
function decodeCalldataArgs(input, args) {
    if (!input || input.length < 10 || args.length === 0) {
        return args.map(a => ({ ...a, value: '' }));
    }
    return decodeAbiValues(input.slice(10), args);
}
function decodeOutputArgs(output, outputs) {
    const normalizedOutputs = outputs.map((outputParam, index) => ({
        name: typeof outputParam?.name === 'string' && outputParam.name.trim() ? outputParam.name : `output${index}`,
        type: String(outputParam?.type ?? ''),
    }));
    return decodeAbiValues(output.startsWith('0x') ? output.slice(2) : output, normalizedOutputs);
}
function decodeAbiValues(data, args) {
    if (data.length < args.length * 64)
        return args.map(a => ({ ...a, value: '' }));
    try {
        return args.map((arg, i) => ({
            ...arg,
            value: abiDecodeParam(data, i * 32, arg.type),
        }));
    }
    catch {
        return args.map(a => ({ ...a, value: '' }));
    }
}
// word at byte offset n (64 hex chars = 32 bytes)
function w(data, byteOffset) {
    return (data.slice(byteOffset * 2, byteOffset * 2 + 64) || '').padStart(64, '0');
}
function abiDecodeParam(data, headByteOffset, type) {
    const head = w(data, headByteOffset);
    // Tuple / struct — skip complex decoding
    if (type.startsWith('('))
        return '(…)';
    // Fixed-size array: uint256[3], address[2], etc.
    const fixedArr = type.match(/^(.+)\[(\d+)\]$/);
    if (fixedArr) {
        const [, elemType, sizeStr] = fixedArr;
        const size = parseInt(sizeStr);
        const items = [];
        for (let i = 0; i < Math.min(size, 4); i++) {
            items.push(abiDecodeWord(w(data, headByteOffset + i * 32), elemType));
        }
        if (size > 4)
            items.push(`… +${size - 4}`);
        return `[${items.join(', ')}]`;
    }
    // Dynamic array: address[], uint256[], etc.
    if (type.endsWith('[]')) {
        const elemType = type.slice(0, -2);
        const dataOffset = parseInt(head, 16);
        if (dataOffset * 2 >= data.length)
            return '[…]';
        const len = parseInt(w(data, dataOffset), 16);
        if (len === 0)
            return '[]';
        if (len > 1000)
            return `[${len} items]`;
        const items = [];
        const base = dataOffset + 32;
        for (let i = 0; i < Math.min(len, 4); i++) {
            items.push(abiDecodeWord(w(data, base + i * 32), elemType));
        }
        if (len > 4)
            items.push(`… +${len - 4}`);
        return `[${items.join(', ')}]`;
    }
    // Dynamic bytes / string
    if (type === 'bytes' || type === 'string') {
        const dataOffset = parseInt(head, 16);
        if (dataOffset * 2 >= data.length)
            return type === 'string' ? '""' : '0x';
        const byteLen = parseInt(w(data, dataOffset), 16);
        if (byteLen === 0)
            return type === 'string' ? '""' : '0x';
        const raw = data.slice((dataOffset + 32) * 2, (dataOffset + 32 + Math.min(byteLen, 32)) * 2);
        if (type === 'string') {
            try {
                const str = Buffer.from(raw, 'hex').toString('utf8').replace(/\0/g, '');
                return byteLen > 32 ? `"${str.slice(0, 32)}…"` : `"${str}"`;
            }
            catch {
                return `0x${raw.slice(0, 16)}…`;
            }
        }
        return `0x${raw.slice(0, 32)}${byteLen > 16 ? '…' : ''}`;
    }
    return abiDecodeWord(head, type);
}
function abiDecodeWord(word, type) {
    if (type === 'address')
        return '0x' + word.slice(24).toLowerCase();
    if (type === 'bool')
        return parseInt(word, 16) !== 0 ? 'true' : 'false';
    if (type.startsWith('uint') || type.startsWith('int')) {
        try {
            return BigInt('0x' + word).toString();
        }
        catch {
            return '0x' + word;
        }
    }
    if (type.startsWith('bytes') && type.length > 5) {
        const n = parseInt(type.slice(5));
        if (!isNaN(n) && n >= 1 && n <= 32)
            return '0x' + word.slice(0, n * 2);
    }
    return '0x' + word;
}
// ── 4byte fetch ──────────────────────────────────────────────
async function fetchFrom4byte(hex) {
    try {
        const res = await fetch(`${selectors_1.FOURBYTE_API.LOOKUP}?function=${hex}`, {
            headers: { 'User-Agent': 'evm-utilities/1.0' },
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok)
            return null;
        const data = await res.json();
        const entries = data?.results ?? [];
        if (!entries.length)
            return null;
        const sig = entries[0].text_signature ?? entries[0].signature ?? '';
        return parseFunctionSig(sig);
    }
    catch {
        return null;
    }
}
// ── openchain fetch ──────────────────────────────────────────
async function fetchFromOpenchain(hex) {
    try {
        const res = await fetch(`${OPENCHAIN_API}?function=${hex}&filter=true`, { signal: AbortSignal.timeout(5000) });
        if (!res.ok)
            return null;
        const data = await res.json();
        const sigs = data?.result?.function?.[hex];
        if (!Array.isArray(sigs) || !sigs.length)
            return null;
        const sig = sigs[0].name ?? '';
        return parseFunctionSig(sig);
    }
    catch {
        return null;
    }
}
// ── Event name lookup by full topic0 hash ────────────────────
/**
 * Look up event name from a full 32-byte topic0 hash.
 * Tries: Redis cache → Sourcify ABI → 4byte API → OpenChain API.
 * Results are cached in Redis for future lookups.
 */
async function lookupEventName(topic0, emitterAddress, chainId) {
    const normalized = topic0.toLowerCase();
    const cacheKey = `event:${normalized}`;
    // 1. Redis cache
    const cached = await (0, redis_1.cacheGet)(cacheKey);
    if (cached)
        return cached;
    // 2. Sourcify ABI — match event entries by name
    if (emitterAddress && chainId) {
        try {
            const verified = await (0, sourcifyService_1.getVerifiedSource)(chainId, emitterAddress);
            if (verified?.abi?.length) {
                for (const entry of verified.abi) {
                    if (entry?.type !== 'event' || !entry?.name)
                        continue;
                    // We can't compute keccak256, but the 4byte API can resolve topic0
                    // for us. Just cache all event names from the ABI by looking up via API.
                }
            }
        }
        catch { /* skip */ }
    }
    // 3. 4byte Sourcify API — event lookup
    const name = await fetchEventFrom4byte(normalized) ?? await fetchEventFromOpenchain(normalized);
    if (!name)
        return null;
    await (0, redis_1.cacheSet)(cacheKey, name, config_1.config.ttl.selector);
    return name;
}
/**
 * Batch lookup event names for multiple topic0 hashes.
 * Returns a map: topic0 → event name.
 */
async function lookupEventNames(topic0s, emitterByTopic) {
    const result = new Map();
    const uncached = [];
    // Check Redis cache first
    for (const t of topic0s) {
        const normalized = t.toLowerCase();
        const cached = await (0, redis_1.cacheGet)(`event:${normalized}`);
        if (cached) {
            result.set(normalized, cached);
        }
        else {
            uncached.push(normalized);
        }
    }
    // Batch via OpenChain (supports comma-separated event hashes)
    if (uncached.length) {
        try {
            const batchResult = await fetchEventBatchFromOpenchain(uncached);
            for (const [topic, name] of batchResult) {
                result.set(topic, name);
                await (0, redis_1.cacheSet)(`event:${topic}`, name, config_1.config.ttl.selector);
            }
        }
        catch { /* skip */ }
    }
    // Fallback: individually via 4byte for any still missing
    for (const t of uncached) {
        if (result.has(t))
            continue;
        const emitter = emitterByTopic?.get(t);
        const name = await fetchEventFrom4byte(t);
        if (name) {
            result.set(t, name);
            await (0, redis_1.cacheSet)(`event:${t}`, name, config_1.config.ttl.selector);
        }
    }
    return result;
}
async function fetchEventFrom4byte(topic0) {
    try {
        const res = await fetch(`${selectors_1.FOURBYTE_API.LOOKUP}?event=${topic0}`, {
            headers: { 'User-Agent': 'evm-utilities/1.0' },
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok)
            return null;
        const data = await res.json();
        const sigs = data?.result?.event?.[topic0];
        if (!Array.isArray(sigs) || !sigs.length)
            return null;
        const sig = sigs[0].name ?? '';
        // "Transfer(address,address,uint256)" → "Transfer"
        const parenIdx = sig.indexOf('(');
        return parenIdx > 0 ? sig.slice(0, parenIdx) : sig || null;
    }
    catch {
        return null;
    }
}
async function fetchEventFromOpenchain(topic0) {
    try {
        const res = await fetch(`${OPENCHAIN_API}?event=${topic0}&filter=true`, { signal: AbortSignal.timeout(5000) });
        if (!res.ok)
            return null;
        const data = await res.json();
        const sigs = data?.result?.event?.[topic0];
        if (!Array.isArray(sigs) || !sigs.length)
            return null;
        const sig = sigs[0].name ?? '';
        const parenIdx = sig.indexOf('(');
        return parenIdx > 0 ? sig.slice(0, parenIdx) : sig || null;
    }
    catch {
        return null;
    }
}
async function fetchEventBatchFromOpenchain(topic0s) {
    const result = new Map();
    // OpenChain supports comma-separated hashes, max ~10 per request
    const batchSize = 10;
    for (let i = 0; i < topic0s.length; i += batchSize) {
        const batch = topic0s.slice(i, i + batchSize);
        try {
            const res = await fetch(`${OPENCHAIN_API}?event=${batch.join(',')}&filter=true`, { signal: AbortSignal.timeout(5000) });
            if (!res.ok)
                continue;
            const data = await res.json();
            const events = data?.result?.event;
            if (!events)
                continue;
            for (const topic of batch) {
                const sigs = events[topic];
                if (!Array.isArray(sigs) || !sigs.length)
                    continue;
                const sig = sigs[0].name ?? '';
                const parenIdx = sig.indexOf('(');
                const name = parenIdx > 0 ? sig.slice(0, parenIdx) : sig;
                if (name)
                    result.set(topic, name);
            }
        }
        catch { /* skip batch */ }
    }
    return result;
}
// ── Parse "transfer(address,uint256)" or "transfer(address to,uint256 amount)" ─
/** Split top-level comma-separated params, respecting nested parentheses */
function splitParams(raw) {
    const out = [];
    let depth = 0, cur = '';
    for (const ch of raw) {
        if (ch === '(')
            depth++;
        else if (ch === ')')
            depth--;
        if (ch === ',' && depth === 0) {
            out.push(cur.trim());
            cur = '';
        }
        else
            cur += ch;
    }
    if (cur.trim())
        out.push(cur.trim());
    return out;
}
function parseFunctionSig(sig) {
    const parenIdx = sig.indexOf('(');
    if (parenIdx === -1 || !sig.endsWith(')'))
        return null;
    const functionName = sig.slice(0, parenIdx).trim();
    const rawArgs = sig.slice(parenIdx + 1, -1).trim();
    const args = rawArgs
        ? splitParams(rawArgs).map((part, i) => {
            // "address to" → name=to, type=address
            // "uint256"    → name=arg0, type=uint256
            // "address[]"  → name=arg0, type=address[]
            const spaceIdx = part.lastIndexOf(' ');
            if (spaceIdx > 0) {
                const possibleName = part.slice(spaceIdx + 1);
                const possibleType = part.slice(0, spaceIdx).trim();
                if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(possibleName) && possibleType.length > 0) {
                    return { name: possibleName, type: possibleType, value: '' };
                }
            }
            return { name: `arg${i}`, type: part, value: '' };
        })
        : [];
    return { functionName, args };
}
//# sourceMappingURL=selectorService.js.map