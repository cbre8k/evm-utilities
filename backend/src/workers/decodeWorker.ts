// ============================================================
// workers/decodeWorker.ts — consumes tx.decode queue
// ============================================================

import type { ConsumeMessage, Channel } from 'amqplib';
import { QUEUES, consumeQueue } from '../db/rabbitmq';
import { lookupSelector } from '../services/selectorService';
import type { DecodeJobMessage } from '../types';
import { createLogger } from '@shared/utils/logger';

const log = createLogger('decodeWorker');

export async function startDecodeWorker(): Promise<void> {
  await consumeQueue(QUEUES.TX_DECODE, handleDecodeJob);
}

async function handleDecodeJob(msg: ConsumeMessage, _ch: Channel): Promise<void> {
  const { selector } = JSON.parse(msg.content.toString()) as DecodeJobMessage;

  // lookupSelector handles its own cache-aside (Redis → Mongo → 4byte)
  const result = await lookupSelector(selector);
  if (result) {
    log.info(`decoded ${selector} → ${result.functionName}`);
  }
}
