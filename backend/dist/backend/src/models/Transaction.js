"use strict";
// ============================================================
// models/Transaction.ts
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.Transaction = void 0;
const mongoose_1 = require("mongoose");
const TransactionSchema = new mongoose_1.Schema({
    hash: { type: String, required: true, index: true },
    chainId: { type: Number, required: true },
    blockNumber: { type: Number, required: true },
    from: { type: String, required: true, lowercase: true },
    to: { type: String, default: null, lowercase: true },
    value: { type: String, required: true },
    gas: { type: Number, required: true },
    gasPrice: { type: String, required: true },
    input: { type: String, required: true },
    status: { type: String, enum: ['success', 'failed', 'pending'], required: true },
    fetchedAt: { type: Date, default: Date.now },
});
TransactionSchema.index({ hash: 1, chainId: 1 }, { unique: true });
exports.Transaction = (0, mongoose_1.model)('Transaction', TransactionSchema);
//# sourceMappingURL=Transaction.js.map