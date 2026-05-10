import { Document } from 'mongoose';
import type { TraceNode, TokenTransfer, TxOverview, DecodedCalldata, DecodedOutput, EventLog, ERC20Transfer, ERC721Transfer, ERC1155Transfer, NativeTransfer, AddressStateDiff, GasNode, FilteredStructLog, TenderlyAssetChange, TenderlyExposureChange, TenderlyBalanceChange } from '../types';
export interface ITrace extends Document {
    txHash: string;
    chainId: number;
    shareHash?: string;
    txOverview: TxOverview;
    rawCallTree: object;
    normalizedTree: TraceNode;
    tokenTransfers: TokenTransfer[];
    decodedCalldata?: DecodedCalldata;
    decodedOutput?: DecodedOutput;
    structLog?: FilteredStructLog[];
    addressLabels?: Record<string, string>;
    tokenLabels?: Record<string, string>;
    allLogs: EventLog[];
    erc20Transfers: ERC20Transfer[];
    erc721Transfers: ERC721Transfer[];
    erc1155Transfers: ERC1155Transfer[];
    nativeTransfers: NativeTransfer[];
    stateDiffs: AddressStateDiff[];
    asset_changes?: TenderlyAssetChange[];
    exposure_changes?: TenderlyExposureChange[];
    balance_changes?: TenderlyBalanceChange[];
    gasTree?: GasNode;
    gasUsed: string;
    fetchedAt: Date;
}
export declare const Trace: import("mongoose").Model<ITrace, {}, {}, {}, Document<unknown, {}, ITrace, {}, {}> & ITrace & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=Trace.d.ts.map