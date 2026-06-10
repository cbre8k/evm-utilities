import type { QuoteAdapter } from "./base";
import type { QuoteRequest, StandardizedQuote } from "../types";
import { normalizeTokenForProvider, getWrappedNativeAddress } from "../tokens";
import { formatUnits } from "ethers";

const ZERO_X_BASE_URLS: Record<number, string> = {
  1: "https://api.0x.org",
  56: "https://bsc.api.0x.org",
  42161: "https://arbitrum.api.0x.org",
  10: "https://optimism.api.0x.org",
  8453: "https://base.api.0x.org",
};

function getZeroXApiKey(): string {
  const apiKey = process.env.ZEROX_API_KEY || process.env.ZERO_X_API_KEY;
  if (!apiKey) {
    throw new Error("0x API key is not configured");
  }
  return apiKey;
}

export class ZeroXAdapter implements QuoteAdapter {
  provider = "0x" as const;

  async quote(params: QuoteRequest): Promise<StandardizedQuote> {
    const startedAt = Date.now();
    const { chainId, tokenIn, tokenOut, amountInRaw, tokenOutDecimals, userAddress } = params;

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

    const baseUrl = process.env.ZEROX_API_URL?.trim() || ZERO_X_BASE_URLS[chainId];
    if (!baseUrl) {
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

    try {
      const url = new URL(`${baseUrl.replace(/\/+$/, "")}/swap/allowance-holder/quote`);
      url.searchParams.set("chainId", String(chainId));
      url.searchParams.set("buyToken", normalizedOut);
      url.searchParams.set("sellToken", normalizedIn);
      url.searchParams.set("sellAmount", amountInRaw);
      if (userAddress) {
        url.searchParams.set("taker", userAddress);
      }
      
      const res = await fetch(url.toString(), {
        headers: {
          "0x-api-key": getZeroXApiKey(),
          "0x-version": "v2",
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(5000), // 5 seconds timeout
      });

      const latencyMs = Date.now() - startedAt;

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.reason || `HTTP Error ${res.status}`);
      }

      const data = await res.json() as {
        buyAmount?: string;
        estimatedGas?: string;
        gas?: string;
        transaction?: {
          to?: string;
          data?: string;
          value?: string;
          gas?: string;
        };
        issues?: {
          allowance?: {
            spender?: string;
          };
        };
        allowanceTarget?: string;
      };

      if (!data.buyAmount) {
        throw new Error("No buyAmount returned in 0x response");
      }

      return {
        provider: this.provider,
        success: true,
        chainId,
        tokenIn,
        tokenOut,
        amountInRaw,
        outputAmountRaw: data.buyAmount,
        outputAmountFormatted: formatUnits(data.buyAmount, tokenOutDecimals),
        estimatedGas: data.estimatedGas || data.gas || data.transaction?.gas || "150000",
        latencyMs,
        quoteDirection: "equal",
        raw: data,
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
export const zeroXAdapter = new ZeroXAdapter();
