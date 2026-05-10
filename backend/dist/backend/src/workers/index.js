"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// ============================================================
// workers/index.ts — starts all workers in one process
// ============================================================
require("module-alias/register");
const mongo_1 = require("../db/mongo");
const redis_1 = require("../db/redis");
const rabbitmq_1 = require("../db/rabbitmq");
const traceWorker_1 = require("./traceWorker");
const simulateWorker_1 = require("./simulateWorker");
const decodeWorker_1 = require("./decodeWorker");
async function main() {
    console.log('[workers] starting...');
    await (0, mongo_1.connectMongo)();
    (0, redis_1.getRedis)(); // init redis connection
    await (0, rabbitmq_1.connectRabbitMQ)();
    await Promise.all([
        (0, traceWorker_1.startTraceWorker)(),
        (0, simulateWorker_1.startSimulateWorker)(),
        (0, decodeWorker_1.startDecodeWorker)(),
    ]);
    console.log('[workers] all workers running');
}
main().catch((err) => {
    console.error('[workers] fatal error:', err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map