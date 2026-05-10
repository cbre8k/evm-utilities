export interface DecodedArg {
    name: string;
    type: string;
    value: string;
    soltype?: {
        name?: string;
        type?: string;
        simple_type?: {
            type?: string;
        };
    };
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
//# sourceMappingURL=decoded.d.ts.map