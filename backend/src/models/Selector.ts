// ============================================================
// models/Selector.ts
// ============================================================

import { Schema, model, Document } from 'mongoose';

export interface ISelector extends Document {
  hex: string;       // "0xa9059cbb"
  functionName: string; // "transfer(address,uint256)"
  args: { name: string; type: string }[];
  source: '4byte' | 'openchain' | 'manual';
  cachedAt: Date;
}

const SelectorSchema = new Schema<ISelector>({
  hex: { type: String, required: true, unique: true, index: true },
  functionName: { type: String, required: true },
  args: {
    type: [
      new Schema(
        {
          name: { type: String, default: '' },
          // 'type' is a reserved Mongoose keyword — must wrap in explicit object
          type: { type: String, default: '' },
        },
        { _id: false }
      ),
    ],
    default: [],
  },
  source: { type: String, enum: ['4byte', 'openchain', 'manual'], default: '4byte' },
  cachedAt: { type: Date, default: Date.now },
});

export const Selector = model<ISelector>('Selector', SelectorSchema);
