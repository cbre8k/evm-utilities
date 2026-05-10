import type { DecodedCalldata, DecodedArg, DecodedOutput, DecodedOutputValue } from '../types';
type AbiParam = {
    name?: string;
    type?: string;
};
export declare function lookupSelector(hex: string): Promise<{
    functionName: string;
    args: DecodedArg[];
} | null>;
export declare function decodeCalldata(input: string, address?: string | null, chainId?: number): Promise<DecodedCalldata | null>;
export declare function decodeOutput(input: string, output: string, address?: string | null, chainId?: number): Promise<DecodedOutput | null>;
/**
 * Given the raw calldata hex (including 0x + 4-byte selector) and the
 * arg schema from the 4byte / openchain lookup, decode the actual values.
 */
export declare function decodeCalldataArgs(input: string, args: {
    name: string;
    type: string;
}[]): DecodedArg[];
export declare function decodeOutputArgs(output: string, outputs: AbiParam[]): DecodedOutputValue[];
/**
 * Look up event name from a full 32-byte topic0 hash.
 * Tries: Redis cache → Sourcify ABI → 4byte API → OpenChain API.
 * Results are cached in Redis for future lookups.
 */
export declare function lookupEventName(topic0: string, emitterAddress?: string, chainId?: number): Promise<string | null>;
/**
 * Batch lookup event names for multiple topic0 hashes.
 * Returns a map: topic0 → event name.
 */
export declare function lookupEventNames(topic0s: string[], emitterByTopic?: Map<string, {
    address: string;
    chainId: number;
}>): Promise<Map<string, string>>;
export {};
//# sourceMappingURL=selectorService.d.ts.map