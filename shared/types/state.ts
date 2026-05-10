// ============================================================
// shared/types/state.ts — State diffs + gas profiling
// ============================================================

export interface StorageChange {
  slot: string;
  before: string;
  after: string;
}

export interface AddressStateDiff {
  address: string;
  balanceBefore?: string;
  balanceAfter?: string;
  nonceBefore?: number;
  nonceAfter?: number;
  codeChanged?: boolean;
  storageChanges: StorageChange[];
}

export interface GasNode {
  id: string;
  label: string;
  gasUsed: number;
  gasLimit: number;
  selfGas: number;
  depth: number;
  children: GasNode[];
}
