import type { QuoteAdapter } from "./base";
import type { QuoteRequest, StandardizedQuote } from "../types";
import { normalizeTokenForProvider, getWrappedNativeAddress } from "../tokens";
import { formatUnits, parseUnits } from "ethers";

const DEFAULT_STORMLINK_SWAP_URL = "https://superlink-v2-router.coin98.tech/v1/routes/swap";
const STORMLINK_TIMEOUT_MS = 15000;

function resolveSwapUrl(apiUrl?: string): string {
  const configuredUrl = apiUrl?.trim() || DEFAULT_STORMLINK_SWAP_URL;
  const normalizedUrl = configuredUrl.replace(/\/+$/, "");

  if (normalizedUrl.endsWith("/v1/routes/swap")) {
    return normalizedUrl;
  }

  return `${normalizedUrl}/v1/routes/swap`;
}

export class StormlinkAdapter implements QuoteAdapter {
  provider = "stormlink" as const;

  async quote(params: QuoteRequest): Promise<StandardizedQuote> {
    const startedAt = Date.now();
    const { chainId, tokenIn, tokenOut, amountInRaw, tokenInDecimals, tokenOutDecimals } = params;

    const apiUrl = process.env.STORMLINK_API_URL;

    try {
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

      const queryUrl = resolveSwapUrl(apiUrl);
      const slippagePct = params.slippageBps ? (params.slippageBps / 100).toFixed(2) : "1.00";

      const requestBody = {
        chainId,
        tokenInAddress: normalizedIn,
        tokenOutAddress: normalizedOut,
        amount: formatUnits(amountInRaw, tokenInDecimals),
        excludeFee: true,
        excludeTokenFee: true,
        exchanges: [],
        cacheMode: 0,
        from: params.userAddress || "0xf04a5cc80b1e94c69b48f5ee68a08cd2f09a7c3e",
        deadline: "1000000",
        slippage: slippagePct,
        testMode: false,
        reusePools: true,
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      const res = await fetch(queryUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(STORMLINK_TIMEOUT_MS),
      });

      const latencyMs = Date.now() - startedAt;

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`HTTP Error ${res.status}${errText ? `: ${errText}` : ""}`);
      }

      const data = await res.json() as {
        status?: string;
        message?: string;
        result?: {
          quote?: string | number;
          gasUsed?: string | number;
        };
      };

      if (data.status !== "OK") {
        throw new Error(data.message || "Failed status from Stormlink");
      }

      const result = data.result;
      if (!result) {
        throw new Error(data.message || "No result object in Stormlink response");
      }

      const rawOutput = result.quote;
      if (rawOutput === undefined || rawOutput === null || rawOutput === "") {
        throw new Error(data.message || "Not found route or missing output amount");
      }

      let rawOutputStr = String(rawOutput);
      const [intPart, fraction] = rawOutputStr.split(".");
      let fracPart = fraction;
      if (fracPart && fracPart.length > tokenOutDecimals) {
        fracPart = fracPart.slice(0, tokenOutDecimals);
        rawOutputStr = `${intPart}.${fracPart}`;
      }
      const outputAmountRaw = parseUnits(rawOutputStr, tokenOutDecimals).toString();

      return {
        provider: this.provider,
        success: true,
        chainId,
        tokenIn,
        tokenOut,
        amountInRaw,
        outputAmountRaw,
        outputAmountFormatted: formatUnits(outputAmountRaw, tokenOutDecimals),
        estimatedGas: result.gasUsed ? String(result.gasUsed) : "130000",
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
export const stormlinkAdapter = new StormlinkAdapter();
