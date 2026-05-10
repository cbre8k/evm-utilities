"use strict";
// ============================================================
// shared/constants/networks.ts — Network configuration
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.NETWORKS = void 0;
exports.NETWORKS = [
    {
        id: 'mainnet',
        name: 'MAINNET',
        fullnodeRpcUrls: ['https://mainnet.rpc.sentio.xyz', 'https://ethereum-rpc.publicnode.com', 'https://eth.blockrazor.xyz', 'https://api.zan.top/eth-mainnet', 'https://ethereum.public.blockpi.network/v1/rpc/public'],
        archiveRpcUrls: ['https://mainnet.chainnodes.org/2067b7f3-ccf2-4bf2-9fd2-b318bd6e7098'],
    },
    {
        id: 'bsc',
        name: 'BSC',
        fullnodeRpcUrls: ['https://binance-smart-chain-public.nodies.app', 'https://bsc.meowrpc.com', 'https://bsc.blockrazor.xyz'],
        archiveRpcUrls: ['https://bsc-mainnet.chainnodes.org/2067b7f3-ccf2-4bf2-9fd2-b318bd6e7098'],
    },
    {
        id: 'arbitrum',
        name: 'ARBITRUM',
        fullnodeRpcUrls: ['https://arbitrum.meowrpc.com', 'https://rpc.ankr.com/arbitrum', 'https://api.zan.top/arb-one', 'https://arbitrum.public.blockpi.network/v1/rpc/public'],
        archiveRpcUrls: ['https://arbitrum-one.chainnodes.org/2067b7f3-ccf2-4bf2-9fd2-b318bd6e7098'],
    },
    {
        id: 'optimism',
        name: 'OPTIMISM',
        fullnodeRpcUrls: ['https://mainnet.optimism.io', 'https://rpc.ankr.com/optimism', 'https://api.zan.top/opt-mainnet', 'https://optimism-public.nodies.app'],
        archiveRpcUrls: ['https://optimism-mainnet.chainnodes.org/2067b7f3-ccf2-4bf2-9fd2-b318bd6e7098'],
    },
    {
        id: 'base',
        name: 'BASE',
        fullnodeRpcUrls: ['https://mainnet.base.org', 'https://api.zan.top/base-mainnet', 'https://developer-access-mainnet.base.org', 'https://base.drpc.org'],
        archiveRpcUrls: ['https://base-mainnet.chainnodes.org/2067b7f3-ccf2-4bf2-9fd2-b318bd6e7098'],
    },
    {
        id: 'custom',
        name: 'CUSTOM',
        fullnodeRpcUrls: [''],
        archiveRpcUrls: [''],
    },
];
//# sourceMappingURL=networks.js.map