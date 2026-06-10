import { Schema, model, Document } from 'mongoose';

export interface IMetricEvent extends Document {
  id: string;
  chainId: number;
  createdAt: Date;
  event: Record<string, unknown>;
}

const MetricEventSchema = new Schema<IMetricEvent>({
  id: { type: String, required: true, unique: true, index: true },
  chainId: { type: Number, required: true, index: true },
  createdAt: { type: Date, required: true, index: true },
  event: { type: Schema.Types.Mixed, required: true },
});

MetricEventSchema.index({ chainId: 1, createdAt: -1 });

export const MetricEvent = model<IMetricEvent>('MetricEvent', MetricEventSchema);
