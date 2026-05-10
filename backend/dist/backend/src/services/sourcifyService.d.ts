export interface SourceFile {
    name: string;
    path: string;
    content: string;
}
export interface ContractMetadata {
    compiler: {
        version: string;
    };
    language: string;
    settings: any;
    sources: Record<string, {
        content?: string;
        keccak256: string;
        urls: string[];
    }>;
}
export interface VerifiedContract {
    match: string | null;
    creationMatch: string | null;
    runtimeMatch: string | null;
    chainId: string;
    address: string;
    verifiedAt?: string;
    contractName: string | null;
    fullyQualifiedName: string | null;
    sources: SourceFile[];
    abi: any[];
    metadata: ContractMetadata | null;
}
export interface RuntimeDebugInfo {
    contractName: string | null;
    fullyQualifiedName: string | null;
    runtimeBytecode: string;
    runtimeSourceMap: string;
    sources: Record<string, {
        content: string;
    }>;
    stdJsonOutput: any;
}
/**
 * Fetch verified contract data from Sourcify v2 API.
 * Single call: GET /v2/contract/{chainId}/{address}?fields=...
 * Returns null if the contract is not verified on Sourcify.
 */
export declare function getVerifiedSource(chainId: number, address: string): Promise<VerifiedContract | null>;
/** Returns just the contract name, or null if not verified. */
export declare function getContractName(contract: VerifiedContract | null): string | null;
export declare function getVerifiedContractName(chainId: number, address: string): Promise<string | null>;
export declare function getRuntimeDebugInfo(chainId: number, address: string): Promise<RuntimeDebugInfo | null>;
//# sourceMappingURL=sourcifyService.d.ts.map