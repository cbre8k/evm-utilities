// ============================================================
// shared/constants/networks.ts — Network configuration
// ============================================================

export type Network = {
  id: string;
  name: string;
  /** EVM chain id. 0 for the user-supplied CUSTOM entry. */
  chainId: number;
  fullnodeRpcUrls: string[];
  /**
   * Archive-capable endpoints (needed for historical state and tracing).
   * Falls back to `fullnodeRpcUrls` when no keyed archive node is configured.
   */
  archiveRpcUrls: string[];
};

/**
 * Chainnodes archive endpoints are keyed. The key comes from the environment
 * rather than being committed — without it we fall back to the public
 * fullnodes below, which cannot serve historical state.
 *
 * This is a NEXT_PUBLIC_ variable because the network picker runs in the
 * browser, so the key is visible to users either way; keeping it in the
 * environment is about rotation, not secrecy.
 */
const CHAINNODES_KEY = process.env.NEXT_PUBLIC_CHAINNODES_KEY ?? '';

const chainnodes = (subdomain: string): string[] =>
  CHAINNODES_KEY ? [`https://${subdomain}.chainnodes.org/${CHAINNODES_KEY}`] : [];

const NETWORK_DEFS: Network[] = [
  {
    id: 'mainnet',
    name: 'MAINNET',
    chainId: 1,
    fullnodeRpcUrls: [
      'https://eth.blockrazor.xyz',
      'https://mainnet.rpc.sentio.xyz',
      'https://ethereum-rpc.publicnode.com',
      'https://api.zan.top/eth-mainnet',
      'https://ethereum.public.blockpi.network/v1/rpc/public',
    ],
    archiveRpcUrls: chainnodes('mainnet'),
  },
  {
    id: 'bsc',
    name: 'BSC',
    chainId: 56,
    fullnodeRpcUrls: [
      'https://binance-smart-chain-public.nodies.app',
      'https://bsc.meowrpc.com',
      'https://bsc.blockrazor.xyz',
    ],
    archiveRpcUrls: chainnodes('bsc-mainnet'),
  },
  {
    id: 'arbitrum',
    name: 'ARBITRUM',
    chainId: 42161,
    fullnodeRpcUrls: [
      'https://arbitrum.meowrpc.com',
      'https://rpc.ankr.com/arbitrum',
      'https://api.zan.top/arb-one',
      'https://arbitrum.public.blockpi.network/v1/rpc/public',
    ],
    archiveRpcUrls: chainnodes('arbitrum-one'),
  },
  {
    id: 'optimism',
    name: 'OPTIMISM',
    chainId: 10,
    fullnodeRpcUrls: [
      'https://mainnet.optimism.io',
      'https://rpc.ankr.com/optimism',
      'https://api.zan.top/opt-mainnet',
      'https://optimism-public.nodies.app',
    ],
    archiveRpcUrls: chainnodes('optimism-mainnet'),
  },
  {
    id: 'base',
    name: 'BASE',
    chainId: 8453,
    fullnodeRpcUrls: [
      'https://mainnet.base.org',
      'https://api.zan.top/base-mainnet',
      'https://developer-access-mainnet.base.org',
      'https://base.drpc.org',
    ],
    archiveRpcUrls: chainnodes('base-mainnet'),
  },
  {
    id: 'viction',
    name: 'VICTION',
    chainId: 88,
    fullnodeRpcUrls: [
      'https://viction.blockpi.network/v1/rpc/public',
      'https://viction.drpc.org',
      'https://rpc.viction.xyz',
    ],
    archiveRpcUrls: ['https://vic-mainnetd-rpc.tforce.dev/'],
  },
  {
    id: 'custom',
    name: 'CUSTOM',
    chainId: 0,
    fullnodeRpcUrls: [''],
    archiveRpcUrls: [''],
  },
];

export const NETWORKS: Network[] = NETWORK_DEFS.map((network) => ({
  ...network,
  archiveRpcUrls:
    network.archiveRpcUrls.length > 0 ? network.archiveRpcUrls : network.fullnodeRpcUrls,
}));

/** Look up a network by EVM chain id. Never matches the CUSTOM entry. */
export function networkByChainId(chainId: number): Network | undefined {
  return chainId === 0 ? undefined : NETWORKS.find((n) => n.chainId === chainId);
}
