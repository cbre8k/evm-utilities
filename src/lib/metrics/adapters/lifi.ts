import type { QuoteAdapter } from "./base";
import type { QuoteRequest, StandardizedQuote } from "../types";
import { normalizeTokenForProvider, getWrappedNativeAddress } from "../tokens";
import { formatUnits } from "ethers";

export class LifiAdapter implements QuoteAdapter {
  provider = "lifi" as const;

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
      const url = `https://li.quest/v1/quote?fromChain=${chainId}&toChain=${chainId}&fromToken=${normalizedIn}&toToken=${normalizedOut}&fromAmount=${amountInRaw}&fromAddress=${params.userAddress || "0x0000000000000000000000000000000000000000"}`;
      
      const res = await fetch(url, {
        headers: {
          'x-lifi-api-key': 'd04bcd3e9223c826766fb38b55-93b2-44f1-9ba6-de5defda90d8.9a9c0504-b736-465b-80fb-1766bf907cc4',
        },
        signal: AbortSignal.timeout(5000), // 5 seconds timeout
      });

      const latencyMs = Date.now() - startedAt;

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.message || `HTTP Error ${res.status}`);
      }

      const data = await res.json();
      
      const route = data;
      if (!route.estimate || !route.estimate.toAmount) {
        throw new Error("No output amount returned from LI.FI");
      }

      const outputAmountRaw = route.estimate.toAmount;
      const estimatedGas = route.estimate.gasCosts?.[0]?.estimate ? String(route.estimate.gasCosts[0].estimate) : "150000";

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
export const lifiAdapter = new LifiAdapter();
