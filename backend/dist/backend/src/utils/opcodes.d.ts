export type { OpcodeCategory, OpcodeInfo } from '@shared/utils/opcodes';
export { OPCODES, OPCODE_BY_NAME, OPCODE_BY_HEX, getOpcodeInfo } from '@shared/utils/opcodes';
/**
 * Opcodes worth including in the filtered structlog sent to the frontend.
 * Intentionally conservative — preserves state changes, call boundaries,
 * emitted events, and high-signal execution markers without shipping
 * the control-flow / stack / memory noise that dominates large traces.
 */
export declare const INTERESTING_OPS: Set<string>;
//# sourceMappingURL=opcodes.d.ts.map