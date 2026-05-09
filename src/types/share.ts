import type { DecodedCalldata, TokenTransfer, TraceNode, TxOverview } from './explorer';

export type SimulateInputValue = string | number | boolean | null | undefined;

export interface TraceShare {
  type: 'trace';
  createdAt: string;
  viewCount: number;
  txHash?: string;
  txOverview?: TxOverview;
  decodedCalldata?: DecodedCalldata;
  tokenTransfers?: TokenTransfer[];
  normalizedTrace?: TraceNode;
}

export interface SimulationShare {
  type: 'simulate';
  createdAt: string;
  viewCount: number;
  simulateSuccess?: boolean;
  simulateInputs?: Record<string, SimulateInputValue>;
  simulateExitCode?: number | string;
  simulateOutput?: string;
}

export type ShareData = TraceShare | SimulationShare;
