export type AggregatorProvider =
  | "0x"
  | "okx"
  | "1inch"
  | "stormlink";

export type QuoteDirection =
  | "best"
  | "underquote"
  | "overquote"
  | "equal"
  | "failed";

export interface QuoteRequest {
  chainId: number;

  tokenIn: string;
  tokenOut: string;

  tokenInDecimals: number;
  tokenOutDecimals: number;

  amountIn: string;     // human-readable input, e.g. "1.25"
  amountInRaw: string;  // raw integer string

  slippageBps?: number;
  userAddress?: string;

  baselineProvider?: AggregatorProvider | "best";
}

export interface StandardizedQuote {
  provider: AggregatorProvider;

  success: boolean;

  chainId: number;
  tokenIn: string;
  tokenOut: string;
  amountInRaw: string;

  outputAmountRaw?: string;
  outputAmountFormatted?: string;

  estimatedGas?: string;
  gasPriceWei?: string;
  gasCostWei?: string;
  gasCostFormatted?: string;

  latencyMs: number;
  timeout?: boolean;

  bestOutputRaw?: string;

  deviationPct?: string;
  deviationAbsPct?: string;

  dexes?: string[];

  deviationVsBaselinePct?: string;
  quoteDirection: QuoteDirection;

  isBestQuote?: boolean;
  isLowestGas?: boolean;
  isFastest?: boolean;

  error?: string;

  raw?: unknown;
}

export interface QuoteComparisonEvent {
  id: string;
  createdAt: string;

  chainId: number;

  tokenIn: string;
  tokenOut: string;

  tokenInDecimals: number;
  tokenOutDecimals: number;

  amountIn: string;
  amountInRaw: string;
  userAddress?: string;

  baselineProvider: AggregatorProvider | "best";

  bestProvider?: AggregatorProvider;
  bestOutputRaw?: string;

  lowestGasProvider?: AggregatorProvider;
  fastestProvider?: AggregatorProvider;

  quotes: StandardizedQuote[];
  blockNumber?: string;
}

export interface ProviderStats {
  provider: AggregatorProvider;
  chainId: number;

  totalQuotes: number;
  successQuotes: number;
  failedQuotes: number;

  bestQuoteCount: number;

  underquoteCount: number;
  overquoteCount: number;
  equalQuoteCount: number;

  deviationSum: number;
  absoluteDeviationSum: number;

  gasSum: number;
  gasMin?: number;
  gasMax?: number;

  latencySum: number;
  latencyMin?: number;
  latencyMax?: number;

  timeoutCount: number;
}

export interface ComputedProviderMetrics {
  provider: AggregatorProvider;

  totalQuotes: number;

  successRate: number;
  failureRate: number;

  bestQuoteRate: number;

  avgDeviationPct: number;
  avgAbsDeviationPct: number;

  avgGas: number;
  minGas?: number;
  maxGas?: number;

  avgLatencyMs: number;
  minLatencyMs?: number;
  maxLatencyMs?: number;

  timeoutRate: number;

  underquoteCount: number;
  overquoteCount: number;
}
