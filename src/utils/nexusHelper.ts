/**
 * NexusCore SDK Helper Utilities
 * Provides convenient wrappers for common operations
 */

import { NexusClient, NexusSDK, createNexusSDK } from '@nexus/nexuscore';
import { ethers } from 'ethers';
import config from '../config/env';

/**
 * NexusCore API Configuration for Beach Project
 */
export const NEXUS_API_CONFIG = {
    apiKey: 'nex_z4mvnhgjtzk_44rrxxxdtnb',
    apiBaseUrl: 'http://localhost:3000/api/v1',
    sdkUrl: 'http://localhost:3000/api/v1/sdk/beach',
    webhookUrl: 'http://localhost:3000/api/v1/webhooks/cmihfksay000212pkg2ye6xun',
    projectId: 'beach', // Project name
    environment: 'testnet' as const
};

/**
 * Chain configuration mapping for NexusPay chains
 * Maps NexusPay chain names to NexusCore chainIds and RPC URLs
 */
const CHAIN_CONFIG_MAP: Record<string, { chainId: number; rpcUrl: string }> = {
    // Mainnet chains
    arbitrum: {
        chainId: 42161,
        rpcUrl: 'https://arb1.arbitrum.io/rpc'
    },
    celo: {
        chainId: 42220,
        rpcUrl: 'https://forno.celo.org'
    },
    polygon: {
        chainId: 137,
        rpcUrl: 'https://polygon-rpc.com'
    },
    optimism: {
        chainId: 10,
        rpcUrl: 'https://mainnet.optimism.io'
    },
    base: {
        chainId: 8453,
        rpcUrl: 'https://mainnet.base.org'
    },
    avalanche: {
        chainId: 43114,
        rpcUrl: 'https://api.avax.network/ext/bc/C/rpc'
    },
    bnb: {
        chainId: 56,
        rpcUrl: 'https://bsc-dataseed1.binance.org'
    },
    // Testnet chains
    sepolia: {
        chainId: 11155111,
        rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com'
    },
    'arbitrum-sepolia': {
        chainId: 421614,
        rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc'
    }
};

/**
 * Create a NexusClient instance for a specific chain
 */
export function createNexusClient(chainName: string): NexusClient {
    // Check if chain is in our mapping
    const mappedConfig = CHAIN_CONFIG_MAP[chainName.toLowerCase()];
    
    if (mappedConfig) {
        return new NexusClient({
            chainId: mappedConfig.chainId,
            rpcUrl: mappedConfig.rpcUrl,
            timeout: 30000,  // 30 seconds timeout
            retries: 3,      // 3 retry attempts
            debug: process.env.NODE_ENV === 'development'
        });
    }
    
    // Fallback: try to get from env config (for custom chains)
    const envConfig = config[chainName];
    if (envConfig && envConfig.chainId) {
        // Try to construct RPC URL from env or use default
        const rpcUrl = envConfig.rpcUrl || getRpcUrlForChainId(envConfig.chainId);
        
        return new NexusClient({
            chainId: envConfig.chainId,
            rpcUrl,
            timeout: 30000,
            retries: 3,
            debug: process.env.NODE_ENV === 'development'
        });
    }

    throw new Error(`Invalid chain configuration for ${chainName}. Supported chains: ${Object.keys(CHAIN_CONFIG_MAP).join(', ')}`);
}

/**
 * Get default RPC URL for a chain ID (fallback)
 */
function getRpcUrlForChainId(chainId: number): string {
    const rpcUrls: Record<number, string> = {
        42161: 'https://arb1.arbitrum.io/rpc',
        42220: 'https://forno.celo.org',
        137: 'https://polygon-rpc.com',
        10: 'https://mainnet.optimism.io',
        8453: 'https://mainnet.base.org',
        11155111: 'https://ethereum-sepolia.publicnode.com',
        421614: 'https://sepolia-rollup.arbitrum.io/rpc'
    };
    
    return rpcUrls[chainId] || `https://rpc.ankr.com/eth`;
}

/**
 * Create NexusSDK instance with Beach project configuration
 */
export function createNexusSDKInstance(privateKey?: string): NexusSDK {
    return createNexusSDK({
        apiKey: NEXUS_API_CONFIG.apiKey,
        apiBaseUrl: NEXUS_API_CONFIG.apiBaseUrl,
        projectId: NEXUS_API_CONFIG.projectId,
        environment: NEXUS_API_CONFIG.environment,
        debug: process.env.NODE_ENV === 'development'
    });
}

/**
 * Create wallet from private key using ethers
 */
export function createWalletFromPrivateKey(privateKey: string): ethers.Wallet {
    return new ethers.Wallet(privateKey);
}

/**
 * Create random wallet using ethers
 */
export function createRandomWallet(): ethers.Wallet {
    return ethers.Wallet.createRandom();
}

