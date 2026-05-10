"use strict";
// ── Uses Sourcify API v2: GET /v2/contract/{chainId}/{address} ──
// https://sourcify.dev/server/api-docs/swagger.json
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVerifiedSource = getVerifiedSource;
exports.getContractName = getContractName;
exports.getVerifiedContractName = getVerifiedContractName;
exports.getRuntimeDebugInfo = getRuntimeDebugInfo;
const SOURCIFY_URL = 'https://sourcify.dev/server';
const contractNameCache = new Map();
const runtimeDebugCache = new Map();
// ── Main lookup ───────────────────────────────────────────────
/**
 * Fetch verified contract data from Sourcify v2 API.
 * Single call: GET /v2/contract/{chainId}/{address}?fields=...
 * Returns null if the contract is not verified on Sourcify.
 */
async function getVerifiedSource(chainId, address) {
    try {
        const fields = 'compilation.name,compilation.fullyQualifiedName,sources,abi,metadata';
        const url = `${SOURCIFY_URL}/v2/contract/${chainId}/${address.toLowerCase()}?fields=${encodeURIComponent(fields)}`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'evm-utilities/1.0' },
            signal: AbortSignal.timeout(8000),
        });
        // 404 = contract not verified on this chain
        if (res.status === 404)
            return null;
        if (!res.ok) {
            console.error(`[Sourcify] HTTP ${res.status} for ${address} on chain ${chainId}`);
            return null;
        }
        const data = await res.json();
        // v2 may return 200 with all match fields null when contract is in DB but unverified
        if (data.match === null && data.creationMatch === null && data.runtimeMatch === null) {
            return null;
        }
        // Convert sources map { [filePath]: { content } } → SourceFile[]
        const sourcesMap = data.sources ?? {};
        const sources = Object.entries(sourcesMap).map(([path, val]) => ({
            name: path.split('/').pop() ?? path,
            path,
            content: val.content ?? '',
        }));
        return {
            match: data.match ?? null,
            creationMatch: data.creationMatch ?? null,
            runtimeMatch: data.runtimeMatch ?? null,
            chainId: String(chainId),
            address: address.toLowerCase(),
            verifiedAt: data.verifiedAt,
            contractName: data.compilation?.name ?? null,
            fullyQualifiedName: data.compilation?.fullyQualifiedName ?? null,
            sources,
            abi: data.abi ?? [],
            metadata: data.metadata ?? null,
        };
    }
    catch (err) {
        console.error(`[Sourcify] Error for ${address} on chain ${chainId}:`, err.message);
        return null;
    }
}
// ── Helpers ───────────────────────────────────────────────────
/** Returns just the contract name, or null if not verified. */
function getContractName(contract) {
    return contract?.contractName ?? null;
}
async function getVerifiedContractName(chainId, address) {
    const key = `${chainId}:${address.toLowerCase()}`;
    if (contractNameCache.has(key))
        return contractNameCache.get(key) ?? null;
    const contract = await getVerifiedSource(chainId, address);
    const name = getContractName(contract);
    contractNameCache.set(key, name ?? null);
    return name ?? null;
}
async function getRuntimeDebugInfo(chainId, address) {
    const key = `${chainId}:${address.toLowerCase()}`;
    if (runtimeDebugCache.has(key))
        return runtimeDebugCache.get(key) ?? null;
    try {
        const fields = [
            'runtimeBytecode.sourceMap',
            'runtimeBytecode.recompiledBytecode',
            'runtimeBytecode.onchainBytecode',
            'sources',
            'stdJsonOutput',
            'compilation.name',
            'compilation.fullyQualifiedName',
        ].join(',');
        const url = `${SOURCIFY_URL}/v2/contract/${chainId}/${address.toLowerCase()}?fields=${encodeURIComponent(fields)}`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'evm-utilities/1.0' },
            signal: AbortSignal.timeout(8000),
        });
        if (res.status === 404) {
            runtimeDebugCache.set(key, null);
            return null;
        }
        if (!res.ok) {
            runtimeDebugCache.set(key, null);
            return null;
        }
        const data = await res.json();
        const runtimeBytecode = data.runtimeBytecode?.recompiledBytecode
            ?? data.runtimeBytecode?.onchainBytecode
            ?? '';
        const runtimeSourceMap = data.runtimeBytecode?.sourceMap ?? '';
        if (!runtimeBytecode || !runtimeSourceMap) {
            runtimeDebugCache.set(key, null);
            return null;
        }
        const info = {
            contractName: data.compilation?.name ?? null,
            fullyQualifiedName: data.compilation?.fullyQualifiedName ?? null,
            runtimeBytecode,
            runtimeSourceMap,
            sources: data.sources ?? {},
            stdJsonOutput: data.stdJsonOutput ?? {},
        };
        runtimeDebugCache.set(key, info);
        return info;
    }
    catch {
        runtimeDebugCache.set(key, null);
        return null;
    }
}
//# sourceMappingURL=sourcifyService.js.map