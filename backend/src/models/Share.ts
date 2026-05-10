// ============================================================
// models/Share.ts
// ============================================================

import { Schema, model, Document } from 'mongoose';
import type {
  TxOverview,
  TraceNode,
  TokenTransfer,
  DecodedCalldata,
  DecodedOutput,
  SimulationInputs,
} from '../types';

export interface IShare extends Document {
  hash: string;      // nanoid(10) — the public share ID
  type: 'trace' | 'simulate';
  rpcUrl: string;
  chainId?: number;
  createdAt: Date;
  viewCount: number;

  // Trace-specific
  txHash?: string;
  txOverview?: TxOverview;
  normalizedTrace?: TraceNode;
  tokenTransfers?: TokenTransfer[];
  decodedCalldata?: DecodedCalldata;
  decodedOutput?: DecodedOutput;

  // Simulate-specific
  simulateInputs?: SimulationInputs & { rpcUrl: string };
  simulateOutput?: string;
  simulateExitCode?: number;
  simulateSuccess?: boolean;
}

const ShareSchema = new Schema<IShare>({
  hash: { type: String, required: true, unique: true, index: true },
  type: { type: String, enum: ['trace', 'simulate'], required: true },
  rpcUrl: { type: String, required: true },
  chainId: { type: Number },
  createdAt: { type: Date, default: Date.now },
  viewCount: { type: Number, default: 0 },

  // Trace
  txHash: { type: String, index: true, sparse: true },
  txOverview: { type: Schema.Types.Mixed },
  normalizedTrace: { type: Schema.Types.Mixed },
  tokenTransfers: { type: [Schema.Types.Mixed], default: [] },
  decodedCalldata: { type: Schema.Types.Mixed },
  decodedOutput: { type: Schema.Types.Mixed },

  // Simulate
  simulateInputs: { type: Schema.Types.Mixed },
  simulateOutput: { type: String },
  simulateExitCode: { type: Number },
  simulateSuccess: { type: Boolean },
});

// Compound index so same tx on same chain always gets the same share
ShareSchema.index({ txHash: 1, chainId: 1, type: 1 }, { sparse: true });

export const Share = model<IShare>('Share', ShareSchema);
