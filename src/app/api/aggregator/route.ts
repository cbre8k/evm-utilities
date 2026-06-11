import { NextRequest, NextResponse } from "next/server";
import { ADAPTERS } from "@/lib/metrics/adapters";
import { AGGREGATOR_PROVIDERS } from "@/lib/metrics/providers";
import { findBestOutputRaw, calculateDeviationPct, determineQuoteDirection } from "@/lib/metrics/math";
import { getComputedMetrics, getMetricsStorageStatus } from "@/lib/metrics/redis";
import type { QuoteRequest, StandardizedQuote, QuoteComparisonEvent, AggregatorProvider } from "@/lib/metrics/types";
import { getRandomTopHolder } from "@/lib/metrics/holders";
import { NETWORKS } from "@/lib/constants";
import { formatUnits } from "ethers";

/**
 * Custom Promise.race wrapper to support timeout on each aggregator call
 */
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  timeoutValue: T
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(timeoutValue), ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Fetches the current gas price and block number for the blockchain network via JSON-RPC
 */
async function getChainState(chainId: number): Promise<{ gasPrice: string; blockNumber?: string }> {
  // Translate chainId to network
  const network = NETWORKS.find(
    (n) =>
      Number(
        n.id === "mainnet"
          ? 1
          : n.id === "bsc"
          ? 56
          : n.id === "arbitrum"
          ? 42161
          : n.id === "optimism"
          ? 10
          : n.id === "base"
          ? 8453
          : 0
      ) === chainId
  );
  
  const rpcUrl = network?.fullnodeRpcUrls?.[0];
  if (rpcUrl) {
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
          { jsonrpc: "2.0", id: 1, method: "eth_gasPrice", params: [] },
          { jsonrpc: "2.0", id: 2, method: "eth_blockNumber", params: [] }
        ]),
        signal: AbortSignal.timeout(3000), // 3 seconds timeout
      });
      const data = (await res.json()) as Array<{ result?: string }>;
      if (Array.isArray(data) && data.length === 2) {
        return {
          gasPrice: data[0].result ? BigInt(data[0].result).toString() : getDefaultGasPrice(chainId),
          blockNumber: data[1].result ? BigInt(data[1].result).toString() : undefined,
        };
      }
    } catch {
      // Fallback below
    }
  }

  return { gasPrice: getDefaultGasPrice(chainId) };
}

function getDefaultGasPrice(chainId: number): string {
  switch (chainId) {
    case 1:
      return "25000000000"; // 25 Gwei
    case 56:
      return "2000000000"; // 2 Gwei
    case 42161:
    case 10:
    case 8453:
      return "50000000"; // 0.05 Gwei
    default:
      return "1000000000"; // 1 Gwei
  }
}

