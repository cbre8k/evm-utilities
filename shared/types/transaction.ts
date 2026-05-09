// ============================================================
// shared/types/transaction.ts — Transaction overview + token transfers
// ============================================================

export interface TxOverview {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  gasUsed: string;
  gasLimit: string;
  gasPrice: string;
  blockNumber: number;
  blockHash: string;
  timestamp?: number;
  txType?: string;
  txIndex: number;
  nonce: number;
  status: 'success' | 'failed';
  input: string;
}

export interface TokenTransfer {
  tokenAddress: string;
  from: string;
  to: string;
  amount: string;
  logIndex: number;
}

export interface NativeTransfer {
  from: string;
  to: string | null;
  value: string;
  callType: string;
  depth: number;
  callId: string;
}

export interface ERC20Transfer {
  tokenAddress: string;
  from: string;
  to: string;
  amount: string;
  logIndex: number;
  symbol?: string;
  name?: string;
  decimals?: number;
  dollarValue?: string;
  type?: string;
}

export interface ERC721Transfer {
  tokenAddress: string;
  from: string;
  to: string;
  tokenId: string;
  logIndex: number;
}

export interface ERC1155Transfer {
  tokenAddress: string;
  operator: string;
  from: string;
  to: string;
  id: string;
  value: string;
  logIndex: number;
  isBatch: boolean;
  batchIds?: string[];
  batchValues?: string[];
}
