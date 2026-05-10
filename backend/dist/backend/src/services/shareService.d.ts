import { IShare } from '../models/Share';
import type { ShareTraceData, ShareSimulateData } from '../types';
export declare function createTraceShare(data: ShareTraceData): Promise<IShare>;
export declare function createSimulateShare(data: ShareSimulateData): Promise<IShare>;
export declare function getShare(hash: string): Promise<IShare | null>;
//# sourceMappingURL=shareService.d.ts.map