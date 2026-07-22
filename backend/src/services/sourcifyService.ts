// ── Uses Sourcify API v2: GET /v2/contract/{chainId}/{address} ──
// https://sourcify.dev/server/api-docs/swagger.json

import { createLogger } from '@shared/utils/logger';
import { errMessage } from '@shared/utils/errors';

const log = createLogger('sourcify');

const SOURCIFY_URL = 'https://sourcify.dev/server';
// Module-level result caches — survive the lifetime of the worker process.
const contractNameCache = new Map<string, string | null>();
const runtimeDebugCache = new Map<string, RuntimeDebugInfo | null>();
const verifiedSourceCache = new Map<string, VerifiedContract | null>();
// In-flight promise caches: coalesce concurrent requests for the same key.
const contractNameInflight = new Map<string, Promise<string | null>>();
const runtimeDebugInflight = new Map<string, Promise<RuntimeDebugInfo | null>>();
const verifiedSourceInflight = new Map<string, Promise<VerifiedContract | null>>();

// ── Response types ────────────────────────────────────────────

export interface SourceFile {
  name: string;   // filename derived from file path
  path: string;
  content: string;
}

export interface ContractMetadata {
  compiler: { version: string };
  language: string;
  settings: any;
  sources: Record<string, { content?: string; keccak256: string; urls: string[] }>;
}

export interface VerifiedContract {
  match: string | null;           // "match" | "exact_match" | null
  creationMatch: string | null;
  runtimeMatch: string | null;
  chainId: string;
  address: string;
  verifiedAt?: string;
  contractName: string | null;    // e.g. "UniswapV2Router02"
  fullyQualifiedName: string | null; // e.g. "contracts/UniswapV2Router02.sol:UniswapV2Router02"
  sources: SourceFile[];
  abi: any[];
  metadata: ContractMetadata | null;
}

export interface RuntimeDebugInfo {
  contractName: string | null;
  fullyQualifiedName: string | null;
  runtimeBytecode: string;
  runtimeSourceMap: string;
  sources: Record<string, { content: string }>;
  stdJsonOutput: any;
}

// ── Main lookup ───────────────────────────────────────────────

/**
 * Fetch verified contract data from Sourcify v2 API.
 * Single call: GET /v2/contract/{chainId}/{address}?fields=...
 * Result and in-flight requests are cached so the same address is never
 * fetched more than once per process lifetime regardless of how many
 * callers trigger it concurrently.
 */
export async function getVerifiedSource(
  chainId: number,
  address: string,
): Promise<VerifiedContract | null> {
  const key = `${chainId}:${address.toLowerCase()}`;
  if (verifiedSourceCache.has(key)) return verifiedSourceCache.get(key) ?? null;

  const inflight = verifiedSourceInflight.get(key);
  if (inflight) return inflight;

  const promise = (async (): Promise<VerifiedContract | null> => {
    try {
      const fields = 'compilation.name,compilation.fullyQualifiedName,sources,abi,metadata';
      const url = `${SOURCIFY_URL}/v2/contract/${chainId}/${address.toLowerCase()}?fields=${encodeURIComponent(fields)}`;

      const res = await fetch(url, {
        headers: { 'User-Agent': 'evm-utilities/1.0' },
        signal: AbortSignal.timeout(8000),
      });

      if (res.status === 404) {
        verifiedSourceCache.set(key, null);
        return null;
      }

      if (!res.ok) {
        log.error(`HTTP ${res.status} for ${address} on chain ${chainId}`);
        verifiedSourceCache.set(key, null);
        return null;
      }

      const data = await res.json() as any;

      if (data.match === null && data.creationMatch === null && data.runtimeMatch === null) {
        verifiedSourceCache.set(key, null);
        return null;
      }

      const sourcesMap: Record<string, { content?: string }> = data.sources ?? {};
      const sources: SourceFile[] = Object.entries(sourcesMap).map(([path, val]) => ({
        name: path.split('/').pop() ?? path,
        path,
        content: (val as any).content ?? '',
      }));

      const result: VerifiedContract = {
        match:              data.match              ?? null,
        creationMatch:      data.creationMatch      ?? null,
        runtimeMatch:       data.runtimeMatch       ?? null,
        chainId:            String(chainId),
        address:            address.toLowerCase(),
        verifiedAt:         data.verifiedAt,
        contractName:       data.compilation?.name              ?? null,
        fullyQualifiedName: data.compilation?.fullyQualifiedName ?? null,
        sources,
        abi:      data.abi      ?? [],
        metadata: data.metadata ?? null,
      };
      verifiedSourceCache.set(key, result);
      return result;
    } catch (err) {
      log.error(`Error for ${address} on chain ${chainId}:`, errMessage(err));
      // Don't cache errors — allow a retry on the next request.
      return null;
    } finally {
      verifiedSourceInflight.delete(key);
    }
  })();

  verifiedSourceInflight.set(key, promise);
  return promise;
}

// ── Helpers ───────────────────────────────────────────────────

/** Returns just the contract name, or null if not verified. */
export function getContractName(contract: VerifiedContract | null): string | null {
  return contract?.contractName ?? null;
}

export async function getVerifiedContractName(
  chainId: number,
  address: string,
): Promise<string | null> {
  const key = `${chainId}:${address.toLowerCase()}`;
  if (contractNameCache.has(key)) return contractNameCache.get(key) ?? null;

  // getVerifiedSource handles its own in-flight dedup + result cache.
  const contract = await getVerifiedSource(chainId, address);
  const name = getContractName(contract) ?? null;
  contractNameCache.set(key, name);
  return name;
}

export async function getRuntimeDebugInfo(
  chainId: number,
  address: string,
): Promise<RuntimeDebugInfo | null> {
  const key = `${chainId}:${address.toLowerCase()}`;
  if (runtimeDebugCache.has(key)) return runtimeDebugCache.get(key) ?? null;

  // Return existing in-flight promise to prevent duplicate concurrent fetches.
  const inflight = runtimeDebugInflight.get(key);
  if (inflight) return inflight;

  const promise = (async () => {
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

      if (res.status === 404 || !res.ok) {
        runtimeDebugCache.set(key, null);
        return null;
      }

      const data = await res.json() as any;
      const runtimeBytecode = data.runtimeBytecode?.recompiledBytecode
        ?? data.runtimeBytecode?.onchainBytecode
        ?? '';
      const runtimeSourceMap = data.runtimeBytecode?.sourceMap ?? '';
      if (!runtimeBytecode || !runtimeSourceMap) {
        runtimeDebugCache.set(key, null);
        return null;
      }

      const info: RuntimeDebugInfo = {
        contractName: data.compilation?.name ?? null,
        fullyQualifiedName: data.compilation?.fullyQualifiedName ?? null,
        runtimeBytecode,
        runtimeSourceMap,
        sources: data.sources ?? {},
        stdJsonOutput: data.stdJsonOutput ?? {},
      };

      runtimeDebugCache.set(key, info);
      return info;
    } catch {
      runtimeDebugCache.set(key, null);
      return null;
    } finally {
      runtimeDebugInflight.delete(key);
    }
  })();

  runtimeDebugInflight.set(key, promise);
  return promise;
}
