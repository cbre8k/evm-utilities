"use strict";
// ============================================================
// workers/decodeWorker.ts — consumes tx.decode queue
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.startDecodeWorker = startDecodeWorker;
const rabbitmq_1 = require("../db/rabbitmq");
const selectorService_1 = require("../services/selectorService");
async function startDecodeWorker() {
    await (0, rabbitmq_1.consumeQueue)(rabbitmq_1.QUEUES.TX_DECODE, handleDecodeJob);
}
async function handleDecodeJob(msg, _ch) {
    const { selector } = JSON.parse(msg.content.toString());
    // lookupSelector handles its own cache-aside (Redis → Mongo → 4byte)
    const result = await (0, selectorService_1.lookupSelector)(selector);
    if (result) {
        console.log(`[decodeWorker] decoded ${selector} → ${result.functionName}`);
    }
}
//# sourceMappingURL=decodeWorker.js.map