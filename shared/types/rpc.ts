// ============================================================
// shared/types/rpc.ts — Raw JSON-RPC response shapes
//
// These describe what nodes actually return, before normalisation into the
// app's own types (TraceNode, TxOverview, …). Every field is optional
// because node implementations differ in what they include, and values stay
// as the hex strings the wire format uses.
// ============================================================

/** A log entry as returned inside a transaction receipt. */
export interface RpcLog {
  address?: string;
  topics?: string[];
  data?: string;
  logIndex?: string;
  blockNumber?: string;
  transactionHash?: string;
}

/** eth_getTransactionByHash */
export interface RpcTransaction {
  hash?: string;
  from?: string;
  to?: string | null;
  value?: string;
  gas?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  input?: string;
  nonce?: string;
  type?: string;
  blockNumber?: string;
  blockHash?: string;
  transactionIndex?: string;
}

/** eth_getTransactionReceipt */
export interface RpcTransactionReceipt {
  status?: string;
  gasUsed?: string;
  logs?: RpcLog[];
  contractAddress?: string | null;
}

/** eth_getBlockByNumber (without full transaction bodies) */
export interface RpcBlock {
  number?: string;
  hash?: string;
  timestamp?: string;
}

/**
 * A frame from geth's `callTracer`. Nested via `calls`; `logs` is present
 * only when the tracer was configured with `withLog: true`.
 */
export interface CallTracerFrame {
  type?: string;
  from?: string;
  to?: string | null;
  input?: string;
  output?: string;
  value?: string;
  gas?: string;
  gasUsed?: string;
  error?: string;
  revertReason?: string;
  logs?: RpcLog[];
  calls?: CallTracerFrame[];
}

/** One account's state in a `prestateTracer` diffMode result. */
export interface PrestateAccount {
  balance?: string;
  nonce?: number;
  code?: string;
  storage?: Record<string, string>;
}

/** debug_traceTransaction with `prestateTracer` + `diffMode: true`. */
export interface PrestateResult {
  pre?: Record<string, PrestateAccount>;
  post?: Record<string, PrestateAccount>;
}

/** One entry of a standard structLog trace. */
export interface RpcStructLog {
  pc?: number;
  op?: string;
  gas?: number;
  gasCost?: number;
  depth?: number;
  error?: string;
  stack?: string[];
  /** Added by the custom minimal tracer, not part of the standard shape. */
  jumpTo?: string;
  jumpStack?: string[];
}

export interface StructLogResult {
  structLogs?: RpcStructLog[];
}

/**
 * One entry of a Parity/OpenEthereum `trace_*` response. The flat list is
 * re-assembled into a tree using `traceAddress`.
 */
export interface ParityTrace {
  type?: string;
  traceAddress?: number[];
  subtraces?: number;
  error?: string;
  action?: {
    from?: string;
    to?: string;
    input?: string;
    value?: string;
    gas?: string | number;
    callType?: string;
    creationMethod?: string;
    /** `create` entries carry the deploy bytecode here rather than in input. */
    init?: string;
    /** `suicide` entries use these instead of from/to. */
    address?: string;
    refundAddress?: string;
    balance?: string;
  };
  result?: {
    output?: string;
    gasUsed?: string | number;
    address?: string;
    code?: string;
  };
}
