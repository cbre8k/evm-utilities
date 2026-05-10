"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// ============================================================
// index.ts — Express app entry point
// ============================================================
require("module-alias/register"); // resolve @shared/* path alias at runtime
require("dotenv/config"); // must be first — loads .env before any other import
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const mongo_1 = require("./db/mongo");
const redis_1 = require("./db/redis");
const rabbitmq_1 = require("./db/rabbitmq");
const errorHandler_1 = require("./middleware/errorHandler");
const rateLimiter_1 = require("./middleware/rateLimiter");
const health_1 = __importDefault(require("./routes/health"));
const explorer_1 = __importDefault(require("./routes/explorer"));
const simulate_1 = __importDefault(require("./routes/simulate"));
const jobs_1 = __importDefault(require("./routes/jobs"));
const share_1 = __importDefault(require("./routes/share"));
const selectors_1 = __importDefault(require("./routes/selectors"));
const sourcify_1 = __importDefault(require("./routes/sourcify"));
const run_1 = __importDefault(require("./routes/run"));
const config_1 = require("./config");
const app = (0, express_1.default)();
// ── Global middleware ─────────────────────────────────────────
app.use((0, cors_1.default)({ origin: '*' }));
app.use(express_1.default.json({ limit: '2mb' }));
app.use(rateLimiter_1.rateLimiter);
// ── Routes ───────────────────────────────────────────────────
app.use('/health', health_1.default);
app.use('/explorer', explorer_1.default);
app.use('/simulate', simulate_1.default);
app.use('/jobs', jobs_1.default);
app.use('/share', share_1.default);
app.use('/selectors', selectors_1.default);
app.use('/sourcify', sourcify_1.default);
app.use('/run', run_1.default);
// ── Error handler (must be last) ─────────────────────────────
app.use(errorHandler_1.errorHandler);
// ── Startup ───────────────────────────────────────────────────
async function start() {
    // Always start listening first — routes will return 503 if infra is down
    app.listen(config_1.config.port, () => {
        console.log(`[server] listening on http://localhost:${config_1.config.port}`);
        console.log(`[server] env: ${config_1.config.nodeEnv}`);
    });
    // Connect to infrastructure — non-fatal, will retry on each request
    (0, mongo_1.connectMongo)().catch((err) => console.warn('[server] mongo not available:', err.message));
    try {
        (0, redis_1.getRedis)();
    }
    catch (err) {
        console.warn('[server] redis not available:', err.message);
    }
    (0, rabbitmq_1.connectRabbitMQ)()
        .then(() => {
        // Start workers only when RabbitMQ is available
        Promise.resolve().then(() => __importStar(require('./workers/index'))).catch((err) => console.warn('[server] workers failed to start:', err.message));
    })
        .catch((err) => console.warn('[server] rabbitmq not available (workers disabled):', err.message));
}
start().catch((err) => {
    console.error('[server] fatal startup error:', err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map