// ============================================================
// workers/traceEnrichment.ts
// Post-processing for a decoded trace: backfills tx-overview metadata,
// resolves event names via signature lookup, and (re)decodes calldata /
// outputs. Extracted from traceWorker.ts.
// ============================================================

import { buildTxOverview, buildTokenLabelMap } from '../services/rpcService';
import {
  collectTraceAddresses,
  setContractNames,
  buildAddressLabelMap,
} from './traceAddressLabels';
import { decodeCalldata, decodeOutput, lookupEventNames } from '../services/selectorService';
import { Trace } from '../models/Trace';
import { Share } from '../models/Share';
import { hasMeaningfulDecodedCalldata, hasMeaningfulDecodedOutput } from '@shared/utils/decoded';
import { createLogger } from '@shared/utils/logger';

const log = createLogger('traceWorker');

export async function ensureTxOverviewMetadata(payload: any, rpcUrl: string, txHash: string, chainId?: number, fallbackRpcUrls: string[] = []): Promise<any> {
  if (payload?.txOverview?.timestamp && payload?.txOverview?.txType) return payload;

  const freshOverview = await buildTxOverview(rpcUrl, txHash, fallbackRpcUrls);
  const txOverview = {
    ...payload.txOverview,
    timestamp: payload.txOverview?.timestamp ?? freshOverview.timestamp,
    txType: payload.txOverview?.txType ?? freshOverview.txType ?? '0x0',
  };
  const enriched = { ...payload, txOverview };
  const resolvedChainId = chainId ?? payload.chainId;

  if (resolvedChainId) {
    await Trace.updateOne(
      { txHash: txHash.toLowerCase(), chainId: resolvedChainId },
      { $set: { txOverview } }
    ).exec();
    await Share.updateOne(
      { txHash: txHash.toLowerCase(), chainId: resolvedChainId, type: 'trace' },
      { $set: { txOverview } }
    ).exec();
  }

  return enriched;
}

export function collectSelectors(node: any, seen = new Set<string>()): string[] {
  if (node?.input && node.input.length >= 10) seen.add(node.input.slice(0, 10));
  for (const child of node?.children ?? []) collectSelectors(child, seen);
  return [...seen];
}

/**
 * Enrich inline trace logs with event names.
 * 1. Apply names from receipt logs (already decoded Transfer, Approval, etc.)
 * 2. Collect unknown topic0s and batch-lookup via 4byte / OpenChain APIs
 * 3. Apply the results back to the logs
 */
export async function enrichTreeLogs(
  node: any,
  eventNameByTopic: Map<string, string>,
): Promise<void> {
  // First pass: apply known names and collect unknowns
  const unknownTopics = new Set<string>();
  collectUnknownTopics(node, eventNameByTopic, unknownTopics);

  // Batch lookup unknowns via 4byte / OpenChain
  if (unknownTopics.size > 0) {
    const looked = await lookupEventNames([...unknownTopics]);
    for (const [topic, name] of looked) {
      eventNameByTopic.set(topic, name);
    }
  }

  // Second pass: apply all resolved names
  applyEventNames(node, eventNameByTopic);
}

