// ============================================================
// models/Simulation.ts
// ============================================================

import { Schema, model, Document } from 'mongoose';
import type { SimulationInputs } from '../types';

export interface ISimulation extends Document {
  jobId: string;
  shareHash?: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  inputs: SimulationInputs & { rpcUrl: string; scriptContent?: string };
  output: string;
  exitCode?: number;
  success?: boolean;
  createdAt: Date;
  completedAt?: Date;
}

const SimulationSchema = new Schema<ISimulation>({
  jobId: { type: String, required: true, unique: true, index: true },
  shareHash: { type: String, index: true, sparse: true },
  status: {
    type: String,
    enum: ['queued', 'running', 'done', 'failed'],
    default: 'queued',
  },
  inputs: { type: Schema.Types.Mixed, required: true },
  output: { type: String, default: '' },
  exitCode: { type: Number },
  success: { type: Boolean },
  createdAt: { type: Date, default: Date.now },
  completedAt: { type: Date },
});

export const Simulation = model<ISimulation>('Simulation', SimulationSchema);
