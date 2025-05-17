import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { getPlatformWalletStatus } from '../services/platformWallet';
import config from '../config/env';
import { Chain, TokenSymbol } from '../types/token';
import { getTokenConfig } from '../config/tokens';
import { getAllTokenTransferEvents } from '../services/token';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Main function to check platform wallet details
 */
async function checkPlatformWallets() {
  console.log('\n📊 PLATFORM WALLET STATUS CHECK');
  console.log('===============================');
  
  // Get a list of all supported chains
  const supportedChains = getSupportedChains();
  console.log(`\n🔗 Supported Chains (${supportedChains.length}):`);
  supportedChains.forEach(chain => {
    const chainConfig = config[chain];
    console.log(`- ${chain}: Chain ID ${chainConfig?.chainId || 'Unknown'}`);
  });
  
  // Get all supported tokens
  const supportedTokens = getSupportedTokens();
  console.log(`\n💰 Supported Tokens (${supportedTokens.length}):`);
  supportedTokens.forEach(token => {
    console.log(`- ${token}`);
  });
  
  // Check balances for each chain
  console.log('\n💼 Platform Wallet Balances:');
  
  for (const chain of supportedChains) {
    try {
      console.log(`\n📌 Chain: ${chain.toUpperCase()}`);
      const walletStatus = await getPlatformWalletStatus(chain);
      
      // Determine token type and decimals for this chain
      const tokenType = getTokenTypeForChain(chain);
      const tokenDecimals = getTokenDecimals(chain, tokenType);
      
      // Convert raw balance to human-readable format
      const mainBalanceFormatted = formatTokenAmount(walletStatus.main.balance, tokenDecimals);
      const feesBalanceFormatted = formatTokenAmount(walletStatus.fees.balance, tokenDecimals);
      
      // Show main wallet details
      console.log(`\n   Main Wallet:`);
      console.log(`   - Address: ${walletStatus.main.address}`);
      console.log(`   - Balance: ${mainBalanceFormatted} ${tokenType} (~$${mainBalanceFormatted} USD)`);
      
      // If there's a balance, get the latest transaction
      if (walletStatus.main.balance > 0) {
        try {
          const txEvents = await getAllTokenTransferEvents(chain as Chain, walletStatus.main.address);
          if (txEvents && txEvents.length > 0) {
            const latestTx = txEvents[0];
            console.log(`   - Latest TX: ${latestTx.hash}`);
            console.log(`   - TX Explorer: ${generateExplorerUrl(chain, latestTx.hash)}`);
            console.log(`   - Timestamp: ${new Date(parseInt(latestTx.timeStamp) * 1000).toISOString()}`);
          } else {
            console.log(`   - No transaction history found`);
          }
        } catch (txError: any) {
          console.log(`   - Error fetching TX history: ${txError.message || String(txError)}`);
        }
      }
      
      // Show fees wallet details
      console.log(`\n   Fees Wallet:`);
      console.log(`   - Address: ${walletStatus.fees.address}`);
      console.log(`   - Balance: ${feesBalanceFormatted} ${tokenType} (~$${feesBalanceFormatted} USD)`);
      
      // If there's a balance, get the latest transaction
      if (walletStatus.fees.balance > 0) {
        try {
          const txEvents = await getAllTokenTransferEvents(chain as Chain, walletStatus.fees.address);
          if (txEvents && txEvents.length > 0) {
            const latestTx = txEvents[0];
            console.log(`   - Latest TX: ${latestTx.hash}`);
            console.log(`   - TX Explorer: ${generateExplorerUrl(chain, latestTx.hash)}`);
            console.log(`   - Timestamp: ${new Date(parseInt(latestTx.timeStamp) * 1000).toISOString()}`);
          } else {
            console.log(`   - No transaction history found`);
          }
        } catch (txError: any) {
          console.log(`   - Error fetching TX history: ${txError.message || String(txError)}`);
        }
      }
    } catch (error: any) {
      console.log(`❌ Error checking ${chain}: ${error.message || String(error)}`);
    }
  }
}

/**
 * Format token amount with proper decimals for display
 */
function formatTokenAmount(rawAmount: number, decimals: number): string {
  const formattedAmount = rawAmount / Math.pow(10, decimals);
  return formattedAmount.toFixed(decimals > 2 ? 2 : decimals); // Limit decimal places for readability
}

/**
 * Get token decimals for a specific chain and token
 */
function getTokenDecimals(chain: string, tokenType: string): number {
  // Most common stable tokens use 6 decimals
  if (tokenType === 'USDC' || tokenType === 'USDT') {
    return 6;
  }
  
  // DAI uses 18 decimals
  if (tokenType === 'DAI') {
    return 18;
  }
  
  // WBTC uses 8 decimals
  if (tokenType === 'WBTC') {
    return 8;
  }
  
  // Default to 18 decimals for most tokens (ETH standard)
  return 18;
}

/**
 * Determine the token type for a specific chain
 */
function getTokenTypeForChain(chain: string): string {
  // Get token address from config
  const tokenAddress = config[chain]?.tokenAddress;
  if (!tokenAddress) return 'Unknown';
  
  // Look up token type based on address (simplified version)
  // In a real implementation, this would be more comprehensive
  if (chain === 'celo') {
    // Celo stable tokens
    if (tokenAddress === '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e') {
      return 'USDT'; // This is actually USDT on Celo
    }
  }
  
  // Default to USDC as fallback
  return 'USDC';
}

/**
 * Get a list of all supported chains
 */
function getSupportedChains(): string[] {
  const chains: string[] = [];
  
  for (const key in config) {
    if (typeof config[key] === 'object' && config[key]?.chainId && config[key]?.tokenAddress) {
      chains.push(key);
    }
  }
  
  return chains;
}

/**
 * Get a list of all supported tokens
 */
function getSupportedTokens(): TokenSymbol[] {
  return ['USDC', 'USDT', 'DAI', 'WBTC', 'WETH', 'MATIC', 'ARB', 'BNB'];
}

/**
 * Generate blockchain explorer URL
 */
function generateExplorerUrl(chain: string, txHash: string): string {
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

// Handle promise rejections
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
  process.exit(1);
});

// Run the script
checkPlatformWallets()
  .then(() => {
    console.log('\n✅ Platform wallet check completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error checking platform wallets:', error);
    process.exit(1);
  }); 