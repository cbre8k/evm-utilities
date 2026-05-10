export interface OpcodeInfo {
    hex: string;
    name: string;
    /** Static base gas cost; undefined = dynamic (see note) */
    gas: number | undefined;
    /** Short description */
    desc: string;
    /** Broad category for coloring */
    category: 'stop' | 'arithmetic' | 'comparison' | 'bitwise' | 'sha3' | 'env' | 'block' | 'memory' | 'storage' | 'flow' | 'log' | 'call' | 'create' | 'stack';
}
export declare const OPCODES: OpcodeInfo[];
export declare const OPCODE_BY_NAME: Map<string, OpcodeInfo>;
export declare const OPCODE_BY_HEX: Map<string, OpcodeInfo>;
export declare function getOpcodeInfo(nameOrHex: string): OpcodeInfo | undefined;
/**
 * Opcodes worth including in the filtered structlog.
 * Keep this intentionally conservative. The goal is to preserve state changes,
 * call boundaries, emitted events, and a few high-signal execution markers
 * without shipping the common control-flow / stack / memory noise that
 * dominates browser memory for large traces.
 */
export declare const INTERESTING_OPS: Set<string>;
//# sourceMappingURL=opcodes.d.ts.map