function normalizeBaselineProvider(value?: string): AggregatorProvider | "best" {
  if (!value || value === "best") return "best";
  return AGGREGATOR_PROVIDERS.includes(value as AggregatorProvider)
    ? (value as AggregatorProvider)
    : "best";
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      chainId: number;
      tokenIn: string;
      tokenOut: string;
      tokenInDecimals: number;
      tokenOutDecimals: number;
      amountIn: string;
      amountInRaw: string;
      slippageBps?: number;
      userAddress?: string;
      baselineProvider?: string;
    };

    const chainId = Number(body.chainId);
    const {
      tokenIn,
      tokenOut,
      tokenInDecimals,
      tokenOutDecimals,
      amountIn,
      amountInRaw,
      slippageBps = 100,
    } = body;
    const baselineProvider = normalizeBaselineProvider(body.baselineProvider);
    
    let userAddress = body.userAddress;
    if (!userAddress) {
      userAddress = getRandomTopHolder(chainId, tokenIn);
    }

    // 1. Validations
    if (!chainId || !tokenIn || !tokenOut || !amountInRaw) {
      return NextResponse.json(
        { error: "Missing required fields (chainId, tokenIn, tokenOut, amountInRaw)" },
        { status: 400 }
      );
    }

    const request: QuoteRequest = {
      chainId,
      tokenIn,
      tokenOut,
      tokenInDecimals,
      tokenOutDecimals,
      amountIn,
      amountInRaw,
      slippageBps,
      userAddress,
      baselineProvider,
    };

    // 2. Fetch network state (gas price & block number) concurrently with API execution
    const statePromise = getChainState(chainId);

    // 3. Query all adapters in parallel. Stormlink can take 7-10s on large routes.
    const TIMEOUT_MS = 15000;
    const quotePromises = ADAPTERS.map((adapter) => {
      const fallbackResult: StandardizedQuote = {
        provider: adapter.provider,
        success: false,
        chainId,
        tokenIn,
        tokenOut,
        amountInRaw,
        latencyMs: TIMEOUT_MS,
        timeout: true,
        quoteDirection: "failed",
        error: `Timeout exceeded (${TIMEOUT_MS}ms)`,
      };
      
      return withTimeout(adapter.quote(request), TIMEOUT_MS, fallbackResult);
    });

    const results = await Promise.all([statePromise, ...quotePromises]);
    const state = results[0] as { gasPrice: string; blockNumber?: string };
    const quotes = results.slice(1) as StandardizedQuote[];
    const { gasPrice, blockNumber } = state;

    // 4. Determine best output, lowest gas, and fastest quotes
    const bestOutputRaw = findBestOutputRaw(quotes);
    
    let lowestGasQuote: StandardizedQuote | undefined;
    let fastestQuote: StandardizedQuote | undefined;

    for (const quote of quotes) {
      // Find lowest gas
      if (quote.success && quote.estimatedGas) {
        if (
          !lowestGasQuote ||
          Number(quote.estimatedGas) < Number(lowestGasQuote.estimatedGas)
        ) {
          lowestGasQuote = quote;
        }
      }
      // Find fastest
      if (!fastestQuote || quote.latencyMs < fastestQuote.latencyMs) {
        fastestQuote = quote;
      }
    }

    // Resolve baseline output amount
    let baselineOutputRaw: string | undefined;
    if (baselineProvider === "best") {
      baselineOutputRaw = bestOutputRaw;
    } else {
      const baselineQuote = quotes.find((q) => q.provider === baselineProvider);
      if (baselineQuote?.success) {
        baselineOutputRaw = baselineQuote.outputAmountRaw;
      }
    }

    // 5. Unify properties & compute deviations
    const finalQuotes = quotes.map((quote): StandardizedQuote => {
      if (!quote.success) {
        return {
          ...quote,
          bestOutputRaw,
          quoteDirection: "failed",
        };
      }

      const isBestQuote = bestOutputRaw !== undefined && quote.outputAmountRaw === bestOutputRaw;
      const isLowestGas = lowestGasQuote !== undefined && quote.provider === lowestGasQuote.provider;
      const isFastest = fastestQuote !== undefined && quote.provider === fastestQuote.provider;

      const deviationPct = bestOutputRaw
        ? calculateDeviationPct(quote.outputAmountRaw!, bestOutputRaw)
        : "0.00";
      const deviationAbsPct = Math.abs(parseFloat(deviationPct)).toFixed(4);

      let deviationVsBaselinePct: string | undefined;
      if (baselineOutputRaw) {
        deviationVsBaselinePct = calculateDeviationPct(quote.outputAmountRaw!, baselineOutputRaw);
      }

      const quoteDirection = determineQuoteDirection({
        success: quote.success,
        outputAmountRaw: quote.outputAmountRaw,
        bestOutputRaw,
        baselineOutputRaw,
        baselineProvider,
      });

      // Compute Gas Cost Details (Gas Token uses 18 decimals)
      const estimatedGas = quote.estimatedGas || "150000";
      const gasCostWei = BigInt(estimatedGas) * BigInt(gasPrice);
      const gasCostFormatted = formatUnits(gasCostWei.toString(), 18);

      return {
        ...quote,
        bestOutputRaw,
        deviationPct,
        deviationAbsPct,
        deviationVsBaselinePct,
        quoteDirection,
        isBestQuote,
        isLowestGas,
        isFastest,
        gasPriceWei: gasPrice,
        gasCostWei: gasCostWei.toString(),
        gasCostFormatted,
      };
    });

    // Resolve best, lowest gas, and fastest providers
    const bestProvider = finalQuotes.find((q) => q.isBestQuote)?.provider;
    const lowestGasProvider = finalQuotes.find((q) => q.isLowestGas)?.provider;
    const fastestProvider = finalQuotes.find((q) => q.isFastest)?.provider;

    // 6. Create quote comparison event
    const event: QuoteComparisonEvent = {
      id: "q_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      createdAt: new Date().toISOString(),
      chainId,
      tokenIn,
      tokenOut,
      tokenInDecimals,
      tokenOutDecimals,
      amountIn,
      amountInRaw,
      userAddress,
      baselineProvider,
      bestProvider,
      bestOutputRaw,
      lowestGasProvider,
      fastestProvider,
      quotes: finalQuotes,
      blockNumber,
    };

    // 7. (Removed) Database commits are now handled post-simulation in /api/aggregator/save-sim
    // 8. Fetch updated rolling stats
    const metrics = await getComputedMetrics(chainId);

    return NextResponse.json({
      event,
      metrics,
      storage: getMetricsStorageStatus(chainId),
    });
  } catch (err) {
    console.error("[API Aggregator] Exception:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