function collectUnknownTopics(
  node: any,
  known: Map<string, string>,
  unknowns: Set<string>,
): void {
  const logs = node?.logs as any[] | undefined;
  if (logs?.length) {
    for (const log of logs) {
      if (log.name) continue;
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

function applyEventNames(
  node: any,
  nameByTopic: Map<string, string>,
): void {
  const logs = node?.logs as any[] | undefined;
  if (logs?.length) {
    for (const log of logs) {
      if (log.name) continue;
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
function hasUnnamedLogs(node: any): boolean {
  const logs = node?.logs as any[] | undefined;
  if (logs?.length) {
    for (const log of logs) {
      if (!log.name && log.topics?.[0]) return true;
    }
  }
  for (const child of node?.children ?? []) {
    if (hasUnnamedLogs(child)) return true;
  }
  return false;
}

/**
 * Walk the call tree and annotate each node with decodedFunction + decodedArgs
 * by looking up its 4-byte selector and ABI-decoding the calldata in place.
 * Must be called BEFORE the result payload is built / cached.
 */
export async function annotateTree(node: any, chainId: number): Promise<boolean> {
  let changed = false;
  if (node?.input && node.input.length >= 10) {
    const decoded = await decodeCalldata(node.input, node.to, chainId);
    if (decoded) {
      const previousFunction = node.decodedFunction;
      const previousArgs = JSON.stringify(node.decodedArgs ?? []);
      node.decodedFunction = decoded.functionName;
      node.decodedArgs     = decoded.args;
      changed ||= previousFunction !== node.decodedFunction || previousArgs !== JSON.stringify(node.decodedArgs ?? []);
    }
    // Also decode output if available and not yet decoded
    if (node.output && node.output !== '0x' && !node.decoded_output?.length) {
      const decodedOut = await decodeOutput(node.input, node.output, node.to, chainId);
      if (decodedOut?.values?.length) {
        node.decoded_output = decodedOut.values;
        changed = true;
      }
    }
  }
  // Process all children concurrently — avoids N+1 sequential decode awaits
  const childResults = await Promise.all(
    (node?.children ?? []).map((child: any) => annotateTree(child, chainId)),
  );
  changed = childResults.some(Boolean) || changed;
  return changed;
}

export async function ensureDecodedArtifacts(payload: any, chainId: number, rpcUrl: string): Promise<any> {
  let changed = false;
  const nextPayload = { ...payload };

  if (nextPayload?.txOverview?.input && !hasMeaningfulDecodedCalldata(nextPayload.decodedCalldata)) {
    const repaired = await decodeCalldata(nextPayload.txOverview.input, nextPayload.txOverview.to, chainId);
    if (hasMeaningfulDecodedCalldata(repaired)) {
      nextPayload.decodedCalldata = repaired;
      changed = true;
    }
  }

  if (nextPayload?.txOverview?.input && nextPayload?.normalizedTree?.output && !hasMeaningfulDecodedOutput(nextPayload.decodedOutput)) {
    const repairedOutput = await decodeOutput(
      nextPayload.txOverview.input,
      nextPayload.normalizedTree.output,
      nextPayload.txOverview.to,
      chainId,
    );
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
      const knownNames = new Map<string, string>();
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
    nextPayload.tokenLabels = await buildTokenLabelMap(
      rpcUrl,
      nextPayload.erc20Transfers.map((transfer: { tokenAddress: string }) => transfer.tokenAddress),
    );
    changed = Object.keys(nextPayload.tokenLabels).length > 0 || changed;
  }

  if (!nextPayload.addressLabels || Object.keys(nextPayload.addressLabels).length === 0) {
    nextPayload.addressLabels = await buildAddressLabelMap(
      chainId,
      collectTraceAddresses(nextPayload.normalizedTree),
      nextPayload.tokenLabels ?? {},
    );
    if (Object.keys(nextPayload.addressLabels).length > 0) {
      setContractNames(nextPayload.normalizedTree, nextPayload.addressLabels, nextPayload.tokenLabels ?? {});
    }
    changed = Object.keys(nextPayload.addressLabels).length > 0 || changed;
  }

  if (!changed) return payload;

  await Trace.updateOne(
    { txHash: nextPayload.txHash?.toLowerCase(), chainId },
    {
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
    }
  ).exec();

  await Share.updateOne(
    { txHash: nextPayload.txHash?.toLowerCase(), chainId, type: 'trace' },
    {
      $set: {
        decodedCalldata: nextPayload.decodedCalldata,
        decodedOutput: nextPayload.decodedOutput,
        normalizedTrace: nextPayload.normalizedTree,
      },
    }
  ).exec();

  return nextPayload;
}
