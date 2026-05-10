import { Document } from 'mongoose';
import type { SimulationInputs } from '../types';
export interface ISimulation extends Document {
    jobId: string;
    shareHash?: string;
    status: 'queued' | 'running' | 'done' | 'failed';
    inputs: SimulationInputs & {
        rpcUrl: string;
        scriptContent?: string;
    };
    output: string;
    exitCode?: number;
    success?: boolean;
    createdAt: Date;
    completedAt?: Date;
}
export declare const Simulation: import("mongoose").Model<ISimulation, {}, {}, {}, Document<unknown, {}, ISimulation, {}, {}> & ISimulation & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=Simulation.d.ts.map