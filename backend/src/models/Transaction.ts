// ============================================================
// models/Transaction.ts
// ============================================================

import { Schema, model, Document } from 'mongoose';

export interface ITransaction extends Document {
  hash: string;
  chainId: number;
  blockNumber: number;
  from: string;
  to: string | null;
  value: string;
  gas: number;
  gasPrice: string;
  input: string;
  status: 'success' | 'failed' | 'pending';
  fetchedAt: Date;
}

const TransactionSchema = new Schema<ITransaction>({
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

export const Transaction = model<ITransaction>('Transaction', TransactionSchema);
