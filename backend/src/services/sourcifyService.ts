// ── Uses Sourcify API v2: GET /v2/contract/{chainId}/{address} ──
// https://sourcify.dev/server/api-docs/swagger.json

const SOURCIFY_URL = 'https://sourcify.dev/server';
const contractNameCache = new Map<string, string | null>();
const runtimeDebugCache = new Map<string, RuntimeDebugInfo | null>();

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
 * Returns null if the contract is not verified on Sourcify.
 */
export async function getVerifiedSource(
  chainId: number,
  address: string,
): Promise<VerifiedContract | null> {
  try {
    const fields = 'compilation.name,compilation.fullyQualifiedName,sources,abi,metadata';
    const url = `${SOURCIFY_URL}/v2/contract/${chainId}/${address.toLowerCase()}?fields=${encodeURIComponent(fields)}`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'evm-utilities/1.0' },
      signal: AbortSignal.timeout(8000),
    });

    // 404 = contract not verified on this chain
    if (res.status === 404) return null;

    if (!res.ok) {
      console.error(`[Sourcify] HTTP ${res.status} for ${address} on chain ${chainId}`);
      return null;
    }

    const data = await res.json() as any;

    // v2 may return 200 with all match fields null when contract is in DB but unverified
    if (data.match === null && data.creationMatch === null && data.runtimeMatch === null) {
      return null;
    }

    // Convert sources map { [filePath]: { content } } → SourceFile[]
    const sourcesMap: Record<string, { content?: string }> = data.sources ?? {};
    const sources: SourceFile[] = Object.entries(sourcesMap).map(([path, val]) => ({
      name: path.split('/').pop() ?? path,
      path,
      content: (val as any).content ?? '',
    }));

    return {
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
  } catch (err) {
    console.error(`[Sourcify] Error for ${address} on chain ${chainId}:`, (err as any).message);
    return null;
  }
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

  const contract = await getVerifiedSource(chainId, address);
  const name = getContractName(contract);
  contractNameCache.set(key, name ?? null);
  return name ?? null;
}

export async function getRuntimeDebugInfo(
  chainId: number,
  address: string,
): Promise<RuntimeDebugInfo | null> {
  const key = `${chainId}:${address.toLowerCase()}`;
  if (runtimeDebugCache.has(key)) return runtimeDebugCache.get(key) ?? null;

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
  }
}
