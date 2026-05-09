export interface SourceLocation {
    start: number;
    length: number;
    fileIndex: number;
    jump: string;
    modifier: number;
}
export declare function buildPcToInstMapping(bytecode: string): Record<number, number>;
export declare function parseSourceMap(sourceMap: string): SourceLocation[];
export declare function getLineForOffset(source: string, offset: number): number;
//# sourceMappingURL=sourceMap.d.ts.map