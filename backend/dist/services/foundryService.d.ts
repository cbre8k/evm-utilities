export interface FoundryResult {
    output: string;
    exitCode: number;
    success: boolean;
}
export declare function runSimulation(scriptContent: string, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<FoundryResult>;
//# sourceMappingURL=foundryService.d.ts.map