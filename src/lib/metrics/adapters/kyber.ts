import type { QuoteAdapter } from "./base";
import type { QuoteRequest, StandardizedQuote } from "../types";
import { normalizeTokenForProvider, getWrappedNativeAddress } from "../tokens";
import { formatUnits } from "ethers";

const KYBER_CHAIN_PATHS: Record<number, string> = {
  1: "ethereum",
  56: "bsc",
  42161: "arbitrum",
  10: "optimism",
  8453: "base",
};

function resolveKyberRoutesUrl(chainPath: string): string {
  const configuredUrl = process.env.KYBER_API_URL?.trim();
  const baseUrl = configuredUrl || `https://aggregator-api.kyberswap.com/${chainPath}/api/v1/routes`;
  const normalizedUrl = baseUrl.replace(/\/+$/, "");

  if (normalizedUrl.endsWith("/routes")) {
    return normalizedUrl;
  }

  return `${normalizedUrl}/${chainPath}/api/v1/routes`;
}

export class KyberAdapter implements QuoteAdapter {
  provider = "kyber" as const;

  async quote(params: QuoteRequest): Promise<StandardizedQuote> {
    const startedAt = Date.now();
    const { chainId, tokenIn, tokenOut, amountInRaw, tokenOutDecimals } = params;

    const wrappedNative = getWrappedNativeAddress(chainId);
    const normalizedIn = normalizeTokenForProvider({
      provider: this.provider,
      chainId,
      tokenAddress: tokenIn,
      wrappedNativeAddress: wrappedNative,
    });
    const normalizedOut = normalizeTokenForProvider({
      provider: this.provider,
      chainId,
      tokenAddress: tokenOut,
      wrappedNativeAddress: wrappedNative,
    });

    const chainPath = KYBER_CHAIN_PATHS[chainId];
    if (!chainPath) {
      return {
        provider: this.provider,
        success: false,
        chainId,
        tokenIn,
        tokenOut,
        amountInRaw,
        latencyMs: Date.now() - startedAt,
        quoteDirection: "failed",
        error: `Unsupported chain ID ${chainId}`,
      };
    }

    const url = new URL(resolveKyberRoutesUrl(chainPath));
    url.searchParams.set("tokenIn", normalizedIn);
    url.searchParams.set("tokenOut", normalizedOut);
    url.searchParams.set("amountIn", amountInRaw);
    url.searchParams.set("gasInclude", "true");

    try {
      const res = await fetch(url.toString(), {
        headers: {
          accept: "application/json",
          'x-client-id': 'kyberswap',
          'User-Agent': 'Mozilla/5.0',
        },
        signal: AbortSignal.timeout(5000), // 5 seconds timeout
      });

      const latencyMs = Date.now() - startedAt;

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`HTTP Error ${res.status}: ${errText}`);
      }

      const rawData = await res.json() as {
        code?: number;
        message?: string;
        data?: {
          routeSummary?: {
            outputAmount?: string;
            amountOut?: string;
            totalGas?: number | string;
            gas?: number | string;
          };
        };
      };

      // KyberSwap returns code: 0 for success
      if (rawData.code !== 0 && rawData.code !== undefined) {
        throw new Error(rawData.message || `KyberSwap API Error Code ${rawData.code}`);
      }

      const route = rawData.data?.routeSummary;
      const outputAmountRaw = route?.outputAmount || route?.amountOut;
      if (!route || !outputAmountRaw) {
        throw new Error("No routeSummary output amount returned from KyberSwap");
      }

      const estimatedGas = route.totalGas || route.gas ? String(route.totalGas || route.gas) : "150000";

      return {
        provider: this.provider,
        success: true,
        chainId,
        tokenIn,
        tokenOut,
        amountInRaw,
        outputAmountRaw,
        outputAmountFormatted: formatUnits(outputAmountRaw, tokenOutDecimals),
        estimatedGas,
        latencyMs,
        quoteDirection: "equal",
        raw: rawData,
      };
    } catch (err) {
      return {
        provider: this.provider,
        success: false,
        chainId,
        tokenIn,
        tokenOut,
        amountInRaw,
        latencyMs: Date.now() - startedAt,
        timeout: err instanceof Error && err.name === "TimeoutError",
        quoteDirection: "failed",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
export const kyberAdapter = new KyberAdapter();
