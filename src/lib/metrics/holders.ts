// src/lib/metrics/holders.ts

// Map of ChainId -> TokenAddress -> Array of top holder addresses
// These addresses are used to simulate swap transactions with sufficient balance.
export const TOP_HOLDERS: Record<number, Record<string, string[]>> = {
  // Mainnet (Chain ID 1)
  1: {
    // Native ETH sentinel used by quote APIs
    "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee": [
      "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8",
      "0x40B38765696e3d5d8d9d834D8AaD4bB6e418E489",
      "0xE92d1A43df510F82C66382592a047d288f85226f",
      "0x1d48963DD8FAdA6aB5C2C7b92Eba81ECC5030270",
    ],
    "0x0000000000000000000000000000000000000000": [
      "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8",
      "0x40B38765696e3d5d8d9d834D8AaD4bB6e418E489",
      "0xE92d1A43df510F82C66382592a047d288f85226f",
      "0x1d48963DD8FAdA6aB5C2C7b92Eba81ECC5030270",
    ],
    // WETH (0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2)
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": [
      "0xF04a5cC80B1E94C69B48f5ee68a08CD2F09A7c3E",
      "0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8",
      "0x2F0b23f53734252Bda2277357e97e1517d6B042A",
      "0x4553e3Bc6327006A63C5aA4cdAC887f66b6A433E",
    ],
    // USDC (0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48)
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": [
      "0x37305B1cD40574E4C5Ce33f8e8306Be057fD7341",
      "0x38AAEF3782910bdd9eA3566C839788Af6FF9B200",
      "0xe1940f578743367F38D3f25c2D2d32D6636929B6",
      "0xaD354CfBAa4A8572DD6Df021514a3931A8329Ef5",
      "0xffA69C0080582098aF595156240214b742735a5e"
    ],
    // USDT (0xdac17f958d2ee523a2206206994597c13d831ec7)
    "0xdac17f958d2ee523a2206206994597c13d831ec7": [
      "0xF977814e90dA44bFA03b6295A0616a897441aceC",
      "0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503",
      "0x835678a611B28684005a5e2233695fB6cbbB0007",
      "0x5754284f345afc66a98fbB0a0Afe71e0F007B949",
      "0xB0A27099582833c0Cb8C7A0565759fF145113d64"
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
    return chainId === 1
      ? "0x28C6c06298d514Db089934071355E5743bf21d60"
      : "0xF04a5cC80B1E94C69B48f5ee68a08CD2F09A7c3E";
  }
  const randomIndex = Math.floor(Math.random() * holders.length);
  return holders[randomIndex];
}
