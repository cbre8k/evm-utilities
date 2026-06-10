// src/lib/metrics/holders.ts

// Map of ChainId -> TokenAddress -> Array of top holder addresses
// These addresses are used to simulate swap transactions with sufficient balance.
export const TOP_HOLDERS: Record<number, Record<string, string[]>> = {
  // Mainnet (Chain ID 1)
  1: {
    // WETH (0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2)
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": [
      "0xF04a5cC80B1E94C69B48f5ee68a08CD2F09A7c3E", // general fallback
      "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      "0x28C6c06298d514Db089934071355E5743bf21d60",
      "0x00000000219ab540356cBB839Cbe05303d7705Fa", // beacon chain deposit
      "0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503"
    ],
    // USDC (0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48)
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": [
      "0x0A59649758aa4d66E25f08Dd01271e891fe52199",
      "0x4B16c5dE96EB2117bBE5fd171E4d203624B014aa",
      "0x5180db0237291A6449DdA9ed33aD90a38787621c",
      "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      "0x28C6c06298d514Db089934071355E5743bf21d60"
    ],
    // USDT (0xdac17f958d2ee523a2206206994597c13d831ec7)
    "0xdac17f958d2ee523a2206206994597c13d831ec7": [
      "0x5754284f345afc66a98fbB0a0Afe71e0F007B949",
      "0xF977814e90dA44bFA03b6295A0616a897441aceC",
      "0x28C6c06298d514Db089934071355E5743bf21d60",
      "0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503",
      "0x4B16c5dE96EB2117bBE5fd171E4d203624B014aa"
    ]
  },
  // BSC (Chain ID 56)
  56: {
    // WBNB
    "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c": [
      "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3",
      "0xf977814e90da44bfa03b6295a0616a897441acec"
    ]
  }
};

/**
 * Returns a top holder for a given token on a given chain, or a default fallback if none found.
 */
export function getRandomTopHolder(chainId: number, tokenAddress: string): string {
  const holders = TOP_HOLDERS[chainId]?.[tokenAddress.toLowerCase()];
  if (!holders || holders.length === 0) {
    // Return a default whale or fallback address
    return "0xF04a5cC80B1E94C69B48f5ee68a08CD2F09A7c3E";
  }
  const randomIndex = Math.floor(Math.random() * holders.length);
  return holders[randomIndex];
}
