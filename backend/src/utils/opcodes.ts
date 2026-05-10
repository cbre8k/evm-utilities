// ============================================================
// backend/src/utils/opcodes.ts — Re-export shared opcode data
// + backend-only INTERESTING_OPS filter set
// ============================================================

export type { OpcodeCategory, OpcodeInfo } from '@shared/utils/opcodes';
export { OPCODES, OPCODE_BY_NAME, OPCODE_BY_HEX, getOpcodeInfo } from '@shared/utils/opcodes';

/**
 * Opcodes worth including in the filtered structlog sent to the frontend.
 * Intentionally conservative — preserves state changes, call boundaries,
 * emitted events, and high-signal execution markers without shipping
 * the control-flow / stack / memory noise that dominates large traces.
 */
export const INTERESTING_OPS = new Set([
  // Storage
  'SLOAD', 'SSTORE',
  // Events
  'LOG0', 'LOG1', 'LOG2', 'LOG3', 'LOG4',
  // Internal control flow
  'JUMP', 'JUMPDEST',
  // Call variants
  'CALL', 'CALLCODE', 'STATICCALL', 'DELEGATECALL',
  // Deployment
  'CREATE', 'CREATE2',
  // Termination
  'REVERT', 'RETURN', 'STOP', 'INVALID', 'SELFDESTRUCT',
  // High-signal helpers
  'SHA3',
]);
