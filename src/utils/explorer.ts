import { Chain } from '../types/token';

const EXPLORERS = {
    arbitrum: 'https://arbiscan.io',
    polygon: 'https://polygonscan.com',
    base: 'https://basescan.org',
    optimism: 'https://optimistic.etherscan.io',
    celo: 'https://celoscan.io',
    avalanche: 'https://snowtrace.io',
    bnb: 'https://bscscan.com',
    scroll: 'https://scrollscan.com',
    gnosis: 'https://gnosisscan.io',
    fantom: 'https://ftmscan.com',
    somnia: 'https://explorer.somnia.network',
    moonbeam: 'https://moonbeam.moonscan.io',
    fuse: 'https://explorer.fuse.io',
    aurora: 'https://explorer.aurora.dev',
    lisk: 'https://blockscout.lisk.com'
};

/**
 * Generate blockchain explorer URL for a transaction
 * @param chain The blockchain network
 * @param txHash The transaction hash
 * @returns The explorer URL for the transaction
 */
export function generateExplorerUrl(chain: Chain, txHash: string): string {
    const baseUrl = EXPLORERS[chain];
    if (!baseUrl) {
        throw new Error(`Explorer URL not configured for chain: ${chain}`);
    }
    return `${baseUrl}/tx/${txHash}`;
} 