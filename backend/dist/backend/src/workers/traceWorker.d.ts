type StructLogEntry = {
    pc: number;
    op: string;
    depth?: number;
    jumpTo?: string;
    sourceLabel?: string;
    sourceFile?: string;
    sourceLine?: number;
    sourceJump?: string;
    sourceStart?: number;
    sourceLength?: number;
    sourceFileIndex?: number;
    jumpTargetLabel?: string;
    jumpTargetFile?: string;
    jumpTargetLine?: number;
    jumpTargetParams?: Array<{
        name: string;
        type: string;
    }>;
    jumpTargetFunction?: string;
    jumpTargetFunctionParams?: string[];
    jumpResolvedParams?: string[];
    jumpTargetFunctionReturnsValue?: boolean;
    jumpStack?: string[];
    jumpMemory?: string[];
};
export declare function startTraceWorker(): Promise<void>;
export declare function buildTraceResultPayload(rpcUrl: string, txHash: string, chainId: number, verbose?: boolean): Promise<{
    chainId: number;
    txOverview: import("@shared/types/transaction").TxOverview;
    normalizedTree: import("@shared/types/trace").TraceNode;
    structLog: StructLogEntry[];
    addressLabels: Record<string, string>;
    tokenLabels: Record<string, string>;
    allLogs: import("@shared/types/events").EventLog[];
    erc20Transfers: import("@shared/types/transaction").ERC20Transfer[];
    erc721Transfers: import("@shared/types/transaction").ERC721Transfer[];
    erc1155Transfers: import("@shared/types/transaction").ERC1155Transfer[];
    nativeTransfers: import("@shared/types/transaction").NativeTransfer[];
    stateDiffs: import("@shared/types/state").AddressStateDiff[];
    gasTree: import("@shared/types/state").GasNode;
    decodedCalldata: import("@shared/types/decoded").DecodedCalldata | null | undefined;
    decodedOutput: import("@shared/types/decoded").DecodedOutput | null | undefined;
}>;
export {};
//# sourceMappingURL=traceWorker.d.ts.map