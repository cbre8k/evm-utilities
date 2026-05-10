"use strict";
// ============================================================
// workers/traceWorker.ts — full trace with all enrichments
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.startTraceWorker = startTraceWorker;
exports.buildTraceResultPayload = buildTraceResultPayload;
const rabbitmq_1 = require("../db/rabbitmq");
const redis_1 = require("../db/redis");
const Trace_1 = require("../models/Trace");
const Share_1 = require("../models/Share");
const Transaction_1 = require("../models/Transaction");
const shareService_1 = require("../services/shareService");
const rpcService_1 = require("../services/rpcService");
const selectorService_1 = require("../services/selectorService");
const sourcifyService_1 = require("../services/sourcifyService");
const config_1 = require("../config");
const sourceMap_1 = require("../utils/sourceMap");
function formatParamType(param) {
    if (!param || typeof param !== 'object')
        return 'unknown';
    if (param.typeDescriptions?.typeString)
        return String(param.typeDescriptions.typeString);
    if (param.typeName?.name)
        return String(param.typeName.name);
    if (param.typeName?.nodeType === 'ElementaryTypeName' && param.typeName?.name)
        return String(param.typeName.name);
    return 'unknown';
}
function collectTraceAddresses(node, out = new Set()) {
    if (node?.from)
        out.add(String(node.from).toLowerCase());
    if (node?.to)
        out.add(String(node.to).toLowerCase());
    for (const log of node?.logs ?? []) {
        if (log?.address)
            out.add(String(log.address).toLowerCase());
    }
    for (const child of node?.children ?? [])
        collectTraceAddresses(child, out);
    return [...out];
}
/** Set contract_name on every trace node from the resolved address labels. */
function setContractNames(node, labels, tokenLabels) {
    if (node?.to) {
        const key = node.to.toLowerCase();
        node.contract_name = labels[key] ?? tokenLabels[key] ?? undefined;
    }
    for (const child of node?.children ?? [])
        setContractNames(child, labels, tokenLabels);
}
async function buildAddressLabelMap(chainId, addresses, tokenLabels) {
    const unique = [...new Set(addresses.filter(Boolean).map(address => address.toLowerCase()))];
    const entries = await Promise.all(unique.map(async (address) => {
        if (tokenLabels[address])
            return [address, tokenLabels[address]];
        const name = await (0, sourcifyService_1.getVerifiedContractName)(chainId, address);
        return [address, name];
    }));
    return Object.fromEntries(entries.filter(([, label]) => !!label));
}
function parseSrc(src) {
    if (!src)
        return null;
    const [start, length, fileIndex] = src.split(':').map((value) => parseInt(value, 10));
    if ([start, length, fileIndex].some((value) => Number.isNaN(value)))
        return null;
    return { start, length, fileIndex };
}
function collectFunctionRanges(node, currentContract, out = []) {
    if (!node || typeof node !== 'object')
        return out;
    let nextContract = currentContract;
    if (node.nodeType === 'ContractDefinition' && typeof node.name === 'string') {
        nextContract = node.name;
    }
    if (node.nodeType === 'FunctionDefinition') {
        const loc = parseSrc(node.src);
        if (loc) {
            let name = node.name || '';
            if (node.kind === 'constructor')
                name = 'constructor';
            if (node.kind === 'fallback')
                name = 'fallback';
            if (node.kind === 'receive')
                name = 'receive';
            const qualified = nextContract ? `${nextContract}.${name || 'function'}` : (name || 'function');
            const params = Array.isArray(node.parameters?.parameters)
                ? node.parameters.parameters.map((param, index) => ({
                    name: param?.name || `arg${index}`,
                    type: formatParamType(param),
                }))
                : [];
            const returnsValue = Array.isArray(node.returnParameters?.parameters)
                ? node.returnParameters.parameters.length > 0
                : false;
            out.push({
                start: loc.start,
                end: loc.start + loc.length,
                label: qualified,
                functionName: name || 'function',
                fileIndex: loc.fileIndex,
                params,
                returnsValue,
            });
        }
    }
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) {
            for (const item of value)
                collectFunctionRanges(item, nextContract, out);
        }
        else if (value && typeof value === 'object') {
            collectFunctionRanges(value, nextContract, out);
        }
    }
    return out;
}
function findMatchingBrace(source, openIndex) {
    let depth = 0;
    for (let i = openIndex; i < source.length; i += 1) {
        const char = source[i];
        if (char === '{')
            depth += 1;
        if (char === '}') {
            depth -= 1;
            if (depth === 0)
                return i + 1;
        }
    }
    return source.length;
}
function maskSolidityComments(source) {
    return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n\r]*/g, (match) => match.replace(/[^\n\r]/g, ' '));
}
function parseFunctionParams(paramsText) {
    if (!paramsText.trim())
        return [];
    return paramsText
        .split(',')
        .map((raw, index) => {
        const parts = raw.trim().split(/\s+/).filter(Boolean);
        if (parts.length === 0)
            return { name: `arg${index}`, type: 'unknown' };
        const last = parts[parts.length - 1];
        const hasName = /^[A-Za-z_$][\w$]*$/.test(last) &&
            !['memory', 'storage', 'calldata', 'payable'].includes(last);
        const name = hasName ? last : `arg${index}`;
        const typeParts = hasName ? parts.slice(0, -1) : parts;
        const type = typeParts
            .filter((part) => !['memory', 'storage', 'calldata', 'payable'].includes(part))
            .join(' ') || 'unknown';
        return { name, type };
    });
}
function collectFunctionRangesFromSource(source, fileIndex, fallbackContract) {
    const ranges = [];
    const contracts = [];
    const searchableSource = maskSolidityComments(source);
    const contractPattern = /\b(?:abstract\s+)?(?:contract|library|interface)\s+([A-Za-z_$][\w$]*)[^{;]*\{/g;
    let contractMatch;
    while ((contractMatch = contractPattern.exec(searchableSource))) {
        const openIndex = searchableSource.indexOf('{', contractMatch.index);
        contracts.push({
            name: contractMatch[1],
            start: contractMatch.index,
            end: openIndex >= 0 ? findMatchingBrace(searchableSource, openIndex) : source.length,
        });
    }
    const functionPattern = /\b(function\s+([A-Za-z_$][\w$]*)|constructor|fallback|receive)\s*\(([^)]*)\)([^{;]*)[;{]/g;
    let functionMatch;
    while ((functionMatch = functionPattern.exec(searchableSource))) {
        const declarationEnd = functionPattern.lastIndex;
        const bodyStart = searchableSource[declarationEnd - 1] === '{' ? declarationEnd - 1 : -1;
        const enclosing = contracts
            .filter((contract) => functionMatch.index >= contract.start && functionMatch.index < contract.end)
            .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
        const contractName = enclosing?.name ?? fallbackContract ?? undefined;
        const kind = functionMatch[1];
        const functionName = kind.startsWith('function ')
            ? functionMatch[2]
            : kind;
        const end = bodyStart >= 0
            ? findMatchingBrace(searchableSource, bodyStart)
            : searchableSource.indexOf(';', declarationEnd - 1) + 1 || declarationEnd;
        const returnsValue = /\breturns\s*\(([^)]*)\)/.test(functionMatch[4] ?? '');
        const label = contractName ? `${contractName}.${functionName}` : functionName;
        ranges.push({
            start: functionMatch.index,
            end,
            label,
            functionName,
            fileIndex,
            params: parseFunctionParams(functionMatch[3] ?? ''),
            returnsValue,
        });
    }
    return ranges;
}
async function buildRuntimeAnnotator(chainId, address) {
    const info = await (0, sourcifyService_1.getRuntimeDebugInfo)(chainId, address);
    if (!info?.runtimeBytecode || !info.runtimeSourceMap)
        return null;
    const pcToInst = (0, sourceMap_1.buildPcToInstMapping)(info.runtimeBytecode);
    const locations = (0, sourceMap_1.parseSourceMap)(info.runtimeSourceMap);
    const outputSources = info.stdJsonOutput?.sources ?? {};
    const fileIndexToPath = new Map();
    Object.entries(outputSources).forEach(([path, sourceInfo]) => {
        const id = typeof sourceInfo?.id === 'number' ? sourceInfo.id : undefined;
        if (typeof id === 'number')
            fileIndexToPath.set(id, path);
    });
    const astFunctionRanges = Object.values(outputSources)
        .flatMap((sourceInfo) => collectFunctionRanges(sourceInfo?.ast))
        .sort((a, b) => (a.end - a.start) - (b.end - b.start));
    const sourceFunctionRanges = Object.entries(outputSources)
        .flatMap(([path, sourceInfo]) => {
        const fileIndex = typeof sourceInfo?.id === 'number' ? sourceInfo.id : undefined;
        const source = info.sources[path]?.content;
        if (typeof fileIndex !== 'number' || !source)
            return [];
        return collectFunctionRangesFromSource(source, fileIndex, info.contractName);
    })
        .sort((a, b) => (a.end - a.start) - (b.end - b.start));
    const functionRanges = astFunctionRanges.length > 0 ? astFunctionRanges : sourceFunctionRanges;
    return {
        annotatePc(pc) {
            const inst = pcToInst[pc];
            const loc = typeof inst === 'number' ? locations[inst] : undefined;
            if (!loc || loc.fileIndex < 0 || loc.start < 0)
                return {};
            const path = fileIndexToPath.get(loc.fileIndex);
            const source = path ? info.sources[path]?.content : undefined;
            const range = functionRanges.find((candidate) => candidate.fileIndex === loc.fileIndex &&
                loc.start >= candidate.start &&
                loc.start < candidate.end);
            return {
                sourceLabel: range?.label,
                sourceFile: path ? path.split('/').pop() ?? path : undefined,
                sourceLine: source ? (0, sourceMap_1.getLineForOffset)(source, loc.start) : undefined,
                sourceParams: range?.params,
                sourceFunction: range?.functionName,
                sourceReturnsValue: range?.returnsValue,
                sourceLocation: loc,
            };
        },
    };
}
function applySourceMeta(entry, meta) {
    if (meta.sourceLabel)
        entry.sourceLabel = meta.sourceLabel;
    if (meta.sourceFile)
        entry.sourceFile = meta.sourceFile;
    if (meta.sourceLine)
        entry.sourceLine = meta.sourceLine;
    if (meta.sourceLocation?.jump && meta.sourceLocation.jump !== '-') {
        entry.sourceJump = meta.sourceLocation.jump;
    }
}
function applyJumpTargetMeta(entry, meta) {
    if (meta.sourceLabel)
        entry.jumpTargetLabel = meta.sourceLabel;
    if (meta.sourceFile)
        entry.jumpTargetFile = meta.sourceFile;
    if (meta.sourceLine)
        entry.jumpTargetLine = meta.sourceLine;
    if (meta.sourceParams?.length)
        entry.jumpTargetParams = meta.sourceParams;
    if (meta.sourceFunction)
        entry.jumpTargetFunction = meta.sourceFunction;
    if (meta.sourceParams)
        entry.jumpTargetFunctionParams = meta.sourceParams.map((param) => param.name);
    if (typeof meta.sourceReturnsValue === 'boolean') {
        entry.jumpTargetFunctionReturnsValue = meta.sourceReturnsValue;
    }
}
function parseJumpDestination(jumpTo) {
    if (!jumpTo)
        return null;
    const pc = Number.parseInt(String(jumpTo).replace(/^0x/i, ''), 16);
    return Number.isNaN(pc) ? null : pc;
}
class JumpDispatcher {
    pendingJumpIn = null;
    dispatch(entry, annotator) {
        const currentMeta = annotator.annotatePc(entry.pc);
        applySourceMeta(entry, currentMeta);
        if (entry.op === 'JUMPDEST') {
            this.handleJumpDest(entry, currentMeta);
            return;
        }
        if (entry.op !== 'JUMP')
            return;
        const targetPc = parseJumpDestination(entry.jumpTo);
        if (targetPc === null) {
            this.pendingJumpIn = null;
            return;
        }
        const targetMeta = annotator.annotatePc(targetPc);
        applyJumpTargetMeta(entry, targetMeta);
        const jumpKind = currentMeta.sourceLocation?.jump;
        if (jumpKind === 'i') {
            this.pendingJumpIn = { entry, targetPc };
        }
        else {
            this.pendingJumpIn = null;
        }
    }
    handleJumpDest(entry, meta) {
        if (!this.pendingJumpIn)
            return;
        if (this.pendingJumpIn.targetPc !== entry.pc) {
            this.pendingJumpIn = null;
            return;
        }
        applyJumpTargetMeta(this.pendingJumpIn.entry, meta);
        this.pendingJumpIn = null;
    }
}
async function annotateStructLogWithSourceLabels(structLog, root, chainId) {
    if (!structLog.length)
        return structLog;
    const annotated = [...structLog];
    const callQueue = [];
    const annotatorCache = new Map();
    const dispatchers = new Map();
    function collectCalls(node) {
        for (const child of node?.children ?? []) {
            callQueue.push(child);
            collectCalls(child);
        }
    }
    collectCalls(root);
    const activeFrames = [root];
    let callIdx = 0;
    for (let i = 0; i < annotated.length; i += 1) {
        const entry = annotated[i];
        const frameDepth = Math.max(0, (entry.depth ?? 1) - 1);
        const rowDepth = Math.max(1, entry.depth ?? 1);
        activeFrames.length = frameDepth + 1;
        const currentFrame = activeFrames[frameDepth] ?? root;
        const currentAddress = (currentFrame?.to ?? currentFrame?.from ?? '').toLowerCase();
        if ((entry.op === 'CALL' || entry.op === 'CALLCODE' || entry.op === 'STATICCALL' || entry.op === 'DELEGATECALL' || entry.op === 'CREATE' || entry.op === 'CREATE2')) {
            const node = callQueue[callIdx++] ?? null;
            if (node)
                activeFrames[rowDepth] = node;
        }
        if (entry.op !== 'JUMP' && entry.op !== 'JUMPI' && entry.op !== 'JUMPDEST')
            continue;
        if (!currentAddress)
            continue;
        if (!annotatorCache.has(currentAddress)) {
            annotatorCache.set(currentAddress, await buildRuntimeAnnotator(chainId, currentAddress));
        }
        const annotator = annotatorCache.get(currentAddress);
        if (!annotator)
            continue;
        const dispatcherKey = `${frameDepth}:${currentAddress}`;
        const dispatcher = dispatchers.get(dispatcherKey) ?? new JumpDispatcher();
        dispatchers.set(dispatcherKey, dispatcher);
        if (entry.op === 'JUMP') {
            dispatcher.dispatch(entry, annotator);
            continue;
        }
        if (entry.op === 'JUMPDEST') {
            dispatcher.dispatch(entry, annotator);
            continue;
        }
        const meta = annotator.annotatePc(entry.pc);
        applySourceMeta(entry, meta);
        const targetPc = parseJumpDestination(entry.jumpTo);
        if (targetPc !== null) {
            applyJumpTargetMeta(entry, annotator.annotatePc(targetPc));
        }
    }
    return annotated;
}
async function startTraceWorker() {
    await (0, rabbitmq_1.consumeQueue)(rabbitmq_1.QUEUES.TX_TRACE, handleTraceJob);
}
async function buildTraceResultPayload(rpcUrl, txHash, chainId, verbose = false) {
    const [txOverview, rawCallTree, receipt, prestateResult, rawStructLog] = await Promise.all([
        (0, rpcService_1.buildTxOverview)(rpcUrl, txHash),
        (0, rpcService_1.debugTraceTransaction)(rpcUrl, txHash),
        (0, rpcService_1.getTransactionReceipt)(rpcUrl, txHash),
        (0, rpcService_1.getPrestateTrace)(rpcUrl, txHash),
        (0, rpcService_1.getFilteredStructLog)(rpcUrl, txHash, verbose),
    ]);
    const normalizedTree = (0, rpcService_1.normalizeCallTree)(rawCallTree);
    const structLog = await annotateStructLogWithSourceLabels(rawStructLog, normalizedTree, chainId);
    const { allLogs, erc20Transfers, erc721Transfers, erc1155Transfers, } = (0, rpcService_1.parseAllLogs)(receipt);
    // Enrich inline trace logs with event names from decoded receipt logs
    const eventNameByTopic = new Map();
    for (const log of allLogs) {
        if (log.eventName && log.topics?.[0]) {
            eventNameByTopic.set(log.topics[0].toLowerCase(), log.eventName);
        }
    }
    await enrichTreeLogs(normalizedTree, eventNameByTopic);
    // Apply resolved names back to allLogs for frontend consumption
    for (const log of allLogs) {
        if (!log.eventName && log.topics?.[0]) {
            const name = eventNameByTopic.get(log.topics[0].toLowerCase());
            if (name)
                log.eventName = name;
        }
    }
    const nativeTransfers = (0, rpcService_1.extractNativeTransfers)(normalizedTree);
    const stateDiffs = (0, rpcService_1.buildStateDiffs)(prestateResult);
    const gasTree = (0, rpcService_1.buildGasTree)(normalizedTree, parseInt(txOverview.gasUsed, 16));
    const decodedCalldata = txOverview.input
        ? await (0, selectorService_1.decodeCalldata)(txOverview.input, txOverview.to, chainId)
        : undefined;
    const decodedOutput = txOverview.input && normalizedTree.output
        ? await (0, selectorService_1.decodeOutput)(txOverview.input, normalizedTree.output, txOverview.to, chainId)
        : undefined;
    const tokenLabels = await (0, rpcService_1.buildTokenLabelMap)(rpcUrl, erc20Transfers.map(transfer => transfer.tokenAddress));
    const addressLabels = await buildAddressLabelMap(chainId, collectTraceAddresses(normalizedTree), tokenLabels);
    setContractNames(normalizedTree, addressLabels, tokenLabels);
    await annotateTree(normalizedTree, chainId);
    return {
        chainId,
        txOverview,
        normalizedTree,
        structLog,
        addressLabels,
        tokenLabels,
        allLogs,
        erc20Transfers,
        erc721Transfers,
        erc1155Transfers,
        nativeTransfers,
        stateDiffs,
        gasTree,
        decodedCalldata,
        decodedOutput,
    };
}
async function handleTraceJob(msg, _ch) {
    const { jobId, txHash, rpcUrl, chainId: providedChainId, verbose = false } = JSON.parse(msg.content.toString());
    console.log(`[traceWorker] processing job ${jobId} — tx ${txHash}`);
    const redis = (0, redis_1.getRedis)();
    const statusKey = `job:${jobId}:status`;
    const outputKey = `job:${jobId}:output`;
    const shareHashKey = `job:${jobId}:shareHash`;
    const traceKey = `trace:${providedChainId}:${txHash.toLowerCase()}`;
    try {
        await redis.setex(statusKey, config_1.config.ttl.job, 'running');
        // ── 1. Redis cache ────────────────────────────────────────
        const cached = await (0, redis_1.cacheGet)(traceKey);
        if (cached) {
            console.log(`[traceWorker] cache hit for ${txHash}`);
            const chainId = providedChainId ?? cached.chainId ?? (await (0, rpcService_1.getChainId)(rpcUrl));
            let payload = await ensureTxOverviewMetadata(cached, rpcUrl, txHash, chainId);
            payload = await ensureDecodedArtifacts(payload, chainId, rpcUrl);
            if (payload !== cached)
                await (0, redis_1.cacheSet)(traceKey, payload, config_1.config.ttl.trace);
            await redis.setex(statusKey, config_1.config.ttl.job, 'done');
            await redis.setex(outputKey, config_1.config.ttl.job, JSON.stringify(payload));
            if (payload.shareHash)
                await redis.setex(shareHashKey, config_1.config.ttl.job, payload.shareHash);
            return;
        }
        // ── 2. MongoDB cache ──────────────────────────────────────
        const chainId = providedChainId ?? (await (0, rpcService_1.getChainId)(rpcUrl));
        const dbTrace = await Trace_1.Trace.findOne({ txHash: txHash.toLowerCase(), chainId });
        if (dbTrace) {
            console.log(`[traceWorker] mongo hit for ${txHash}`);
            let payload = await ensureTxOverviewMetadata(dbTrace.toObject(), rpcUrl, txHash, chainId);
            payload = await ensureDecodedArtifacts(payload, chainId, rpcUrl);
            await (0, redis_1.cacheSet)(traceKey, payload, config_1.config.ttl.trace);
            await redis.setex(statusKey, config_1.config.ttl.job, 'done');
            await redis.setex(outputKey, config_1.config.ttl.job, JSON.stringify(payload));
            if (dbTrace.shareHash)
                await redis.setex(shareHashKey, config_1.config.ttl.job, dbTrace.shareHash);
            return;
        }
        // ── 3. Fetch from RPC (parallel where possible) ───────────
        const [txOverview, rawCallTree, receipt, prestateResult, rawStructLog] = await Promise.all([
            (0, rpcService_1.buildTxOverview)(rpcUrl, txHash),
            (0, rpcService_1.debugTraceTransaction)(rpcUrl, txHash),
            (0, rpcService_1.getTransactionReceipt)(rpcUrl, txHash),
            (0, rpcService_1.getPrestateTrace)(rpcUrl, txHash),
            (0, rpcService_1.getFilteredStructLog)(rpcUrl, txHash, verbose),
        ]);
        const normalizedTree = (0, rpcService_1.normalizeCallTree)(rawCallTree);
        const structLog = await annotateStructLogWithSourceLabels(rawStructLog, normalizedTree, chainId);
        const { allLogs, erc20Transfers, erc721Transfers, erc1155Transfers, } = (0, rpcService_1.parseAllLogs)(receipt);
        // Enrich inline trace logs with event names from decoded receipt logs
        const eventNameByTopic2 = new Map();
        for (const log of allLogs) {
            if (log.eventName && log.topics?.[0]) {
                eventNameByTopic2.set(log.topics[0].toLowerCase(), log.eventName);
            }
        }
        await enrichTreeLogs(normalizedTree, eventNameByTopic2);
        // Apply resolved names back to allLogs for frontend consumption
        for (const log of allLogs) {
            if (!log.eventName && log.topics?.[0]) {
                const name = eventNameByTopic2.get(log.topics[0].toLowerCase());
                if (name)
                    log.eventName = name;
            }
        }
        const nativeTransfers = (0, rpcService_1.extractNativeTransfers)(normalizedTree);
        const stateDiffs = (0, rpcService_1.buildStateDiffs)(prestateResult);
        const gasTree = (0, rpcService_1.buildGasTree)(normalizedTree, parseInt(txOverview.gasUsed, 16));
        const decodedCalldata = txOverview.input
            ? await (0, selectorService_1.decodeCalldata)(txOverview.input, txOverview.to, chainId)
            : undefined;
        const decodedOutput = txOverview.input && normalizedTree.output
            ? await (0, selectorService_1.decodeOutput)(txOverview.input, normalizedTree.output, txOverview.to, chainId)
            : undefined;
        const tokenLabels = await (0, rpcService_1.buildTokenLabelMap)(rpcUrl, erc20Transfers.map(transfer => transfer.tokenAddress));
        const addressLabels = await buildAddressLabelMap(chainId, collectTraceAddresses(normalizedTree), tokenLabels);
        setContractNames(normalizedTree, addressLabels, tokenLabels);
        // ── 4. Annotate tree nodes with decoded function names ────
        await annotateTree(normalizedTree, chainId);
        // ── 4. Persist Transaction ────────────────────────────────
        await Transaction_1.Transaction.findOneAndUpdate({ hash: txHash.toLowerCase(), chainId }, {
            hash: txHash.toLowerCase(),
            chainId,
            blockNumber: txOverview.blockNumber,
            from: txOverview.from,
            to: txOverview.to,
            value: txOverview.value,
            gas: parseInt(txOverview.gasLimit, 16),
            gasPrice: txOverview.gasPrice,
            input: txOverview.input,
            status: txOverview.status,
            fetchedAt: new Date(),
        }, { upsert: true });
        // ── 5. Share (idempotent) ─────────────────────────────────
        const share = await (0, shareService_1.createTraceShare)({
            txHash: txHash.toLowerCase(),
            rpcUrl,
            chainId,
            txOverview,
            normalizedTrace: normalizedTree,
            tokenTransfers: erc20Transfers,
            decodedCalldata: decodedCalldata ?? undefined,
            decodedOutput: decodedOutput ?? undefined,
        });
        // ── 6. Persist Trace ──────────────────────────────────────
        await Trace_1.Trace.findOneAndUpdate({ txHash: txHash.toLowerCase(), chainId }, {
            txHash: txHash.toLowerCase(),
            chainId,
            shareHash: share.hash,
            txOverview,
            rawCallTree,
            normalizedTree,
            tokenTransfers: erc20Transfers,
            decodedCalldata,
            decodedOutput,
            structLog,
            addressLabels,
            tokenLabels,
            allLogs,
            erc20Transfers,
            erc721Transfers,
            erc1155Transfers,
            nativeTransfers,
            stateDiffs,
            gasTree,
            gasUsed: txOverview.gasUsed,
            fetchedAt: new Date(),
        }, { upsert: true });
        // ── 7. Build result payload ───────────────────────────────
        const resultPayload = {
            chainId,
            txOverview,
            normalizedTree,
            structLog,
            addressLabels,
            tokenLabels,
            allLogs,
            erc20Transfers,
            erc721Transfers,
            erc1155Transfers,
            nativeTransfers,
            stateDiffs,
            gasTree,
            decodedCalldata,
            decodedOutput,
            shareHash: share.hash,
            shareUrl: `/explorer?trace=${share.hash}`,
        };
        await (0, redis_1.cacheSet)(traceKey, resultPayload, config_1.config.ttl.trace);
        await redis.setex(statusKey, config_1.config.ttl.job, 'done');
        await redis.setex(outputKey, config_1.config.ttl.job, JSON.stringify(resultPayload));
        await redis.setex(shareHashKey, config_1.config.ttl.job, share.hash);
        // Publish decode jobs for unique selectors in the tree
        const selectors = collectSelectors(normalizedTree);
        for (const sel of selectors) {
            await (0, rabbitmq_1.publishJob)(rabbitmq_1.QUEUES.TX_DECODE, { jobId: `${jobId}-${sel}`, selector: sel });
        }
        console.log(`[traceWorker] done job ${jobId} — shareHash ${share.hash}`);
    }
    catch (err) {
        console.error(`[traceWorker] error job ${jobId}:`, err.message);
        await redis.setex(statusKey, config_1.config.ttl.job, 'failed');
        await redis.setex(outputKey, config_1.config.ttl.job, JSON.stringify({ error: err.message }));
        throw err;
    }
}
async function ensureTxOverviewMetadata(payload, rpcUrl, txHash, chainId) {
    if (payload?.txOverview?.timestamp && payload?.txOverview?.txType)
        return payload;
    const freshOverview = await (0, rpcService_1.buildTxOverview)(rpcUrl, txHash);
    const txOverview = {
        ...payload.txOverview,
        timestamp: payload.txOverview?.timestamp ?? freshOverview.timestamp,
        txType: payload.txOverview?.txType ?? freshOverview.txType ?? '0x0',
    };
    const enriched = { ...payload, txOverview };
    const resolvedChainId = chainId ?? payload.chainId;
    if (resolvedChainId) {
        await Trace_1.Trace.updateOne({ txHash: txHash.toLowerCase(), chainId: resolvedChainId }, { $set: { txOverview } }).exec();
        await Share_1.Share.updateOne({ txHash: txHash.toLowerCase(), chainId: resolvedChainId, type: 'trace' }, { $set: { txOverview } }).exec();
    }
    return enriched;
}
function collectSelectors(node, seen = new Set()) {
    if (node?.input && node.input.length >= 10)
        seen.add(node.input.slice(0, 10));
    for (const child of node?.children ?? [])
        collectSelectors(child, seen);
    return [...seen];
}
/**
 * Enrich inline trace logs with event names.
 * 1. Apply names from receipt logs (already decoded Transfer, Approval, etc.)
 * 2. Collect unknown topic0s and batch-lookup via 4byte / OpenChain APIs
 * 3. Apply the results back to the logs
 */
async function enrichTreeLogs(node, eventNameByTopic) {
    // First pass: apply known names and collect unknowns
    const unknownTopics = new Set();
    collectUnknownTopics(node, eventNameByTopic, unknownTopics);
    // Batch lookup unknowns via 4byte / OpenChain
    if (unknownTopics.size > 0) {
        const looked = await (0, selectorService_1.lookupEventNames)([...unknownTopics]);
        for (const [topic, name] of looked) {
            eventNameByTopic.set(topic, name);
        }
    }
    // Second pass: apply all resolved names
    applyEventNames(node, eventNameByTopic);
}
function collectUnknownTopics(node, known, unknowns) {
    const logs = node?.logs;
    if (logs?.length) {
        for (const log of logs) {
            if (log.name)
                continue;
            const topic0 = log.topics?.[0]?.toLowerCase();
            if (topic0 && !known.has(topic0)) {
                unknowns.add(topic0);
            }
        }
    }
    for (const child of node?.children ?? []) {
        collectUnknownTopics(child, known, unknowns);
    }
}
function applyEventNames(node, nameByTopic) {
    const logs = node?.logs;
    if (logs?.length) {
        for (const log of logs) {
            if (log.name)
                continue;
            const topic0 = log.topics?.[0]?.toLowerCase();
            if (topic0 && nameByTopic.has(topic0)) {
                log.name = nameByTopic.get(topic0);
            }
        }
    }
    for (const child of node?.children ?? []) {
        applyEventNames(child, nameByTopic);
    }
}
/** Check if any log in the tree is missing a name */
function hasUnnamedLogs(node) {
    const logs = node?.logs;
    if (logs?.length) {
        for (const log of logs) {
            if (!log.name && log.topics?.[0])
                return true;
        }
    }
    for (const child of node?.children ?? []) {
        if (hasUnnamedLogs(child))
            return true;
    }
    return false;
}
/**
 * Walk the call tree and annotate each node with decodedFunction + decodedArgs
 * by looking up its 4-byte selector and ABI-decoding the calldata in place.
 * Must be called BEFORE the result payload is built / cached.
 */
async function annotateTree(node, chainId) {
    let changed = false;
    if (node?.input && node.input.length >= 10) {
        const decoded = await (0, selectorService_1.decodeCalldata)(node.input, node.to, chainId);
        if (decoded) {
            const previousFunction = node.decodedFunction;
            const previousArgs = JSON.stringify(node.decodedArgs ?? []);
            node.decodedFunction = decoded.functionName;
            node.decodedArgs = decoded.args;
            changed ||= previousFunction !== node.decodedFunction || previousArgs !== JSON.stringify(node.decodedArgs ?? []);
        }
        // Also decode output if available and not yet decoded
        if (node.output && node.output !== '0x' && !node.decoded_output?.length) {
            const decodedOut = await (0, selectorService_1.decodeOutput)(node.input, node.output, node.to, chainId);
            if (decodedOut?.values?.length) {
                node.decoded_output = decodedOut.values;
                changed = true;
            }
        }
    }
    for (const child of node?.children ?? []) {
        changed = (await annotateTree(child, chainId)) || changed;
    }
    return changed;
}
function hasMeaningfulDecodedCalldata(decoded) {
    if (!decoded?.functionName)
        return false;
    if (!Array.isArray(decoded.args) || decoded.args.length === 0)
        return true;
    return decoded.args.some((arg) => {
        const value = String(arg?.value ?? '').trim();
        return value !== '' && value !== '""';
    });
}
function hasMeaningfulDecodedOutput(decoded) {
    if (!decoded?.functionName)
        return false;
    if (!Array.isArray(decoded.values) || decoded.values.length === 0)
        return false;
    return decoded.values.some((output) => {
        const value = String(output?.value ?? '').trim();
        return value !== '' && value !== '""';
    });
}
async function ensureDecodedArtifacts(payload, chainId, rpcUrl) {
    let changed = false;
    const nextPayload = { ...payload };
    if (nextPayload?.txOverview?.input && !hasMeaningfulDecodedCalldata(nextPayload.decodedCalldata)) {
        const repaired = await (0, selectorService_1.decodeCalldata)(nextPayload.txOverview.input, nextPayload.txOverview.to, chainId);
        if (hasMeaningfulDecodedCalldata(repaired)) {
            nextPayload.decodedCalldata = repaired;
            changed = true;
        }
    }
    if (nextPayload?.txOverview?.input && nextPayload?.normalizedTree?.output && !hasMeaningfulDecodedOutput(nextPayload.decodedOutput)) {
        const repairedOutput = await (0, selectorService_1.decodeOutput)(nextPayload.txOverview.input, nextPayload.normalizedTree.output, nextPayload.txOverview.to, chainId);
        if (hasMeaningfulDecodedOutput(repairedOutput)) {
            nextPayload.decodedOutput = repairedOutput;
            changed = true;
        }
    }
    if (nextPayload?.normalizedTree) {
        const treeChanged = await annotateTree(nextPayload.normalizedTree, chainId);
        changed = treeChanged || changed;
        // Enrich event names from 4byte/OpenChain if any logs are unnamed
        if (hasUnnamedLogs(nextPayload.normalizedTree)) {
            const knownNames = new Map();
            // Seed from allLogs (receipt-decoded event names)
            if (Array.isArray(nextPayload.allLogs)) {
                for (const log of nextPayload.allLogs) {
                    if (log.eventName && log.topics?.[0]) {
                        knownNames.set(log.topics[0].toLowerCase(), log.eventName);
                    }
                }
            }
            await enrichTreeLogs(nextPayload.normalizedTree, knownNames);
            changed = true;
        }
    }
    if ((!nextPayload.tokenLabels || Object.keys(nextPayload.tokenLabels).length === 0) && Array.isArray(nextPayload.erc20Transfers) && nextPayload.erc20Transfers.length > 0) {
        nextPayload.tokenLabels = await (0, rpcService_1.buildTokenLabelMap)(rpcUrl, nextPayload.erc20Transfers.map((transfer) => transfer.tokenAddress));
        changed = Object.keys(nextPayload.tokenLabels).length > 0 || changed;
    }
    if (!nextPayload.addressLabels || Object.keys(nextPayload.addressLabels).length === 0) {
        nextPayload.addressLabels = await buildAddressLabelMap(chainId, collectTraceAddresses(nextPayload.normalizedTree), nextPayload.tokenLabels ?? {});
        if (Object.keys(nextPayload.addressLabels).length > 0) {
            setContractNames(nextPayload.normalizedTree, nextPayload.addressLabels, nextPayload.tokenLabels ?? {});
        }
        changed = Object.keys(nextPayload.addressLabels).length > 0 || changed;
    }
    if (!changed)
        return payload;
    await Trace_1.Trace.updateOne({ txHash: nextPayload.txHash?.toLowerCase(), chainId }, {
        $set: {
            decodedCalldata: nextPayload.decodedCalldata,
            decodedOutput: nextPayload.decodedOutput,
            normalizedTree: nextPayload.normalizedTree,
            structLog: nextPayload.structLog ?? [],
            addressLabels: nextPayload.addressLabels ?? {},
            tokenLabels: nextPayload.tokenLabels ?? {},
            allLogs: nextPayload.allLogs ?? [],
            erc20Transfers: nextPayload.erc20Transfers ?? [],
            erc721Transfers: nextPayload.erc721Transfers ?? [],
            erc1155Transfers: nextPayload.erc1155Transfers ?? [],
            nativeTransfers: nextPayload.nativeTransfers ?? [],
            stateDiffs: nextPayload.stateDiffs ?? [],
            asset_changes: nextPayload.asset_changes ?? [],
            exposure_changes: nextPayload.exposure_changes ?? [],
            balance_changes: nextPayload.balance_changes ?? [],
            gasTree: nextPayload.gasTree,
        },
    }).exec();
    await Share_1.Share.updateOne({ txHash: nextPayload.txHash?.toLowerCase(), chainId, type: 'trace' }, {
        $set: {
            decodedCalldata: nextPayload.decodedCalldata,
            decodedOutput: nextPayload.decodedOutput,
            normalizedTrace: nextPayload.normalizedTree,
        },
    }).exec();
    return nextPayload;
}
//# sourceMappingURL=traceWorker.js.map