// ============================================================
// workers/traceWorker.ts — full trace with all enrichments
// ============================================================

import type { ConsumeMessage, Channel } from 'amqplib';
import { QUEUES, consumeQueue, publishJob } from '../db/rabbitmq';
import { cacheGet, cacheSet, getRedis } from '../db/redis';
import { Trace } from '../models/Trace';
import { Share } from '../models/Share';
import { Transaction } from '../models/Transaction';
import { createTraceShare } from '../services/shareService';
import {
  buildTxOverview,
  buildTokenLabelMap,
  enrichErc20Transfers,
  debugTraceTransaction,
  getPrestateTrace,
  getFilteredStructLog,
  normalizeCallTree,
  parseAllLogs,
  extractNativeTransfers,
  buildStateDiffs,
  buildGasTree,
  getChainId,
  getTransactionReceipt,
} from '../services/rpcService';
import { decodeCalldata, decodeOutput, lookupEventNames } from '../services/selectorService';
import {
  collectTraceAddresses,
  setContractNames,
  buildAddressLabelMap,
} from './traceAddressLabels';
import { config } from '../config';
import type { TraceJobMessage } from '../types';
import { hasMeaningfulDecodedCalldata, hasMeaningfulDecodedOutput } from '@shared/utils/decoded';
import { annotateStructLogWithSourceLabels } from './traceSourceAnnotation';
import {
  ensureTxOverviewMetadata,
  collectSelectors,
  enrichTreeLogs,
  annotateTree,
  ensureDecodedArtifacts,
} from './traceEnrichment';
import { createLogger } from '@shared/utils/logger';

const log = createLogger('traceWorker');

export async function startTraceWorker(): Promise<void> {
  await consumeQueue(QUEUES.TX_TRACE, handleTraceJob);
}

