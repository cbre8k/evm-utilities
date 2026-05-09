// ============================================================
// models/Trace.ts
// ============================================================

import { Schema, model, Document } from 'mongoose';
import type {
  TraceNode,
  TokenTransfer,
  TxOverview,
  DecodedCalldata,
  DecodedOutput,
  EventLog,
  ERC20Transfer,
  ERC721Transfer,
  ERC1155Transfer,
  NativeTransfer,
  AddressStateDiff,
  GasNode,
  FilteredStructLog,
  TenderlyAssetChange,
  TenderlyExposureChange,
  TenderlyBalanceChange,
} from '../types';

export interface ITrace extends Document {
  txHash: string;
  chainId: number;
  shareHash?: string;
  txOverview: TxOverview;
  rawCallTree: object;
  normalizedTree: TraceNode;
  tokenTransfers: TokenTransfer[];
  decodedCalldata?: DecodedCalldata;
  decodedOutput?: DecodedOutput;
  structLog?: FilteredStructLog[];
  addressLabels?: Record<string, string>;
  tokenLabels?: Record<string, string>;
  allLogs: EventLog[];
  erc20Transfers: ERC20Transfer[];
  erc721Transfers: ERC721Transfer[];
  erc1155Transfers: ERC1155Transfer[];
  nativeTransfers: NativeTransfer[];
  stateDiffs: AddressStateDiff[];
  asset_changes?: TenderlyAssetChange[];
  exposure_changes?: TenderlyExposureChange[];
  balance_changes?: TenderlyBalanceChange[];
  gasTree?: GasNode;
  gasUsed: string;
  fetchedAt: Date;
}

const TraceSchema = new Schema<ITrace>({
  txHash: { type: String, required: true },
  chainId: { type: Number, required: true },
  shareHash: { type: String, index: true, sparse: true },
  txOverview: { type: Schema.Types.Mixed, required: true },
  rawCallTree: { type: Schema.Types.Mixed, required: true },
  normalizedTree: { type: Schema.Types.Mixed, required: true },
  tokenTransfers: { type: [Schema.Types.Mixed], default: [] },
  decodedCalldata: { type: Schema.Types.Mixed },
  decodedOutput: { type: Schema.Types.Mixed },
  structLog: { type: Schema.Types.Mixed, default: [] },
  addressLabels: { type: Schema.Types.Mixed, default: {} },
  tokenLabels: { type: Schema.Types.Mixed, default: {} },
  allLogs: { type: Schema.Types.Mixed, default: [] },
  erc20Transfers: { type: Schema.Types.Mixed, default: [] },
  erc721Transfers: { type: Schema.Types.Mixed, default: [] },
  erc1155Transfers: { type: Schema.Types.Mixed, default: [] },
  nativeTransfers: { type: Schema.Types.Mixed, default: [] },
  stateDiffs: { type: Schema.Types.Mixed, default: [] },
  asset_changes: { type: Schema.Types.Mixed, default: [] },
  exposure_changes: { type: Schema.Types.Mixed, default: [] },
  balance_changes: { type: Schema.Types.Mixed, default: [] },
  gasTree: { type: Schema.Types.Mixed },
  gasUsed: { type: String, required: true },
  fetchedAt: { type: Date, default: Date.now },
});

TraceSchema.index({ txHash: 1, chainId: 1 }, { unique: true });

export const Trace = model<ITrace>('Trace', TraceSchema);
