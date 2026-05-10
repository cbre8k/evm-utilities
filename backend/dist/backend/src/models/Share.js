"use strict";
// ============================================================
// models/Share.ts
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.Share = void 0;
const mongoose_1 = require("mongoose");
const ShareSchema = new mongoose_1.Schema({
    hash: { type: String, required: true, unique: true, index: true },
    type: { type: String, enum: ['trace', 'simulate'], required: true },
    rpcUrl: { type: String, required: true },
    chainId: { type: Number },
    createdAt: { type: Date, default: Date.now },
    viewCount: { type: Number, default: 0 },
    // Trace
    txHash: { type: String, index: true, sparse: true },
    txOverview: { type: mongoose_1.Schema.Types.Mixed },
    normalizedTrace: { type: mongoose_1.Schema.Types.Mixed },
    tokenTransfers: { type: [mongoose_1.Schema.Types.Mixed], default: [] },
    decodedCalldata: { type: mongoose_1.Schema.Types.Mixed },
    decodedOutput: { type: mongoose_1.Schema.Types.Mixed },
    // Simulate
    simulateInputs: { type: mongoose_1.Schema.Types.Mixed },
    simulateOutput: { type: String },
    simulateExitCode: { type: Number },
    simulateSuccess: { type: Boolean },
});
// Compound index so same tx on same chain always gets the same share
ShareSchema.index({ txHash: 1, chainId: 1, type: 1 }, { sparse: true });
exports.Share = (0, mongoose_1.model)('Share', ShareSchema);
//# sourceMappingURL=Share.js.map