async function handleTraceJob(msg: ConsumeMessage, _ch: Channel): Promise<void> {
  const { jobId, txHash, rpcUrl, fallbackRpcUrls = [], chainId: providedChainId, verbose = false } =
    JSON.parse(msg.content.toString()) as any;

  log.info(`processing job ${jobId} — tx ${txHash}`);

  const redis = getRedis();
  const statusKey   = `job:${jobId}:status`;
  const outputKey   = `job:${jobId}:output`;
  const shareHashKey = `job:${jobId}:shareHash`;
  const traceKey    = `trace:${providedChainId}:${txHash.toLowerCase()}`;

  try {
    await redis.setex(statusKey, config.ttl.job, 'running');

    // ── 1. Redis cache ────────────────────────────────────────
    const cached = await cacheGet<any>(traceKey);
    if (cached) {
      log.info(`cache hit for ${txHash}`);
      const chainId = providedChainId ?? cached.chainId ?? (await getChainId(rpcUrl));
      let payload = await ensureTxOverviewMetadata(cached, rpcUrl, txHash, chainId, fallbackRpcUrls);
      payload = await ensureDecodedArtifacts(payload, chainId, rpcUrl);
      if (payload !== cached) await cacheSet(traceKey, payload, config.ttl.trace);
      await redis.setex(statusKey, config.ttl.job, 'done');
      await redis.setex(outputKey, config.ttl.job, JSON.stringify(payload));
      if (payload.shareHash) await redis.setex(shareHashKey, config.ttl.job, payload.shareHash);
      return;
    }

    // ── 2. MongoDB cache ──────────────────────────────────────
    const chainId = providedChainId ?? (await getChainId(rpcUrl));
    const dbTrace = await Trace.findOne({ txHash: txHash.toLowerCase(), chainId });
    if (dbTrace) {
      log.info(`mongo hit for ${txHash}`);
      let payload = await ensureTxOverviewMetadata(dbTrace.toObject(), rpcUrl, txHash, chainId, fallbackRpcUrls);
      payload = await ensureDecodedArtifacts(payload, chainId, rpcUrl);
      await cacheSet(traceKey, payload, config.ttl.trace);
      await redis.setex(statusKey, config.ttl.job, 'done');
      await redis.setex(outputKey, config.ttl.job, JSON.stringify(payload));
      if (dbTrace.shareHash) await redis.setex(shareHashKey, config.ttl.job, dbTrace.shareHash);
      return;
    }

    // ── 3. Fetch from RPC (parallel where possible) ───────────
    const [txOverview, rawCallTree, receipt, prestateResult, rawStructLog] = await Promise.all([
      buildTxOverview(rpcUrl, txHash, fallbackRpcUrls),
      debugTraceTransaction(rpcUrl, txHash),
      getTransactionReceipt(rpcUrl, txHash),
      getPrestateTrace(rpcUrl, txHash),
      getFilteredStructLog(rpcUrl, txHash),
    ]);

    const normalizedTree  = normalizeCallTree(rawCallTree);
    const structLog = await annotateStructLogWithSourceLabels(rawStructLog, normalizedTree, chainId, txOverview.input);
    const {
      allLogs,
      erc20Transfers,
      erc721Transfers,
      erc1155Transfers,
    } = parseAllLogs(receipt);

    // Enrich inline trace logs with event names from decoded receipt logs
    const eventNameByTopic2 = new Map<string, string>();
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
        if (name) log.eventName = name;
      }
    }

    const nativeTransfers  = extractNativeTransfers(normalizedTree);
    const stateDiffs       = buildStateDiffs(prestateResult);
    const gasTree          = buildGasTree(normalizedTree, parseInt(txOverview.gasUsed, 16));
    const decodedCalldata  = txOverview.input
      ? await decodeCalldata(txOverview.input, txOverview.to, chainId)
      : undefined;
    const decodedOutput    = txOverview.input && normalizedTree.output
      ? await decodeOutput(txOverview.input, normalizedTree.output, txOverview.to, chainId)
      : undefined;
    const tokenLabels      = await buildTokenLabelMap(
      rpcUrl,
      erc20Transfers.map(transfer => transfer.tokenAddress),
    );
    const enrichedErc20Transfers = await enrichErc20Transfers(rpcUrl, erc20Transfers, tokenLabels);
    const addressLabels    = await buildAddressLabelMap(
      chainId,
      collectTraceAddresses(normalizedTree),
      tokenLabels,
    );

    setContractNames(normalizedTree, addressLabels, tokenLabels);

    // ── 4. Annotate tree nodes with decoded function names ────
    await annotateTree(normalizedTree, chainId);

    // ── 4. Persist Transaction ────────────────────────────────
    await Transaction.findOneAndUpdate(
      { hash: txHash.toLowerCase(), chainId },
      {
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
      },
      { upsert: true }
    );

    // ── 5. Share (idempotent) ─────────────────────────────────
    const share = await createTraceShare({
      txHash: txHash.toLowerCase(),
      rpcUrl,
      chainId,
      txOverview,
      normalizedTrace: normalizedTree,
      tokenTransfers: enrichedErc20Transfers,
      decodedCalldata: decodedCalldata ?? undefined,
      decodedOutput: decodedOutput ?? undefined,
    });

    // ── 6. Persist Trace ──────────────────────────────────────
    await Trace.findOneAndUpdate(
      { txHash: txHash.toLowerCase(), chainId },
      {
        txHash: txHash.toLowerCase(),
        chainId,
        shareHash: share.hash,
        txOverview,
        rawCallTree,
        normalizedTree,
        tokenTransfers: enrichedErc20Transfers,
        decodedCalldata,
        decodedOutput,
        structLog,
        addressLabels,
        tokenLabels,
        allLogs,
        erc20Transfers: enrichedErc20Transfers,
        erc721Transfers,
        erc1155Transfers,
        nativeTransfers,
        stateDiffs,
        gasTree,
        gasUsed: txOverview.gasUsed,
        fetchedAt: new Date(),
      },
      { upsert: true }
    );

    // ── 7. Build result payload ───────────────────────────────
    const resultPayload = {
      chainId,
      txOverview,
      normalizedTree,
      structLog,
      addressLabels,
      tokenLabels,
      allLogs,
      erc20Transfers: enrichedErc20Transfers,
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

    await cacheSet(traceKey, resultPayload, config.ttl.trace);
    await redis.setex(statusKey, config.ttl.job, 'done');
    await redis.setex(outputKey, config.ttl.job, JSON.stringify(resultPayload));
    await redis.setex(shareHashKey, config.ttl.job, share.hash);

    // Publish decode jobs for unique selectors in the tree (in parallel)
    const selectors = collectSelectors(normalizedTree);
    await Promise.all(
      selectors.map((sel) => publishJob(QUEUES.TX_DECODE, { jobId: `${jobId}-${sel}`, selector: sel })),
    );

    log.info(`done job ${jobId} — shareHash ${share.hash}`);
  } catch (err: any) {
    log.error(`error job ${jobId}:`, err.message);
    await redis.setex(statusKey, config.ttl.job, 'failed');
    await redis.setex(outputKey, config.ttl.job, JSON.stringify({ error: err.message }));
    throw err;
  }
}
