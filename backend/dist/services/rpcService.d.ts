import type { TxOverview, TraceNode, TokenTransfer, EventLog, NativeTransfer, ERC20Transfer, ERC721Transfer, ERC1155Transfer, AddressStateDiff, GasNode } from '../types';
export declare function getChainId(rpcUrl: string): Promise<number>;
export declare function getCode(rpcUrl: string, address: string): Promise<string>;
export declare function getTokenSymbol(rpcUrl: string, address: string): Promise<string | null>;
export declare function buildTokenLabelMap(rpcUrl: string, tokenAddresses: string[]): Promise<Record<string, string>>;
export declare function getTransaction(rpcUrl: string, txHash: string): Promise<any>;
export declare function getTransactionReceipt(rpcUrl: string, txHash: string): Promise<any>;
export declare function getBlockByNumber(rpcUrl: string, blockNumber: string): Promise<any>;
export declare function buildTxOverview(rpcUrl: string, txHash: string): Promise<TxOverview>;
export declare function debugTraceTransaction(rpcUrl: string, txHash: string): Promise<any>;
export declare function getPrestateTrace(rpcUrl: string, txHash: string): Promise<any>;
/**
 * Fetch the full structlog trace and filter to interesting opcodes only.
 * The raw structlog can be millions of entries — we keep only the subset
 * needed to show SLOAD/SSTORE, jumps, events, and call boundaries.
 */
export declare function getFilteredStructLog(rpcUrl: string, txHash: string, verbose?: boolean): Promise<import('../types').FilteredStructLog[]>;
export declare function normalizeCallTree(raw: any, parentId?: string, depth?: number): TraceNode;
export declare function parseAllLogs(receipt: any): {
    allLogs: EventLog[];
    erc20Transfers: ERC20Transfer[];
    erc721Transfers: ERC721Transfer[];
    erc1155Transfers: ERC1155Transfer[];
};
export declare function parseTokenTransfers(receipt: any): TokenTransfer[];
export declare function extractNativeTransfers(node: TraceNode, out?: NativeTransfer[]): NativeTransfer[];
export declare function buildStateDiffs(prestateResult: any): AddressStateDiff[];
export declare function buildGasTree(node: TraceNode, totalGas: number): GasNode;
//# sourceMappingURL=rpcService.d.ts.map