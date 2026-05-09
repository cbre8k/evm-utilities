// ============================================================
// shared/types/trace.ts — Call trace tree types
// ============================================================

import type { DecodedArg, DecodedOutputValue } from './decoded';

/**
 * All call types the EVM callTracer can emit.
 *
 * Standard call opcodes
 *   CALL          — regular external call (EIP-150)
 *   CALLCODE      — legacy call inheriting caller context (deprecated, still valid)
 *   STATICCALL    — read-only call, no state mutations (EIP-214)
 *   DELEGATECALL  — call preserving msg.sender + msg.value + storage (EIP-7)
 *
 * Contract deployment
 *   CREATE        — deploy via new contract() (deterministic address)
 *   CREATE2       — deploy with salt, address = keccak(0xff, deployer, salt, initcodeHash) (EIP-1014)
 *
 * Termination opcodes (appear as trace nodes in some tracers)
 *   STOP          — normal execution end, no data returned
 *   RETURN        — normal execution end with return data
 *   REVERT        — state-reverting execution end (EIP-140)
 *   INVALID       — invalid opcode, consumes all remaining gas
 *   SELFDESTRUCT  — send balance to target + mark for deletion (EIP-6 / EIP-3529)
 */
export type TraceCallType =
  | 'CALL'
  | 'CALLCODE'
  | 'STATICCALL'
  | 'DELEGATECALL'
  | 'CREATE'
  | 'CREATE2'
  | 'STOP'
  | 'RETURN'
  | 'REVERT'
  | 'INVALID'
  | 'SELFDESTRUCT';

export interface TraceNode {
  id: string;
  parentId?: string;
  depth: number;
  type: TraceCallType;
  from: string;
  to: string | null;
  input: string;
  output: string;
  value: string;
  gas: string;
  gasUsed: string;
  error?: string;
  revertReason?: string;
  decodedFunction?: string;
  decodedArgs?: DecodedArg[];
  decoded_input?: DecodedArg[];
  decoded_output?: DecodedOutputValue[];
  contract_name?: string;
  function_name?: string;
  call_type?: string;
  function_line_number?: number;
  function_file_index?: number;
  caller_op?: string;
  logs?: TraceLog[];
  children: TraceNode[];
}

/**
 * A log entry inlined inside a callTracer node (withLog: true).
 * topic0 is the event signature hash; topic1–3 are indexed args.
 */
export interface TraceLog {
  address: string;
  topics: string[];
  data: string;
  name?: string;
  EmitterAddress?: string;
  inputs?: DecodedArg[];
}

/**
 * Individual opcode entry from debug_traceTransaction structlog.
 * Filtered to significant opcodes only.
 */
export interface FilteredStructLog {
  pc: number;
  op: string;
  gas: number;
  gasCost: number;
  depth: number;
  jumpTo?: string;
  jumpCondition?: string;
  jumpStack?: string[];
  jumpMemory?: string[];
  sourceLabel?: string;
  sourceFile?: string;
  sourceLine?: number;
  sourceJump?: string;
  jumpTargetLabel?: string;
  jumpTargetFile?: string;
  jumpTargetLine?: number;
  jumpTargetParams?: { name: string; type: string }[];
  jumpTargetFunction?: string;
  jumpTargetFunctionParams?: string[];
  jumpTargetFunctionReturnsValue?: boolean;
  truncated?: boolean;
  storageKey?: string;
  storagePre?: string;
  storagePost?: string;
  /** topic0..topicN extracted from EVM stack for LOG0..LOG4 opcodes */
  logTopics?: string[];
  error?: string;
}
