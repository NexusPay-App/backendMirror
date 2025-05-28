import { randomUUID } from 'crypto';

/**
 * Generate a UUID for unique identification
 */
export function generateUUID(): string {
  return randomUUID();
}

/**
 * Generate explorer URL for a transaction
 */
export function generateExplorerUrl(chain: string, txHash: string): string {
  const explorers: {[key: string]: string} = {
    'celo': 'https://explorer.celo.org/mainnet/tx/',
    'polygon': 'https://polygonscan.com/tx/',
    'arbitrum': 'https://arbiscan.io/tx/',
    'base': 'https://basescan.org/tx/',
    'optimism': 'https://optimistic.etherscan.io/tx/',
    'ethereum': 'https://etherscan.io/tx/',
    'binance': 'https://bscscan.com/tx/',
    'bnb': 'https://bscscan.com/tx/',
    'avalanche': 'https://snowtrace.io/tx/',
    'fantom': 'https://ftmscan.com/tx/',
    'gnosis': 'https://gnosisscan.io/tx/',
    'scroll': 'https://scrollscan.com/tx/',
    'moonbeam': 'https://moonbeam.moonscan.io/tx/',
    'fuse': 'https://explorer.fuse.io/tx/',
    'aurora': 'https://explorer.aurora.dev/tx/'
  };
  
  const baseUrl = explorers[chain] || explorers['celo']; // Default to Celo if chain not found
  return `${baseUrl}${txHash}`;
}

/**
 * Mask wallet address for display/logging (show only first and last 4 characters)
 */
export function maskAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
} 