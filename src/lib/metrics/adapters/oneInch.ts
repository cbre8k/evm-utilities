import type { QuoteAdapter } from "./base";
import type { QuoteRequest, StandardizedQuote } from "../types";
import { normalizeTokenForProvider, getWrappedNativeAddress } from "../tokens";
import { formatUnits } from "ethers";

export class OneInchAdapter implements QuoteAdapter {
  provider = "1inch" as const;

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

    try {
      // 1inch v6.0 quote endpoint
      const url = `https://api.1inch.dev/swap/v6.0/${chainId}/quote?src=${normalizedIn}&dst=${normalizedOut}&amount=${amountInRaw}`;
      
      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer yGeJizGXM9CMyzWQtRL4boEKc3ygUtnF`
        },
        signal: AbortSignal.timeout(5000), // 5 seconds timeout
      });

      const latencyMs = Date.now() - startedAt;

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.description || errData?.message || `HTTP Error ${res.status}`);
      }

      const data = await res.json() as { dstAmount?: string; toAmount?: string; gas?: number | string };
      const outputAmountRaw = data.dstAmount || data.toAmount;

      if (!outputAmountRaw) {
        throw new Error("No output amount returned in 1inch response");
      }

      const estimatedGas = data.gas ? String(data.gas) : "150000";

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
export const oneInchAdapter = new OneInchAdapter();
