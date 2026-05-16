import type { TraceNode, TraceLog } from '@/types/explorer';

export interface AddressContext {
  addressLabels: Record<string, string>;
  tokenLabels: Record<string, string>;
  tokenAddresses: Set<string>;
}

export type CallEntry = {
  kind: 'call';
  node: TraceNode;
  depth: number;
  gasUsed: number;
  /** Display sender — e.g. logic address for child CALL inside DELEGATECALL */
  visibleFrom?: string;
  /** Display receiver — the contract being called */
  visibleTo?: string;
  /** Where SLOAD/SSTORE happen — proxy address for DELEGATECALL */
  storageAddress?: string;
  /** Whether this frame is a DELEGATECALL/CALLCODE */
  isDelegateCall?: boolean;
  selector?: string;
};

export type StorageEntry = {
  kind: 'storage';
  depth: number;
  opcode: 'SLOAD' | 'SSTORE';
  address: string;
  slot: string;
  before: string;
  after: string;
  gasCost: number;
};

export type EventEntry = {
  kind: 'event';
  depth: number;
  opcode: string;
  address: string;
  topics: string[];
  data: string;
  gasCost: number;
  name?: string;
  inputs?: TraceLog['inputs'];
};

export type OpcodeEntry = {
  kind: 'opcode';
  depth: number;
  op: string;
  pc: number;
  gasCost: number;
  address?: string;
  error?: string;
  line?: number;
  file?: string;
  sourceStart?: number;
  sourceLength?: number;
  sourceFileIndex?: number;
  sourceJump?: string;
  jumpTo?: string;
  jumpCondition?: string;
  sourceLabel?: string;
  jumpTargetLabel?: string;
  jumpTargetFile?: string;
  jumpTargetLine?: number;
  jumpTargetParams?: { name: string; type: string }[];
  jumpTargetFunction?: string;
  jumpTargetFunctionParams?: string[];
  jumpResolvedParams?: string[];
  jumpTargetFunctionReturnsValue?: boolean;
  jumpStack?: string[];
  jumpMemory?: string[];
  selector?: string;
};

export type FlatEntry = CallEntry | StorageEntry | EventEntry | OpcodeEntry;
export type NonCallEntry = Exclude<FlatEntry, CallEntry>;

export type TraceStep = {
  kind: 'step';
  id: string;
  depth: number;
  entry: NonCallEntry;
  contractName?: string;
};

export type TraceFrame = {
  kind: 'frame';
  id: string;
  depth: number;
  entry: Extract<FlatEntry, { kind: 'call' }>;
  items: TraceItem[];
  returnValue?: {
    reverted: boolean;
    value: string;
  };
};

export type JumpFrame = {
  kind: 'jump-frame';
  id: string;
  depth: number;
  entry: OpcodeEntry;
  address: string;
  contractName?: string;
  items: TraceItem[];
  gasUsed: number;
  returnStack?: string[];
};

export type TraceItem = TraceFrame | JumpFrame | TraceStep;
