/**
 * NexusCore SDK Helper Utilities
 * Provides convenient wrappers for common operations
 */

import { NexusClient } from '@nexus/nexuscore';
import { createWalletFromPrivateKey as nexusCreateWallet, createRandomWallet as nexusCreateRandom } from '@nexus/nexuscore';
import config from '../config/env';

/**
 * Create a NexusClient instance for a specific chain
 */
export function createNexusClient(chainName: string): NexusClient {
    const chainConfig = config[chainName];
    if (!chainConfig || !chainConfig.chainId) {
        throw new Error(`Invalid chain configuration for ${chainName}`);
    }

    return new NexusClient({
        chainId: chainConfig.chainId,
        rpcUrl: chainConfig.rpcUrl,
        bundlerUrl: chainConfig.bundlerUrl,
        paymasterUrl: chainConfig.paymasterUrl,
        debug: process.env.NODE_ENV === 'development'
    });
}

/**
 * Create wallet from private key
 */
export { nexusCreateWallet as createWalletFromPrivateKey };

/**
 * Create random wallet
 */
export { nexusCreateRandom as createRandomWallet };

