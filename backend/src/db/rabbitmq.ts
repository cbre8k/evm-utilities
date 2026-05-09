// ============================================================
// db/rabbitmq.ts — amqplib connection + channel factory
// ============================================================

import amqplib, { Connection, Channel, ConsumeMessage } from 'amqplib';
import { config } from '../config';

// ── Queue names (single source of truth) ─────────────────────
export const QUEUES = {
  TX_TRACE: 'tx.trace',
  TX_SIMULATE: 'tx.simulate',
  TX_DECODE: 'tx.decode',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

let connection: Connection | null = null;
let publishChannel: Channel | null = null;

export async function connectRabbitMQ(): Promise<Connection> {
  if (connection) return connection;

  connection = await amqplib.connect(config.rabbitmq.url);
  console.log('[rabbitmq] connected to', config.rabbitmq.url);

  connection.on('error', (err) => {
    console.error('[rabbitmq] connection error:', err.message);
    connection = null;
    publishChannel = null;
  });

  connection.on('close', () => {
    console.warn('[rabbitmq] connection closed');
    connection = null;
    publishChannel = null;
  });

  return connection;
}

export async function getPublishChannel(): Promise<Channel> {
  if (!publishChannel) {
    const conn = await connectRabbitMQ();
    publishChannel = await conn.createChannel();
    // Declare all queues as durable
    for (const q of Object.values(QUEUES)) {
      await publishChannel.assertQueue(q, { durable: true });
    }
  }
  return publishChannel;
}

export async function createConsumerChannel(): Promise<Channel> {
  const conn = await connectRabbitMQ();
  const ch = await conn.createChannel();
  ch.prefetch(1); // process one job at a time per worker
  for (const q of Object.values(QUEUES)) {
    await ch.assertQueue(q, { durable: true });
  }
  return ch;
}

export async function getRabbitMQStatus(): Promise<boolean> {
  try {
    await connectRabbitMQ();
    return connection !== null;
  } catch {
    return false;
  }
}

// ── Publisher helper ─────────────────────────────────────────

export async function publishJob(queue: QueueName, payload: object): Promise<boolean> {
  const ch = await getPublishChannel();
  return ch.sendToQueue(
    queue,
    Buffer.from(JSON.stringify(payload)),
    { persistent: true, contentType: 'application/json' }
  );
}

// ── Consumer helper ──────────────────────────────────────────

export async function consumeQueue(
  queue: QueueName,
  handler: (msg: ConsumeMessage, ch: Channel) => Promise<void>
): Promise<void> {
  const ch = await createConsumerChannel();
  console.log(`[rabbitmq] worker listening on queue: ${queue}`);

  await ch.consume(queue, async (msg) => {
    if (!msg) return;
    try {
      await handler(msg, ch);
      ch.ack(msg);
    } catch (err) {
      console.error(`[rabbitmq] handler error on ${queue}:`, err);
      ch.nack(msg, false, false); // dead-letter, don't requeue
    }
  });
}
