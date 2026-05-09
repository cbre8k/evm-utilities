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
export {};
//# sourceMappingURL=selectorService.d.ts.map