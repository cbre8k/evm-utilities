// ============================================================
// services/traceCallManySimulationService.ts — fast quote simulation
// ============================================================

import { Interface, MaxUint256, getAddress } from 'ethers';
import type { TraceCallManyQuote, TraceCallManySimulationInputs } from '../types';

const RPC_TIMEOUT_MS = 30_000;
const NATIVE_TOKEN = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const erc20Iface = new Interface([
  'function approve(address spender,uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
]);

export interface TraceCallManySimulationResult {
  output: string;
  exitCode: number;
  success: boolean;
}

type RpcTx = {
  from: string;
  to: string;
  data?: string;
  value?: string;
  gas?: string;
  gasPrice?: string;
};

type TraceCallManyResult = {
  output?: string;
  result?: {
    output?: string;
    gasUsed?: string;
    gas?: string;
  };
  trace?: Array<{
    error?: string;
    result?: {
      output?: string;
      gasUsed?: string;
      gas?: string;
    };
  }>;
  error?: string;
};

function isNativeToken(address: string): boolean {
  const clean = address.toLowerCase();
  return clean === NATIVE_TOKEN || clean === ZERO_ADDRESS;
}

function toQuantity(value: string | number | bigint): string {
  const parsed = typeof value === 'bigint' ? value : BigInt(value || 0);
  return `0x${parsed.toString(16)}`;
}

function maskRpcUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    if (url.username) url.username = '***';
    if (url.password) url.password = '***';

    for (const key of url.searchParams.keys()) {
      if (/key|token|secret|auth|api/i.test(key)) {
        url.searchParams.set(key, '***');
      }
    }

    const parts = url.pathname.split('/').filter(Boolean);
    const last = parts.at(-1);
    if (last && last.length > 12 && /[a-z0-9_-]{12,}/i.test(last)) {
      parts[parts.length - 1] = `${last.slice(0, 4)}...${last.slice(-4)}`;
      url.pathname = `/${parts.join('/')}`;
    }

    return url.toString();
  } catch {
    return rawUrl.replace(/([?&](?:api_?key|key|token|secret|auth)=)[^&]+/gi, '$1***');
  }
}

async function rpcCall<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`RPC HTTP ${res.status} for ${method}`);
  const text = await res.text();
  if (!text.trim()) throw new Error(`RPC empty response for ${method}`);

  const payload = JSON.parse(text) as { result?: T; error?: { message?: string; code?: number } };
  if (payload.error) throw new Error(`RPC [${method}]: ${payload.error.message || payload.error.code}`);
  if (payload.result === undefined) throw new Error(`RPC no result for ${method}`);
  return payload.result;
}

function callManyEntry(tx: RpcTx): [RpcTx, string[]] {
  return [
    {
      ...tx,
      gas: tx.gas || toQuantity(10_000_000),
      gasPrice: tx.gasPrice || '0x0',
    },
    ['trace'],
  ];
}

function balanceCall(token: string, userAddress: string): RpcTx {
  return {
    from: userAddress,
    to: token,
    data: erc20Iface.encodeFunctionData('balanceOf', [userAddress]),
    value: '0x0',
    gas: toQuantity(120_000),
    gasPrice: '0x0',
  };
}

function approveCall(token: string, userAddress: string, spender: string, amount: bigint): RpcTx {
  return {
    from: userAddress,
    to: token,
    data: erc20Iface.encodeFunctionData('approve', [spender, amount]),
    value: '0x0',
    gas: toQuantity(250_000),
    gasPrice: '0x0',
  };
}

function swapCall(userAddress: string, quote: TraceCallManyQuote): RpcTx {
  return {
    from: userAddress,
    to: quote.to,
    data: quote.data,
    value: toQuantity(quote.value || '0'),
    gas: toQuantity(10_000_000),
    gasPrice: '0x0',
  };
}

function decodeUintOutput(result?: TraceCallManyResult): bigint {
  const output = result?.output || result?.result?.output || result?.trace?.[0]?.result?.output || '0x0';
  if (!output || output === '0x') return 0n;
  return BigInt(output);
}

function decodeStormlinkReturnAmount(result?: TraceCallManyResult): bigint | undefined {
  const output = result?.output || result?.result?.output || result?.trace?.[0]?.result?.output;
  if (!output || output.length < 130) return undefined;
  const words = output.slice(2).match(/.{1,64}/g) || [];
  if (words.length < 2) return undefined;
  return BigInt(`0x${words[1]}`);
}

