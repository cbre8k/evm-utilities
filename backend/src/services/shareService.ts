// ============================================================
// services/shareService.ts — nanoid generation + CRUD
// ============================================================

import { nanoid } from 'nanoid';
import { Share, IShare } from '../models/Share';
import { cacheGet, cacheSet } from '../db/redis';
import type { ShareTraceData, ShareSimulateData } from '../types';

const SHARE_REDIS_PREFIX = 'share:';

// ── Create ───────────────────────────────────────────────────

export async function createTraceShare(data: ShareTraceData): Promise<IShare> {
  // Idempotent: same txHash + chainId → same share
  const existing = await Share.findOne({
    txHash: data.txHash.toLowerCase(),
    chainId: data.chainId,
    type: 'trace',
  });
  if (existing) {
    if (existing.txOverview && (!existing.txOverview.timestamp || !existing.txOverview.txType)) {
      existing.txOverview = {
        ...existing.txOverview,
        timestamp: existing.txOverview.timestamp ?? data.txOverview.timestamp,
        txType: existing.txOverview.txType ?? data.txOverview.txType,
      };
      await existing.save();
    }
    await refreshShareCache(existing);
    return existing;
  }

  const hash = nanoid(10);
  const share = await Share.create({
    hash,
    type: 'trace',
    rpcUrl: data.rpcUrl,
    chainId: data.chainId,
    txHash: data.txHash.toLowerCase(),
    txOverview: data.txOverview,
    normalizedTrace: data.normalizedTrace,
    tokenTransfers: data.tokenTransfers,
    decodedCalldata: data.decodedCalldata,
    decodedOutput: data.decodedOutput,
  });

  await refreshShareCache(share);
  return share;
}

export async function createSimulateShare(data: ShareSimulateData): Promise<IShare> {
  const hash = nanoid(10);
  const share = await Share.create({
    hash,
    type: 'simulate',
    rpcUrl: data.rpcUrl,
    simulateInputs: { ...data.inputs, rpcUrl: data.rpcUrl },
    simulateOutput: data.output,
    simulateExitCode: data.exitCode,
    simulateSuccess: data.success,
  });

  await refreshShareCache(share);
  return share;
}

// ── Read ─────────────────────────────────────────────────────

export async function getShare(hash: string): Promise<IShare | null> {
  // 1. Redis
  const cached = await cacheGet<IShare>(SHARE_REDIS_PREFIX + hash);
  if (cached) {
    // increment view count asynchronously — don't block response
    Share.updateOne({ hash }, { $inc: { viewCount: 1 } }).exec().catch(() => {});
    return cached;
  }

  // 2. MongoDB
  const share = await Share.findOneAndUpdate(
    { hash },
    { $inc: { viewCount: 1 } },
    { new: true }
  );
  if (!share) return null;

  await refreshShareCache(share);
  return share;
}

// ── Internal ─────────────────────────────────────────────────

async function refreshShareCache(share: IShare): Promise<void> {
  // Shares are permanent — no TTL
  await cacheSet(SHARE_REDIS_PREFIX + share.hash, share.toObject());
}
