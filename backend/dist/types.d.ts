export type JobStatus = 'queued' | 'running' | 'done' | 'failed';
export type TraceCallType = 'CALL' | 'CALLCODE' | 'STATICCALL' | 'DELEGATECALL' | 'CREATE' | 'CREATE2' | 'STOP' | 'RETURN' | 'REVERT' | 'INVALID' | 'SELFDESTRUCT';
export interface TraceNode {
    id: string;
    parentId?: string;
    depth: number;
    type: TraceCallType;
    from: string;
    to: string | null;
    input: string;
    output: string;
    value: string;
    gas: string;
    gasUsed: string;
    error?: string;
    revertReason?: string;
    decodedFunction?: string;
    decodedArgs?: DecodedArg[];
    logs?: TraceLog[];
    children: TraceNode[];
}
export interface TraceLog {
    address: string;
    topics: string[];
    data: string;
}
export interface DecodedArg {
    name: string;
    type: string;
    value: string;
}
export interface DecodedCalldata {
    selector: string;
    functionName: string;
    args: DecodedArg[];
}
export interface DecodedOutputValue {
    name: string;
    type: string;
    value: string;
}
export interface DecodedOutput {
    functionName: string;
    values: DecodedOutputValue[];
}
export interface TokenTransfer {
    tokenAddress: string;
    from: string;
    to: string;
    amount: string;
    logIndex: number;
}
export interface TxOverview {
    hash: string;
    from: string;
    to: string | null;
    value: string;
    gasUsed: string;
    gasLimit: string;
    gasPrice: string;
    blockNumber: number;
    blockHash: string;
    timestamp?: number;
    txType?: string;
    txIndex: number;
    nonce: number;
    status: 'success' | 'failed';
    input: string;
}
export interface ShareTraceData {
    txHash: string;
    rpcUrl: string;
    chainId: number;
    txOverview: TxOverview;
    normalizedTrace: TraceNode;
    tokenTransfers: TokenTransfer[];
    decodedCalldata?: DecodedCalldata;
    decodedOutput?: DecodedOutput;
}
export interface TraceResultPayload {
    chainId?: number;
    txOverview: TxOverview;
    normalizedTree: TraceNode;
    structLog?: FilteredStructLog[];
    addressLabels?: Record<string, string>;
    tokenLabels?: Record<string, string>;
    allLogs: EventLog[];
    erc20Transfers: ERC20Transfer[];
    erc721Transfers: ERC721Transfer[];
    erc1155Transfers: ERC1155Transfer[];
    nativeTransfers: NativeTransfer[];
    stateDiffs: AddressStateDiff[];
    gasTree: GasNode;
    decodedCalldata?: DecodedCalldata;
    decodedOutput?: DecodedOutput;
    shareHash?: string;
    shareUrl?: string;
}
export interface ShareSimulateData {
    rpcUrl: string;
    inputs: SimulationInputs;
    output: string;
    exitCode: number;
    success: boolean;
}
export interface SimulationInputs {
    from: string;
    to: string;
    calldata: string;
    value: string;
    blockNumber: string;
    shouldDealToken: boolean;
    tokenAddress: string;
    spender: string;
    amount: string;
}
export interface TraceJobMessage {
    jobId: string;
    txHash: string;
    rpcUrl: string;
    chainId: number;
}
export interface SimulateJobMessage {
    jobId: string;
    inputs: SimulationInputs & {
        rpcUrl: string;
        scriptContent: string;
    };
}
export interface DecodeJobMessage {
    jobId: string;
    selector: string;
}
export interface EventLog {
    address: string;
    topics: string[];
    data: string;
    logIndex: number;
    eventName?: string;
    decoded?: Record<string, string>;
}
export interface NativeTransfer {
    from: string;
    to: string | null;
    value: string;
    callType: string;
    depth: number;
    callId: string;
}
export interface ERC20Transfer {
    tokenAddress: string;
    from: string;
    to: string;
    amount: string;
    logIndex: number;
}
export interface ERC721Transfer {
    tokenAddress: string;
    from: string;
    to: string;
    tokenId: string;
    logIndex: number;
}
export interface ERC1155Transfer {
    tokenAddress: string;
    operator: string;
    from: string;
    to: string;
    id: string;
    value: string;
    logIndex: number;
    isBatch: boolean;
    batchIds?: string[];
    batchValues?: string[];
}
export interface StorageChange {
    slot: string;
    before: string;
    after: string;
}
export interface AddressStateDiff {
    address: string;
    balanceBefore?: string;
    balanceAfter?: string;
    nonceBefore?: number;
    nonceAfter?: number;
    codeChanged?: boolean;
    storageChanges: StorageChange[];
}
export interface GasNode {
    id: string;
    label: string;
    gasUsed: number;
    gasLimit: number;
    selfGas: number;
    depth: number;
    children: GasNode[];
}
/**
 * A filtered entry from debug_traceTransaction (structlog).
 * Only "interesting" opcodes are kept: SLOAD/SSTORE, LOG*, JUMP/JUMPDEST,
 * CALL variants, CREATE variants, REVERT, RETURN, STOP, INVALID, SELFDESTRUCT.
 */
export interface FilteredStructLog {
    pc: number;
    op: string;
    gas: number;
    gasCost: number;
    depth: number;
    jumpTo?: string;
    jumpCondition?: string;
    jumpStack?: string[];
    jumpMemory?: string[];
    sourceLabel?: string;
    sourceFile?: string;
    sourceLine?: number;
    jumpTargetLabel?: string;
    jumpTargetFile?: string;
    jumpTargetLine?: number;
    jumpTargetParams?: {
        name: string;
        type: string;
    }[];
    jumpTargetFunction?: string;
    jumpTargetFunctionParams?: string[];
    jumpTargetFunctionReturnsValue?: boolean;
    truncated?: boolean;
    storageKey?: string;
    storagePre?: string;
    storagePost?: string;
    error?: string;
}
//# sourceMappingURL=types.d.ts.map