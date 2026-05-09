// ============================================================
// routes/explorer.ts — POST /explorer  (enqueue trace job)
// ============================================================

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { publishJob, QUEUES } from '../db/rabbitmq';
import { getRedis } from '../db/redis';
import { Trace } from '../models/Trace';
import { config } from '../config';
import type { TraceResultPayload } from '../types';
import { buildTxOverview } from '../services/rpcService';

const router = Router();

function asHexQuantity(value: unknown, fallback = '0x0') {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'string') return value.startsWith('0x') ? value : `0x${BigInt(value).toString(16)}`;
  if (typeof value === 'number') return `0x${BigInt(Math.max(0, Math.trunc(value))).toString(16)}`;
  return fallback;
}

function normalizeTenderlyCall(node: any, parentId?: string, index = 0): any {
  const id = parentId ? `${parentId}.${index}` : '0';
  const children = Array.isArray(node?.children)
    ? node.children
    : Array.isArray(node?.calls)
      ? node.calls
      : [];

  return {
    ...node,
    id,
    parentId,
    depth: parentId ? id.split('.').length - 1 : 0,
    type: node?.type ?? node?.call_type ?? node?.function_op ?? 'CALL',
    from: String(node?.from ?? node?.caller?.address ?? '').toLowerCase(),
    to: node?.to ? String(node.to).toLowerCase() : node?.address ? String(node.address).toLowerCase() : null,
    input: node?.input ?? '0x',
    output: node?.output ?? '0x',
    value: asHexQuantity(node?.value),
    gas: asHexQuantity(node?.gas),
    gasUsed: asHexQuantity(node?.gasUsed ?? node?.gas_used),
    decodedFunction: node?.decodedFunction ?? node?.function_name,
    decodedArgs: node?.decodedArgs ?? node?.decoded_input,
    logs: node?.logs ?? [],
    children: children.map((child: any, childIndex: number) => normalizeTenderlyCall(child, id, childIndex)),
  };
}

function buildTenderlyOverview(trace: any) {
  const call = trace.call_trace ?? trace.normalizedTree ?? {};
  const timestamp = call.block_timestamp || trace.created_at;
  return {
    hash: trace.transaction_id ?? call.hash ?? '',
    from: String(call.from ?? call.caller?.address ?? '').toLowerCase(),
    to: trace.contract_address ?? call.to ?? null,
    value: asHexQuantity(call.value),
    gasUsed: asHexQuantity(call.gas_used ?? call.gasUsed),
    gasLimit: asHexQuantity(call.gas),
    gasPrice: '0x0',
    blockNumber: Number(trace.block_number ?? call.block_number ?? 0),
    blockHash: '',
    timestamp: timestamp ? Math.floor(new Date(timestamp).getTime() / 1000) : undefined,
    txType: '0x0',
    txIndex: 0,
    nonce: 0,
    status: call.error ? 'failed' : 'success',
    input: call.input ?? '0x',
  };
}

function normalizeTracePayload(trace: any): TraceResultPayload {
  const normalizedTree = trace.normalizedTree ?? (trace.call_trace ? normalizeTenderlyCall(trace.call_trace) : undefined);
  const txOverview = trace.txOverview ?? buildTenderlyOverview(trace);

  return {
    chainId: trace.chainId ?? Number(trace.network_id ?? trace.call_trace?.network_id ?? 1),
    txOverview,
    normalizedTree,
    structLog: trace.structLog ?? [],
    addressLabels: trace.addressLabels ?? {},
    tokenLabels: trace.tokenLabels ?? {},
    allLogs: trace.allLogs ?? trace.logs ?? trace.call_trace?.logs ?? [],
    erc20Transfers: trace.erc20Transfers ?? [],
    erc721Transfers: trace.erc721Transfers ?? [],
    erc1155Transfers: trace.erc1155Transfers ?? [],
    nativeTransfers: trace.nativeTransfers ?? [],
    stateDiffs: trace.stateDiffs ?? [],
    gasTree: trace.gasTree,
    decodedCalldata: trace.decodedCalldata,
    decodedOutput: trace.decodedOutput,
    shareHash: trace.shareHash,
    shareUrl: trace.shareHash ? `/explorer?trace=${trace.shareHash}` : undefined,
    asset_changes: trace.asset_changes ?? trace.assetChanges ?? [],
    exposure_changes: trace.exposure_changes ?? trace.exposureChanges ?? [],
    balance_changes: trace.balance_changes ?? trace.balanceChanges ?? [],
  };
}

// GET /explorer/lookup?txHash=0x...&chainId=1
router.get('/lookup', async (req, res, next) => {
  try {
    const txHash = String(req.query.txHash ?? '').toLowerCase();
    const chainId = Number(req.query.chainId ?? 1);

    if (!txHash) {
      res.status(400).json({ error: 'txHash is required' });
      return;
    }

    const trace = await Trace.findOne({ txHash, chainId }).lean();
    if (!trace) {
      res.json({ found: false });
      return;
    }

    res.json({
      found: true,
      shareHash: trace.shareHash ?? undefined,
      traceId: String(trace._id),
      txHash,
      chainId,
    });
  } catch (err) {
    next(err);
  }
});

// GET /explorer/share/:hash
router.get('/share/:hash', async (req, res, next) => {
  try {
    const { hash } = req.params;
    const trace = await Trace.findOne({ shareHash: hash }).lean();

    if (!trace) {
      res.status(404).json({ error: 'Trace not found' });
      return;
    }

    res.json(normalizeTracePayload(trace));
  } catch (err) {
    next(err);
  }
});

// POST /explorer/overview
// Body: { txHash, rpcUrl, chainId? }
// Returns the lightweight transaction overview before the full trace job finishes.
router.post('/overview', async (req, res, next) => {
  try {
    const { txHash, rpcUrl, chainId } = req.body as {
      txHash: string;
      rpcUrl: string;
      chainId?: number;
    };

    if (!txHash || !rpcUrl) {
      res.status(400).json({ error: 'txHash and rpcUrl are required' });
      return;
    }

    const txOverview = await buildTxOverview(rpcUrl, txHash.toLowerCase());
    res.json({ chainId: chainId ?? 1, txOverview });
  } catch (err) {
    next(err);
  }
});

// POST /explorer
// Body: { txHash, rpcUrl, chainId? }
// Returns: { jobId }
router.post('/', async (req, res, next) => {
  try {
    const { txHash, rpcUrl, chainId, verbose = false } = req.body as {
      txHash: string;
      rpcUrl: string;
      chainId?: number;
      verbose?: boolean;
    };

    if (!txHash || !rpcUrl) {
      res.status(400).json({ error: 'txHash and rpcUrl are required' });
      return;
    }

    const normalizedHash = txHash.toLowerCase();
    const jobId = uuid();
    const redis = getRedis();

    await redis.setex(`job:${jobId}:status`, config.ttl.job, 'queued');

    await publishJob(QUEUES.TX_TRACE, {
      jobId,
      txHash: normalizedHash,
      rpcUrl,
      chainId: chainId ?? 1,
      verbose,
    });

    res.json({ jobId });
  } catch (err) {
    next(err);
  }
});

export default router;
