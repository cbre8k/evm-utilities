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
      url.searchParams.set("slippagePercentage", "1.0");
      url.searchParams.set("excludedSources", "0x_RFQ,Ambient,Angle,Bancor_V3,Baseline,Bebop,Blackhole,Blackhole_CL,Cypher_V4,DeFi_Swap,ERC4626,Ekubo,Ekubo_V3,Ethena,FraxUSD,InfiniFi,Integral,Maverick,Maverick_V2,Metric,Native_V2,Origin,PancakeSwap_Infinity_Bin,Polygon_Migration,Printr,RocketPool,Rubicon,Sky_Migration,Stabull,Stepn,Swaap_V2,USDD_PSM,Yearn,Yearn_V3,BabyDogeSwap,Bebop,BiSwap_V3,DinosaurEggs,ERC4626,ElfomoFi,IziSwap,Lista_Stable,MDEX,Maverick,Maverick_V2,Native_V2,Nerve,Nomiswap_Stable,Obric,Orion_V2,PancakeSwap_Infinity_Bin,Printr,Smoothy_V1,SquadSwap_V2,SquadSwap_V3,TesseraSwap,Topaz,Topaz_CL,WOOFi_V2,WaultSwap,Wombat,9MM_V2,9MM_V3,Aerodrome_V2,AlienBase_Stable,Clober_V2,DackieSwap_V2,DackieSwap_V3,DeltaSwap,ElfomoFi,Equalizer,Feltir,Hanji,Hydrex,Hydrex_Legacy,Infusion,IziSwap,Kim_V4,Kinetix,Kipseli,LunarBase,Morphex,Nabla,Omni_V3,Overnight,Pinto,QuickSwap_V4,RocketSwap,SharkSwap_V2,SoSwap,SwapBased_V3,Synthswap_V2,Synthswap_V3,TesseraSwap,Thick,Treble,Treble_V2,Treble_V4,Velodrome_V3.1,Virtuals,WOOFi_V2,Wrapped_BLT");
      
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
        route?: {
          fills?: Array<{ source?: string }>;
        };
      };

      if (!data.buyAmount) {
        throw new Error("No buyAmount returned in 0x response");
      }

      const dexes = Array.from(new Set(data.route?.fills?.map((f) => f.source).filter(Boolean))) as string[];

      console.log("0x quote dexes:", dexes);

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
        dexes,
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
