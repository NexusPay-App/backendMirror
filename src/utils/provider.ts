import { ethers } from 'ethers';

// RPC endpoints for different chains
const RPC_ENDPOINTS: Record<string, string> = {
    arbitrum: 'https://arb1.arbitrum.io/rpc',
    polygon: 'https://polygon-rpc.com',
    base: 'https://mainnet.base.org',
    optimism: 'https://mainnet.optimism.io',
    celo: 'https://forno.celo.org',
    avalanche: 'https://api.avax.network/ext/bc/C/rpc',
    bnb: 'https://bsc-dataseed1.binance.org',
    fantom: 'https://rpc.ftm.tools',
    scroll: 'https://rpc.scroll.io',
    gnosis: 'https://rpc.gnosischain.com'
};

export function getProvider(chain: string): ethers.providers.JsonRpcProvider {
    const rpcUrl = RPC_ENDPOINTS[chain.toLowerCase()];
    
    if (!rpcUrl) {
        throw new Error(`Unsupported chain: ${chain}`);
    }
    
    return new ethers.providers.JsonRpcProvider(rpcUrl);
}

export function getChainId(chain: string): number {
    const chainIds: Record<string, number> = {
        arbitrum: 42161,
        polygon: 137,
        base: 8453,
        optimism: 10,
        celo: 42220,
        avalanche: 43114,
        bnb: 56,
        fantom: 250,
        scroll: 534352,
        gnosis: 100
    };
    
    const chainId = chainIds[chain.toLowerCase()];
    if (!chainId) {
        throw new Error(`Unsupported chain: ${chain}`);
    }
    
    return chainId;
}

export function getWallet(privateKey: string, chainName: string = 'arbitrum'): ethers.Wallet {
    return new ethers.Wallet(privateKey, getProvider(chainName));
}

export function getSupportedChains(): string[] {
    return Object.keys(RPC_ENDPOINTS);
} 