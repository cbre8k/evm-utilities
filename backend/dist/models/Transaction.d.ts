import { Document } from 'mongoose';
export interface ITransaction extends Document {
    hash: string;
    chainId: number;
    blockNumber: number;
    from: string;
    to: string | null;
    value: string;
    gas: number;
    gasPrice: string;
    input: string;
    status: 'success' | 'failed' | 'pending';
    fetchedAt: Date;
}
export declare const Transaction: import("mongoose").Model<ITransaction, {}, {}, {}, Document<unknown, {}, ITransaction, {}, {}> & ITransaction & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=Transaction.d.ts.map