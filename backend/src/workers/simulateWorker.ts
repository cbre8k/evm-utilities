// ============================================================
// workers/simulateWorker.ts — consumes tx.simulate queue
// ============================================================

import type { ConsumeMessage, Channel } from 'amqplib';
import { QUEUES, consumeQueue } from '../db/rabbitmq';
import { getRedis } from '../db/redis';
import { Simulation } from '../models/Simulation';
import { createSimulateShare } from '../services/shareService';
import { runSimulation } from '../services/foundryService';
import { runTraceCallManySimulation } from '../services/traceCallManySimulationService';
import { config } from '../config';
import type { SimulateJobMessage, SimulationInputs } from '../types';

export async function startSimulateWorker(): Promise<void> {
  await consumeQueue(QUEUES.TX_SIMULATE, handleSimulateJob);
}

async function handleSimulateJob(msg: ConsumeMessage, _ch: Channel): Promise<void> {
  const { jobId, inputs } =
    JSON.parse(msg.content.toString()) as SimulateJobMessage;

  console.log(`[simulateWorker] processing job ${jobId}`);

  const redis = getRedis();
  const statusKey = `job:${jobId}:status`;
  const outputKey = `job:${jobId}:output`;
  const shareHashKey = `job:${jobId}:shareHash`;

  try {
    await redis.setex(statusKey, config.ttl.job, 'running');
    await Simulation.findOneAndUpdate({ jobId }, { status: 'running' });

    let accumulatedOutput = '';

    const appendOutput = async (chunk: string) => {
      accumulatedOutput += chunk;
      // Write chunk to Redis for SSE streaming
      await redis.setex(
        outputKey,
        config.ttl.job,
        JSON.stringify({ status: 'running', output: accumulatedOutput })
      );
    };

    const result = inputs.mode === 'traceCallMany'
      ? await runTraceCallManySimulation(inputs, appendOutput)
      : await runSimulation(inputs.scriptContent, appendOutput);

    // ── Persist result ────────────────────────────────────────
    const legacyInputs = inputs as Partial<SimulationInputs> & { rpcUrl: string };
    const { from, to, calldata, value, blockNumber,
      shouldDealToken, tokenAddress, spender, amount, rpcUrl } = legacyInputs;

    const share = await createSimulateShare({
      rpcUrl,
      inputs: {
        from: from || ('userAddress' in inputs ? inputs.userAddress : ''),
        to: to || ('quotes' in inputs ? inputs.quotes[0]?.to || '' : ''),
        calldata: calldata || ('quotes' in inputs ? inputs.quotes[0]?.data || '' : ''),
        value: value || ('quotes' in inputs ? inputs.quotes[0]?.value || '0' : '0'),
        blockNumber: blockNumber || ('blockNumber' in inputs ? inputs.blockNumber || '' : ''),
        shouldDealToken: shouldDealToken ?? false,
        tokenAddress: tokenAddress || ('tokenIn' in inputs ? inputs.tokenIn : ''),
        spender: spender || ('quotes' in inputs ? inputs.quotes[0]?.approveSpender || '' : ''),
        amount: amount || ('amountInRaw' in inputs ? inputs.amountInRaw : ''),
      },
      output: result.output,
      exitCode: result.exitCode,
      success: result.success,
    });

    await Simulation.findOneAndUpdate(
      { jobId },
      {
        status: result.success ? 'done' : 'failed',
        output: result.output,
        exitCode: result.exitCode,
        success: result.success,
        shareHash: share.hash,
        completedAt: new Date(),
      }
    );

    const finalPayload = JSON.stringify({
      status: 'done',
      output: result.output,
      exitCode: result.exitCode,
      success: result.success,
      shareHash: share.hash,
      shareUrl: `/s/${share.hash}`,
    });

    await redis.setex(statusKey, config.ttl.job, result.success ? 'done' : 'failed');
    await redis.setex(outputKey, config.ttl.job, finalPayload);
    await redis.setex(shareHashKey, config.ttl.job, share.hash);

    console.log(`[simulateWorker] done job ${jobId} — shareHash ${share.hash}`);
  } catch (err: any) {
    console.error(`[simulateWorker] error job ${jobId}:`, err.message);
    await redis.setex(statusKey, config.ttl.job, 'failed');
    await redis.setex(
      outputKey,
      config.ttl.job,
      JSON.stringify({ status: 'failed', error: err.message })
    );
    await Simulation.findOneAndUpdate({ jobId }, { status: 'failed', completedAt: new Date() });
    throw err;
  }
}
