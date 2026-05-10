"use strict";
// ============================================================
// models/Trace.ts
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.Trace = void 0;
const mongoose_1 = require("mongoose");
const TraceSchema = new mongoose_1.Schema({
    txHash: { type: String, required: true },
    chainId: { type: Number, required: true },
    shareHash: { type: String, index: true, sparse: true },
    txOverview: { type: mongoose_1.Schema.Types.Mixed, required: true },
    rawCallTree: { type: mongoose_1.Schema.Types.Mixed, required: true },
    normalizedTree: { type: mongoose_1.Schema.Types.Mixed, required: true },
    tokenTransfers: { type: mongoose_1.Schema.Types.Mixed, default: [] },
    decodedCalldata: { type: mongoose_1.Schema.Types.Mixed },
    decodedOutput: { type: mongoose_1.Schema.Types.Mixed },
    structLog: { type: mongoose_1.Schema.Types.Mixed, default: [] },
    addressLabels: { type: mongoose_1.Schema.Types.Mixed, default: {} },
    tokenLabels: { type: mongoose_1.Schema.Types.Mixed, default: {} },
    allLogs: { type: mongoose_1.Schema.Types.Mixed, default: [] },
    erc20Transfers: { type: mongoose_1.Schema.Types.Mixed, default: [] },
    erc721Transfers: { type: mongoose_1.Schema.Types.Mixed, default: [] },
    erc1155Transfers: { type: mongoose_1.Schema.Types.Mixed, default: [] },
    nativeTransfers: { type: mongoose_1.Schema.Types.Mixed, default: [] },
    stateDiffs: { type: mongoose_1.Schema.Types.Mixed, default: [] },
    asset_changes: { type: mongoose_1.Schema.Types.Mixed, default: [] },
    exposure_changes: { type: mongoose_1.Schema.Types.Mixed, default: [] },
    balance_changes: { type: mongoose_1.Schema.Types.Mixed, default: [] },
    gasTree: { type: mongoose_1.Schema.Types.Mixed },
    gasUsed: { type: String, required: true },
    fetchedAt: { type: Date, default: Date.now },
});
TraceSchema.index({ txHash: 1, chainId: 1 }, { unique: true });
exports.Trace = (0, mongoose_1.model)('Trace', TraceSchema);
//# sourceMappingURL=Trace.js.map