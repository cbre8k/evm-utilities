export interface SourceLocation {
    start: number;
    length: number;
    fileIndex: number;
    jump: string;
    modifier: number;
}
/**
 * Maps PC (Program Counter) to Source Map instruction index.
 * Requires the runtime bytecode (hex string, optionally 0x-prefixed).
 */
export declare function buildPcToInstMapping(bytecode: string): Record<number, number>;
/**
 * Parses a Solidity source map string.
 * Format: s:l:f:j:m;...  (fields may be omitted to inherit from previous)
 */
export declare function parseSourceMap(sourceMap: string): SourceLocation[];
/**
 * Find the 1-based line number in the source code for a given byte offset.
 */
export declare function getLineForOffset(source: string, offset: number): number;
//# sourceMappingURL=sourceMap.d.ts.map