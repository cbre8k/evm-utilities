// ============================================================
// services/etherscanService.ts — Etherscan contract source
// ============================================================

import { config } from '../config';

export type EtherscanSourceFile = {
  name: string;
  path: string;
  content: string;
};

export type EtherscanContractSource = {
  address: string;
  contractName: string | null;
  compilerVersion?: string;
  abi?: string;
  sources: EtherscanSourceFile[];
};

const ETHERSCAN_API_BY_CHAIN: Record<number, string> = {
  1: 'https://api.etherscan.io/api',
  56: 'https://api.bscscan.com/api',
  8453: 'https://api.basescan.org/api',
};

function getApiBase(chainId: number): string | null {
  return ETHERSCAN_API_BY_CHAIN[chainId] ?? null;
}

function normalizeSources(
  raw: string,
  contractName: string | null,
): EtherscanSourceFile[] {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return [];

  let parsed: any = null;
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('{{') && trimmed.endsWith('}}'))
  ) {
    const normalized = trimmed.startsWith('{{') ? trimmed.slice(1, -1) : trimmed;
    try {
      parsed = JSON.parse(normalized);
    } catch {
      parsed = null;
    }
  }

  if (parsed?.sources) {
    return Object.entries(parsed.sources).map(([path, source]) => {
      const content = (source as any)?.content ?? '';
      return {
        name: path.split('/').pop() ?? path,
        path,
        content,
      };
    });
  }

  const name = contractName || 'Contract';
  const path = contractName ? `${contractName}.sol` : 'Contract.sol';
  return [{ name, path, content: raw }];
}

export async function getContractSource(
  chainId: number,
  address: string,
): Promise<EtherscanContractSource | null> {
  const apiKey = config.etherscan.apiKey;
  if (!apiKey) return null;

  const base = getApiBase(chainId);
  if (!base) return null;
  const url = `${base}?module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const data = await res.json() as any;

    if (!data || data.status !== '1' || !Array.isArray(data.result) || data.result.length === 0) {
      return null;
    }

    const result = data.result[0] ?? {};
    const sources = normalizeSources(result.SourceCode ?? '', result.ContractName ?? null);
    if (sources.length === 0) return null;

    return {
      address: String(address).toLowerCase(),
      contractName: result.ContractName ?? null,
      compilerVersion: result.CompilerVersion ?? undefined,
      abi: result.ABI ?? undefined,
      sources,
    };
  } catch {
    return null;
  }
}
