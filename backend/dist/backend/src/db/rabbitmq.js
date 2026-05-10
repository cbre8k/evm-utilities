"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUEUES = void 0;
exports.connectRabbitMQ = connectRabbitMQ;
exports.getPublishChannel = getPublishChannel;
exports.createConsumerChannel = createConsumerChannel;
exports.getRabbitMQStatus = getRabbitMQStatus;
exports.publishJob = publishJob;
exports.consumeQueue = consumeQueue;
// ============================================================
// db/rabbitmq.ts — amqplib connection + channel factory
// ============================================================
const amqplib_1 = __importDefault(require("amqplib"));
const config_1 = require("../config");
// ── Queue names (single source of truth) ─────────────────────
exports.QUEUES = {
    TX_TRACE: 'tx.trace',
    TX_SIMULATE: 'tx.simulate',
    TX_DECODE: 'tx.decode',
};
let connection = null;
let publishChannel = null;
async function connectRabbitMQ() {
    if (connection)
        return connection;
    connection = await amqplib_1.default.connect(config_1.config.rabbitmq.url);
    console.log('[rabbitmq] connected to', config_1.config.rabbitmq.url);
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
async function getPublishChannel() {
    if (!publishChannel) {
        const conn = await connectRabbitMQ();
        publishChannel = await conn.createChannel();
        // Declare all queues as durable
        for (const q of Object.values(exports.QUEUES)) {
            await publishChannel.assertQueue(q, { durable: true });
        }
    }
    return publishChannel;
}
async function createConsumerChannel() {
    const conn = await connectRabbitMQ();
    const ch = await conn.createChannel();
    ch.prefetch(1); // process one job at a time per worker
    for (const q of Object.values(exports.QUEUES)) {
        await ch.assertQueue(q, { durable: true });
    }
    return ch;
}
async function getRabbitMQStatus() {
    try {
        await connectRabbitMQ();
        return connection !== null;
    }
    catch {
        return false;
    }
}
// ── Publisher helper ─────────────────────────────────────────
async function publishJob(queue, payload) {
    const ch = await getPublishChannel();
    return ch.sendToQueue(queue, Buffer.from(JSON.stringify(payload)), { persistent: true, contentType: 'application/json' });
}
// ── Consumer helper ──────────────────────────────────────────
async function consumeQueue(queue, handler) {
    const ch = await createConsumerChannel();
    console.log(`[rabbitmq] worker listening on queue: ${queue}`);
    await ch.consume(queue, async (msg) => {
        if (!msg)
            return;
        try {
            await handler(msg, ch);
            ch.ack(msg);
        }
        catch (err) {
            console.error(`[rabbitmq] handler error on ${queue}:`, err);
            ch.nack(msg, false, false); // dead-letter, don't requeue
        }
    });
}
//# sourceMappingURL=rabbitmq.js.map