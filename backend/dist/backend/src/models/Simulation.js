"use strict";
// ============================================================
// models/Simulation.ts
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.Simulation = void 0;
const mongoose_1 = require("mongoose");
const SimulationSchema = new mongoose_1.Schema({
    jobId: { type: String, required: true, unique: true, index: true },
    shareHash: { type: String, index: true, sparse: true },
    status: {
        type: String,
        enum: ['queued', 'running', 'done', 'failed'],
        default: 'queued',
    },
    inputs: { type: mongoose_1.Schema.Types.Mixed, required: true },
    output: { type: String, default: '' },
    exitCode: { type: Number },
    success: { type: Boolean },
    createdAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
});
exports.Simulation = (0, mongoose_1.model)('Simulation', SimulationSchema);
//# sourceMappingURL=Simulation.js.map