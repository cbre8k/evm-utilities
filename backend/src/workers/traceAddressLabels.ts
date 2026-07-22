// ============================================================
// workers/traceAddressLabels.ts
// Resolves human-readable labels for the addresses in a trace tree and
// stamps contract_name onto each node. Shared by traceWorker and
// traceEnrichment.
// ============================================================

import { getVerifiedContractName } from '../services/sourcifyService';

export function collectTraceAddresses(node: any, out = new Set<string>()): string[] {
  if (node?.from) out.add(String(node.from).toLowerCase());
  if (node?.to) out.add(String(node.to).toLowerCase());
  for (const log of node?.logs ?? []) {
    if (log?.address) out.add(String(log.address).toLowerCase());
  }
  for (const child of node?.children ?? []) collectTraceAddresses(child, out);
  return [...out];
}

/** Set contract_name on every trace node from the resolved address labels. */
export function setContractNames(
  node: any,
  labels: Record<string, string>,
  tokenLabels: Record<string, string>,
): void {
  if (node?.to) {
    const key = node.to.toLowerCase();
    node.contract_name = labels[key] ?? tokenLabels[key] ?? undefined;
  }
  for (const child of node?.children ?? []) setContractNames(child, labels, tokenLabels);
}

export async function buildAddressLabelMap(
  chainId: number,
  addresses: string[],
  tokenLabels: Record<string, string>,
): Promise<Record<string, string>> {
  const unique = [...new Set(addresses.filter(Boolean).map(address => address.toLowerCase()))];
  const entries = await Promise.all(
    unique.map(async (address) => {
      if (tokenLabels[address]) return [address, tokenLabels[address]] as const;
      const name = await getVerifiedContractName(chainId, address);
      return [address, name] as const;
    }),
  );

  return Object.fromEntries(entries.filter(([, label]) => !!label)) as Record<string, string>;
}
