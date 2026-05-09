import type { TraceCallType } from '@/types/explorer';

export const CALL_OPS = new Set<string>([
  'CALL',
  'CALLCODE',
  'STATICCALL',
  'DELEGATECALL',
  'CREATE',
  'CREATE2',
]);

export const HIDDEN_OPCODE_ROWS = new Set<string>(['JUMPDEST']);

export const VISIBLE_OPCODE_ROWS = new Set<string>(['JUMPI', 'REVERT', 'INVALID', 'SELFDESTRUCT']);

export const RETURN_TRUE =
  '0x0000000000000000000000000000000000000000000000000000000000000001';

export const RETURN_FALSE =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

export const ZERO_WORD =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

export const EVENT_SIGNATURES: Record<string, string> = {
  '0xddf252ad': 'Transfer',
  '0x8c5be1e5': 'Approval',
  '0xc3d58168': 'TransferSingle',
  '0x4a39dc06': 'TransferBatch',
  '0xe1fffcc4': 'Deposit',
  '0x7fcf532c': 'Withdrawal',
  '0xd78ad95f': 'Swap',
  '0x1c411e9a': 'Sync',
  '0x0d3648bd': 'PairCreated',
};

export const SHORT_OPCODE_LABELS: Partial<Record<TraceCallType | string, string>> = {
  STATICCALL: 'S:CALL',
  DELEGATECALL: 'D:CALL',
};

export const MAX_INLINE_ARGS = 3;
export const MAX_INLINE_EVENT_ARGS = 4;
