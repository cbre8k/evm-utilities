export type OpcodeCategory = 'stop' | 'arithmetic' | 'comparison' | 'bitwise' | 'sha3' | 'env' | 'block' | 'memory' | 'storage' | 'flow' | 'log' | 'call' | 'create' | 'stack';
export interface OpcodeInfo {
    hex: string;
    name: string;
    /** Static base gas cost; undefined = dynamic (see desc) */
    gas: number | undefined;
    desc: string;
    category: OpcodeCategory;
}
export declare const OPCODES: OpcodeInfo[];
export declare const OPCODE_BY_NAME: Map<string, OpcodeInfo>;
export declare const OPCODE_BY_HEX: Map<string, OpcodeInfo>;
export declare function getOpcodeInfo(nameOrHex: string): OpcodeInfo | undefined;
//# sourceMappingURL=opcodes.d.ts.map