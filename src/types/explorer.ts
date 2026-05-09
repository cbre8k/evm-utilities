// ============================================================
// src/types/explorer.ts — Re-export shared types + frontend-only types
// ============================================================

// Re-export all shared types so existing imports keep working
export type {
  DecodedArg,
  DecodedCalldata,
  DecodedOutputValue,
  DecodedOutput,
} from '@shared/types/decoded';

export type {
  TraceCallType,
  TraceNode,
  TraceLog,
  FilteredStructLog,
} from '@shared/types/trace';

export type {
  TxOverview,
  TokenTransfer,
  NativeTransfer,
  ERC20Transfer,
  ERC721Transfer,
  ERC1155Transfer,
} from '@shared/types/transaction';

export type {
  StorageChange,
  AddressStateDiff,
  GasNode,
} from '@shared/types/state';

export type { EventLog } from '@shared/types/events';

export type {
  TenderlyTokenInfo,
  TenderlyAssetChange,
  TenderlyExposureChange,
  TenderlyBalanceChange,
} from '@shared/types/tenderly';

// ── Frontend-only types ──────────────────────────────────────

import type { TxOverview, TokenTransfer, ERC20Transfer, ERC721Transfer, ERC1155Transfer, NativeTransfer } from '@shared/types/transaction';
import type { TraceNode, TraceLog, FilteredStructLog } from '@shared/types/trace';
import type { DecodedCalldata, DecodedOutput } from '@shared/types/decoded';
import type { AddressStateDiff, GasNode } from '@shared/types/state';
import type { EventLog as EventLogType } from '@shared/types/events';
import type { TenderlyAssetChange, TenderlyExposureChange, TenderlyBalanceChange } from '@shared/types/tenderly';

export interface TraceResult {
  chainId?: number;
  txOverview: TxOverview;
  normalizedTree: TraceNode;
  structLog?: FilteredStructLog[];
  addressLabels?: Record<string, string>;
  tokenLabels?: Record<string, string>;
  allLogs: EventLogType[];
  erc20Transfers: ERC20Transfer[];
  erc721Transfers: ERC721Transfer[];
  erc1155Transfers: ERC1155Transfer[];
  nativeTransfers: NativeTransfer[];
  stateDiffs: AddressStateDiff[];
  gasTree: GasNode;
  decodedCalldata?: DecodedCalldata;
  decodedOutput?: DecodedOutput;
  shareHash?: string;
  shareUrl?: string;
  asset_changes?: TenderlyAssetChange[];
  exposure_changes?: TenderlyExposureChange[];
  balance_changes?: TenderlyBalanceChange[];
}
