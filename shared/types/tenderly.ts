// ============================================================
// shared/types/tenderly.ts — Tenderly-compatible response shapes
// ============================================================

export interface TenderlyTokenInfo {
  standard?: string;
  type?: string;
  contract_address?: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  dollar_value?: string;
  logo?: string;
}

export interface TenderlyAssetChange {
  token_info?: TenderlyTokenInfo;
  type: string;
  from?: string;
  to?: string;
  amount?: string;
  raw_amount?: string;
  dollar_value?: string;
  trace_absolute_position?: number;
}

export interface TenderlyExposureChange {
  token_info?: TenderlyTokenInfo;
  type: string;
  owner?: string;
  spender?: string;
  amount?: string;
  raw_amount?: string;
  dollar_value?: string;
}

export interface TenderlyBalanceChange {
  address: string;
  dollar_value?: string;
  transfers?: number[];
}
