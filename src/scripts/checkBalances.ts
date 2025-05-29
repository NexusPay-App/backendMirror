import { getPlatformWalletBalance } from '../services/platformWallet';
import dotenv from 'dotenv';
import pino from 'pino';

// Configure logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty'
  }
});

// Load environment variables
dotenv.config();

// Chain information
const CHAIN_INFO = {
  arbitrum: { name: 'Arbitrum One', chainId: 42161, symbol: 'USDC' },
  polygon: { name: 'Polygon', chainId: 137, symbol: 'USDC' },
  base: { name: 'Base', chainId: 8453, symbol: 'USDC' },
  optimism: { name: 'Optimism', chainId: 10, symbol: 'USDC' },
  celo: { name: 'Celo', chainId: 42220, symbol: 'cUSD' },
  scroll: { name: 'Scroll', chainId: 534352, symbol: 'USDC' },
  fuse: { name: 'Fuse', chainId: 122, symbol: 'USDC' },
  gnosis: { name: 'Gnosis', chainId: 100, symbol: 'USDC' },
  aurora: { name: 'Aurora', chainId: 1313161554, symbol: 'USDC' }
};

async function main() {
  try {
    // Get enabled chains from environment
    const enabledChains = (process.env.ENABLED_CHAINS || 'arbitrum,polygon,base,optimism,celo,scroll,fuse,gnosis,aurora')
      .split(',')
      .map(c => c.trim());

    logger.info('🔍 Checking platform wallet balances...\n');

    // Track total balance across all chains
    let totalBalanceUSD = 0;

    // Check balance on each chain
    for (const chain of enabledChains) {
      const info = CHAIN_INFO[chain as keyof typeof CHAIN_INFO];
      if (!info) {
        logger.warn(`⚠️ Unknown chain: ${chain}`);
        continue;
      }

      try {
        const balance = await getPlatformWalletBalance(chain, info.symbol as any);
        totalBalanceUSD += balance;

        // Format balance with commas and fixed decimal places
        const formattedBalance = new Intl.NumberFormat('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(balance);

        logger.info(`${info.name}:`);
        logger.info(`- Balance: ${formattedBalance} ${info.symbol}`);
        logger.info(`- Chain ID: ${info.chainId}`);
        logger.info(`- RPC: ${process.env[`${chain.toUpperCase()}_RPC_URL`] || 'Using default'}\n`);
      } catch (error) {
        logger.error(`❌ Error checking balance on ${info.name}:`, error);
      }
    }

    // Format total balance
    const formattedTotal = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(totalBalanceUSD);

    logger.info('📊 Summary:');
    logger.info(`Total Balance: $${formattedTotal} USD`);
    logger.info(`Chains Checked: ${enabledChains.length}`);

    // Add warnings if any balances are low
    if (totalBalanceUSD < 1000) {
      logger.warn('\n⚠️ Warning: Total balance is below $1,000 USD');
    }

    // Provide recommendations
    logger.info('\n💡 Recommendations:');
    if (totalBalanceUSD < 1000) {
      logger.info('- Consider adding more funds to maintain adequate liquidity');
    }
    logger.info('- Monitor gas prices on each chain for optimal transaction timing');
    logger.info('- Set up automated balance alerts');
    logger.info('- Review transaction history for any anomalies');

  } catch (error) {
    logger.error('❌ Error checking balances:', error);
    process.exit(1);
  }
}

// Run the balance check
main(); 