import { Schema, model, Document } from 'mongoose';

export interface IMetricProviderStat extends Document {
  provider: string;
  chainId: number;
  totalQuotes: number;
  successQuotes: number;
  failedQuotes: number;
  bestQuoteCount: number;
  underquoteCount: number;
  overquoteCount: number;
  equalQuoteCount: number;
  deviationSum: number;
  absoluteDeviationSum: number;
  gasSum: number;
  gasMin?: number;
  gasMax?: number;
  latencySum: number;
  latencyMin?: number;
  latencyMax?: number;
  timeoutCount: number;
  updatedAt: Date;
}

const MetricProviderStatSchema = new Schema<IMetricProviderStat>({
  provider: { type: String, required: true },
  chainId: { type: Number, required: true },
  totalQuotes: { type: Number, default: 0 },
  successQuotes: { type: Number, default: 0 },
  failedQuotes: { type: Number, default: 0 },
  bestQuoteCount: { type: Number, default: 0 },
  underquoteCount: { type: Number, default: 0 },
  overquoteCount: { type: Number, default: 0 },
  equalQuoteCount: { type: Number, default: 0 },
  deviationSum: { type: Number, default: 0 },
  absoluteDeviationSum: { type: Number, default: 0 },
  gasSum: { type: Number, default: 0 },
  gasMin: { type: Number },
  gasMax: { type: Number },
  latencySum: { type: Number, default: 0 },
  latencyMin: { type: Number },
  latencyMax: { type: Number },
  timeoutCount: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
});

MetricProviderStatSchema.index({ chainId: 1, provider: 1 }, { unique: true });

export const MetricProviderStat = model<IMetricProviderStat>('MetricProviderStat', MetricProviderStatSchema);
