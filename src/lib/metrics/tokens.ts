import { JsonRpcProvider, Contract } from "ethers";
import type { AggregatorProvider } from "./types";
import { NETWORKS } from "../constants";

export const NATIVE_TOKEN_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  name: string;
}

// Predefined major tokens per chain
export const TOKEN_REGISTRY: Record<number, TokenInfo[]> = {
  1: [
    { address: NATIVE_TOKEN_ADDRESS, symbol: "ETH", decimals: 18, name: "Ether" },
    { address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", symbol: "WETH", decimals: 18, name: "Wrapped Ether" },
    { address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", symbol: "USDC", decimals: 6, name: "USD Coin" },
    { address: "0xdac17f958d2ee523a2206206994597c13d831ec7", symbol: "USDT", decimals: 6, name: "Tether USD" },
    { address: "0x6b175474e89094c44da98b954eedeac495271d0f", symbol: "DAI", decimals: 18, name: "Dai Stablecoin" },
    { address: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", symbol: "WBTC", decimals: 8, name: "Wrapped BTC" },
    { address: "0x514910771af9ca656af840dff83e8264ecf986ca", symbol: "LINK", decimals: 18, name: "Link" },
  ],
  56: [
    { address: NATIVE_TOKEN_ADDRESS, symbol: "BNB", decimals: 18, name: "Binance Chain Native Token" },
    { address: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", symbol: "WBNB", decimals: 18, name: "Wrapped BNB" },
    { address: "0x55d398326f99059ff775485246999027b3197955", symbol: "USDT", decimals: 18, name: "Tether USD" },
    { address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", symbol: "USDC", decimals: 18, name: "USD Coin" },
    { address: "0xe9e7cea3dedca5984780bafc599bd69add087d56", symbol: "BUSD", decimals: 18, name: "Binance USD" },
  ],
  42161: [
    { address: NATIVE_TOKEN_ADDRESS, symbol: "ETH", decimals: 18, name: "Ether" },
    { address: "0x82af49447d8a07e3bd95bd0d56f352415231daa1", symbol: "WETH", decimals: 18, name: "Wrapped Ether" },
    { address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831", symbol: "USDC", decimals: 6, name: "USD Coin" },
    { address: "0xfd086bc7cd5c481d117bc47eb53590c1e5113b2c", symbol: "USDT", decimals: 6, name: "Tether USD" },
    { address: "0x912ce59144191c1204e64559fe8253a0e49e6548", symbol: "ARB", decimals: 18, name: "Arbitrum" },
  ],
  10: [
    { address: NATIVE_TOKEN_ADDRESS, symbol: "ETH", decimals: 18, name: "Ether" },
    { address: "0x4200000000000000000000000000000000000006", symbol: "WETH", decimals: 18, name: "Wrapped Ether" },
    { address: "0x0b2c639c533813f4aa9d7837caf62653d097ff85", symbol: "USDC", decimals: 6, name: "USD Coin" },
    { address: "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58", symbol: "USDT", decimals: 6, name: "Tether USD" },
    { address: "0x4200000000000000000000000000000000000042", symbol: "OP", decimals: 18, name: "Optimism OP" },
  ],
  8453: [
    { address: NATIVE_TOKEN_ADDRESS, symbol: "ETH", decimals: 18, name: "Ether" },
    { address: "0x4200000000000000000000000000000000000006", symbol: "WETH", decimals: 18, name: "Wrapped Ether" },
    { address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", symbol: "USDC", decimals: 6, name: "USD Coin" },
    { address: "0x50c5725949a6f017460147b20a21374bd5565453", symbol: "USDT", decimals: 6, name: "Tether USD" },
  ],
};

/**
 * Checks if an address represents the native gas token
 */
export function isNativeToken(address: string): boolean {
  const clean = address.toLowerCase().trim();
  return (
    clean === NATIVE_TOKEN_ADDRESS.toLowerCase() ||
    clean === ZERO_ADDRESS ||
    clean === "eth" ||
    clean === "bnb"
  );
}

/**
 * Normalizes token address for a specific provider
 */
export function normalizeTokenForProvider(params: {
  provider: AggregatorProvider;
  chainId: number;
  tokenAddress: string;
  wrappedNativeAddress: string;
}): string {
  const { provider, tokenAddress } = params;

  if (isNativeToken(tokenAddress)) {
    switch (provider) {
      case "stormlink":
        return ZERO_ADDRESS;
      case "okx":
      case "0x":
      case "1inch":
      default:
        // Use 0xeeee... for native
        return NATIVE_TOKEN_ADDRESS;
    }
  }

  return tokenAddress.toLowerCase().trim();
}

/**
 * Retrieves the wrapped native token address for a given chainId
 */
export function getWrappedNativeAddress(chainId: number): string {
  switch (chainId) {
    case 56:
      return "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c"; // WBNB
    case 42161:
      return "0x82af49447d8a07e3bd95bd0d56f352415231daa1"; // WETH
    case 10:
    case 8453:
      return "0x4200000000000000000000000000000000000006"; // WETH
    case 1:
    default:
      return "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"; // WETH
  }
}

/**
 * Lookup token details locally, or fall back to query RPC for custom token address
 */
export async function getTokenDetails(
  address: string,
  chainId: number
): Promise<{ symbol: string; decimals: number }> {
  const cleanAddress = address.toLowerCase().trim();

  // 1. Check registry
  const list = TOKEN_REGISTRY[chainId] || [];
  const found = list.find((t) => t.address.toLowerCase() === cleanAddress || (isNativeToken(address) && t.address === NATIVE_TOKEN_ADDRESS));
  if (found) {
    return { symbol: found.symbol, decimals: found.decimals };
  }

  if (isNativeToken(address)) {
    return { symbol: chainId === 56 ? "BNB" : "ETH", decimals: 18 };
  }

  // 2. Query RPC (safe fallback)
  const network = NETWORKS.find((n) => Number(n.id === "mainnet" ? 1 : n.id === "bsc" ? 56 : n.id === "arbitrum" ? 42161 : n.id === "optimism" ? 10 : n.id === "base" ? 8453 : 0) === chainId);
  const rpcUrl = network?.fullnodeRpcUrls[0];
  if (rpcUrl) {
    try {
      const provider = new JsonRpcProvider(rpcUrl);
      const abi = [
        "function decimals() view returns (uint8)",
        "function symbol() view returns (string)",
      ];
      const contract = new Contract(cleanAddress, abi, provider);
      const [decimals, symbol] = await Promise.all([
        contract.decimals().catch(() => 18),
        contract.symbol().catch(() => "UNKNOWN"),
      ]);
      return { symbol: String(symbol), decimals: Number(decimals) };
    } catch {
      // Fall through to default
    }
  }

  return { symbol: "TOKEN", decimals: 18 };
}
