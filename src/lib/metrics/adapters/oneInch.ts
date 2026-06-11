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
      const slippage = 50;
      const url = `https://api.1inch.dev/swap/v6.0/${chainId}/swap?src=${normalizedIn}&dst=${normalizedOut}&amount=${amountInRaw}&from=${params.userAddress}&slippage=${slippage}&protocols=UNISWAP_V2,BASE_UNISWAP_V2,ETHEREUM_PANCAKESWAP_V2,PANCAKESWAP_V2,BASE_PANCAKESWAP_V2,SHIBASWAP,FRAXSWAP,SUSHI,BASE_SUSHI_V2,VERSE,UNISWAP_V3,BSC_UNISWAP_V3,BASE_UNISWAP_V3,PANCAKESWAP_V3,BSC_PANCAKESWAP_V3,BASE_PANCAKESWAP_V3,SUSHISWAP_V3,BASE_SUSHI_V3,SOLIDLY_V3,BASE_SOLIDLY_V3,CURVE,CURVE_3CRV,BASE_CURVE,CURVE_STABLE_NG,BSC_PANCAKESWAP_STABLE,CURVE_V2,CURVE_V2_TWO_CRYPTO,CURVE_V2_TWOCRYPTO_META,CURVE_V2_SPELL_2_ASSET,CURVE_V2_SGT_2_ASSET,CURVE_V2_THRESHOLDNETWORK_2_ASSET,CURVE_V2_EURS_2_ASSET,CURVE_V2_ETH_CRV,CURVE_V2_ETH_CVX,CURVE_V2_YFI_2_ASSET,CURVE_V2_ETH_PAL,BASE_CURVE_V2_TWO_CRYPTO,CURVE_V2_TWOCRYPTO_NG,CURVE_V2_TRICRYPTO_NG,BASE_CURVE_V2_TRICRYPTO_NG,CURVE_V2_LLAMMA,PANCAKESWAP,APESWAP,ELLIPSIS_FINANCE,BASE_SWAP,BASE_BASESWAP_V3,BASE_ALIEN_BASE,BASE_AERODROME_V3,UNISWAP_V4,BSC_UNISWAP_V4,BASE_UNISWAP_V4,BSC_PANCAKESWAP_V4,BASE_PANCAKESWAP_V4,FLUID_DEX_LITE,BASE_FLUID_DEX_T1,FLUID_DEX_T1,LITEPSM_USDC,BASE_SPARK_PSM,RINGSWAP_V2,BSC_RINGSWAP_V2,BASE_RINGSWAP_V2,BALANCER_V3,BASE_BALANCER_V3%DODO%DODO_V2%BALANCER_V2%BALANCER%SYNAPSE%ST_ETH&disableEstimate=true&includeProtocols=true`;
      
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

      const data = await res.json() as { 
        dstAmount?: string; 
        toAmount?: string; 
        gas?: number | string;
        protocols?: any[];
      };
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
