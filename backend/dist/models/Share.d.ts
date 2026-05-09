import { Document } from 'mongoose';
import type { TxOverview, TraceNode, TokenTransfer, DecodedCalldata, DecodedOutput, SimulationInputs } from '../types';
export interface IShare extends Document {
    hash: string;
    type: 'trace' | 'simulate';
    rpcUrl: string;
    chainId?: number;
    createdAt: Date;
    viewCount: number;
    txHash?: string;
    txOverview?: TxOverview;
    normalizedTrace?: TraceNode;
    tokenTransfers?: TokenTransfer[];
    decodedCalldata?: DecodedCalldata;
    decodedOutput?: DecodedOutput;
    simulateInputs?: SimulationInputs & {
        rpcUrl: string;
    };
    simulateOutput?: string;
    simulateExitCode?: number;
    simulateSuccess?: boolean;
}
export declare const Share: import("mongoose").Model<IShare, {}, {}, {}, Document<unknown, {}, IShare, {}, {}> & IShare & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=Share.d.ts.map