function getGasUsed(result?: TraceCallManyResult): bigint {
  const gas =
    result?.result?.gasUsed ||
    result?.result?.gas ||
    result?.trace?.[0]?.result?.gasUsed ||
    result?.trace?.[0]?.result?.gas ||
    '0x0';
  return BigInt(gas);
}

function getTraceError(result?: TraceCallManyResult): string | undefined {
  if (result?.error) return result.error;
  const erroredTrace = result?.trace?.find((trace) => trace.error);
  return erroredTrace?.error;
}

function normalizeErrorReason(error: string): string {
  const clean = error.toLowerCase();
  if (clean.includes('out of gas')) return 'out_of_gas';
  if (clean.includes('insufficient funds') || clean.includes('insufficient balance')) return 'insufficient_balance';
  if (clean.includes('revert')) return 'revert';
  return clean.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'trace_error';
}

async function simulateOne(params: {
  rpcUrl: string;
  input: TraceCallManySimulationInputs;
  quote: TraceCallManyQuote;
}): Promise<{ gas: string; output: string; error?: string }> {
  const { rpcUrl, input, quote } = params;
  if (isNativeToken(input.tokenOut)) {
    return { gas: '0', output: '0', error: 'native_out_unsupported' };
  }

  const calls: Array<[RpcTx, string[]]> = [
    callManyEntry(balanceCall(input.tokenOut, input.userAddress)),
  ];

  const swapResultIndex = isNativeToken(input.tokenIn) ? 1 : 3;

  if (!isNativeToken(input.tokenIn)) {
    calls.push(callManyEntry(approveCall(input.tokenIn, input.userAddress, quote.approveSpender, 0n)));
    calls.push(callManyEntry(approveCall(input.tokenIn, input.userAddress, quote.approveSpender, MaxUint256)));
  }

  calls.push(callManyEntry(swapCall(input.userAddress, quote)));
  calls.push(callManyEntry(balanceCall(input.tokenOut, input.userAddress)));

  const blockTag = input.blockNumber ? toQuantity(input.blockNumber) : 'latest';
  const result = await rpcCall<TraceCallManyResult[]>(rpcUrl, 'trace_callMany', [calls, blockTag]);
  const pre = decodeUintOutput(result[0]);
  const post = decodeUintOutput(result[result.length - 1]);
  const swapResult = result[swapResultIndex];
  const traceError = getTraceError(swapResult);

  if (traceError) {
    return { gas: getGasUsed(swapResult).toString(), output: '0', error: normalizeErrorReason(traceError) };
  }

  const decodedReturnAmount = quote.decodeReturnAmount ? decodeStormlinkReturnAmount(swapResult) : undefined;
  const output = decodedReturnAmount ?? (post >= pre ? post - pre : 0n);

  const gas = getGasUsed(swapResult);
  if (gas === 0n && output === 0n) {
    return { gas: '0', output: '0', error: 'empty_trace_result' };
  }

  return { gas: gas.toString(), output: output.toString() };
}

export async function runTraceCallManySimulation(
  inputs: TraceCallManySimulationInputs,
  onChunk: (chunk: string) => void,
): Promise<TraceCallManySimulationResult> {
  let output = `[TRACE_CALL_MANY] rpc=${maskRpcUrl(inputs.rpcUrl)} chain=${inputs.chainId} block=${inputs.blockNumber || 'latest'} user=${getAddress(inputs.userAddress)}\n`;
  onChunk(output);

  try {
    for (const quote of inputs.quotes) {
      const stage = `[TRACE_CALL_MANY] simulate provider=${quote.provider}\n`;
      output += stage;
      onChunk(stage);

      const result = await simulateOne({ rpcUrl: inputs.rpcUrl, input: inputs, quote });
      const line = result.error
        ? `[SIM_RESULT] provider=${quote.provider} gas=0 output=0 error=${result.error}\n`
        : `[SIM_RESULT] provider=${quote.provider} gas=${result.gas} output=${result.output}\n`;
      output += line;
      onChunk(line);
    }

    return { output, exitCode: 0, success: true };
  } catch (err) {
    const line = `[TRACE_CALL_MANY] error ${err instanceof Error ? err.message : String(err)}\n`;
    output += line;
    onChunk(line);
    return { output, exitCode: 1, success: false };
  }
}
