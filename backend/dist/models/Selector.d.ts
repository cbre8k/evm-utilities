import { Document } from 'mongoose';
export interface ISelector extends Document {
    hex: string;
    functionName: string;
    args: {
        name: string;
        type: string;
    }[];
    source: '4byte' | 'openchain' | 'manual';
    cachedAt: Date;
}
export declare const Selector: import("mongoose").Model<ISelector, {}, {}, {}, Document<unknown, {}, ISelector, {}, {}> & ISelector & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=Selector.d.ts.map