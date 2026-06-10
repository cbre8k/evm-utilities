import type { QuoteAdapter } from "./base";
import type { QuoteRequest, StandardizedQuote } from "../types";
import { normalizeTokenForProvider, getWrappedNativeAddress } from "../tokens";
import { formatUnits } from "ethers";
import { createHmac } from "crypto";

const OKX_SWAP_URL = "https://web3.okx.com/api/v6/dex/aggregator/swap";

function buildOkxHeaders(requestPath: string): Record<string, string> {
  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_API_PASSPHRASE || process.env.OKX_PASSPHRASE;
  const projectId = process.env.OKX_PROJECT_ID;

  if (!apiKey || !secretKey || !passphrase) {
    throw new Error("OKX credentials are not configured");
  }

  const timestamp = new Date().toISOString();
  const signature = createHmac("sha256", secretKey)
    .update(`${timestamp}GET${requestPath}`)
    .digest("base64");

  const headers: Record<string, string> = {
    "OK-ACCESS-KEY": apiKey,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": passphrase,
    "OK-ACCESS-SIGN": signature,
    "Content-Type": "application/json",
  };

  if (projectId) {
    headers["OK-ACCESS-PROJECT"] = projectId;
  }

  return headers;
}

export class OkxAdapter implements QuoteAdapter {
  provider = "okx" as const;

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
      // OKX swap endpoint returns both quote and executable tx data.
      const url = new URL(process.env.OKX_API_URL?.trim() || OKX_SWAP_URL);
      url.searchParams.set("chainIndex", String(chainId));
      url.searchParams.set("fromTokenAddress", normalizedIn);
      url.searchParams.set("toTokenAddress", normalizedOut);
      url.searchParams.set("amount", amountInRaw);
      url.searchParams.set("swapMode", "exactIn");
      url.searchParams.set("slippagePercent", params.slippageBps ? String(params.slippageBps / 100) : "1");
      if (params.userAddress) {
        url.searchParams.set("userWalletAddress", params.userAddress);
        url.searchParams.set("approveTransaction", "true");
        url.searchParams.set("approveAmount", amountInRaw);
      }
      const urlObj = new URL(url);
      const requestPath = urlObj.pathname + urlObj.search;
      const headers = buildOkxHeaders(requestPath);

      const res = await fetch(url.toString(), {
        headers,
        signal: AbortSignal.timeout(5000), // 5 seconds timeout
      });

      const latencyMs = Date.now() - startedAt;

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`HTTP Error ${res.status}: ${errText}`);
      }

      const rawData = await res.json() as {
        code: string;
        msg?: string;
        data: Array<{
          routerResult?: {
            toTokenAmount?: string;
            fromTokenAmount?: string;
          };
          toTokenAmount?: string;
          fromTokenAmount?: string;
          gas?: string;
          tx?: {
            to?: string;
            data?: string;
            value?: string;
            gas?: string;
            signatureData?: string[] | string;
          };
        }>;
      };

      if (rawData.code !== "0") {
        throw new Error(rawData.msg || `OKX API Error Code ${rawData.code}`);
      }

      const quoteData = rawData.data?.[0];
      const routerResult = quoteData?.routerResult || quoteData;
      const outputAmountRaw = routerResult?.toTokenAmount;
      if (!quoteData || !outputAmountRaw) {
        throw new Error("No quote data returned from OKX");
      }

      const estimatedGas = quoteData.gas || quoteData.tx?.gas ? String(quoteData.gas || quoteData.tx?.gas) : "150000";

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
export const okxAdapter = new OkxAdapter();
