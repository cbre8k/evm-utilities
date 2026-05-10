"use strict";
// ============================================================
// models/Selector.ts
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.Selector = void 0;
const mongoose_1 = require("mongoose");
const SelectorSchema = new mongoose_1.Schema({
    hex: { type: String, required: true, unique: true, index: true },
    functionName: { type: String, required: true },
    args: {
        type: [
            new mongoose_1.Schema({
                name: { type: String, default: '' },
                // 'type' is a reserved Mongoose keyword — must wrap in explicit object
                type: { type: String, default: '' },
            }, { _id: false }),
        ],
        default: [],
    },
    source: { type: String, enum: ['4byte', 'openchain', 'manual'], default: '4byte' },
    cachedAt: { type: Date, default: Date.now },
});
exports.Selector = (0, mongoose_1.model)('Selector', SelectorSchema);
//# sourceMappingURL=Selector.js.map