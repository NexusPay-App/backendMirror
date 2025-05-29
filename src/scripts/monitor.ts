import { getPlatformWalletBalance, processTransactionQueue, processScheduledRetries, clearDuplicateTransactions } from '../services/platformWallet';
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
  arbitrum: { name: 'Arbitrum One', chainId: 42161, symbol: 'USDC', minBalance: 1000 },
  polygon: { name: 'Polygon', chainId: 137, symbol: 'USDC', minBalance: 1000 },
  base: { name: 'Base', chainId: 8453, symbol: 'USDC', minBalance: 1000 },
  optimism: { name: 'Optimism', chainId: 10, symbol: 'USDC', minBalance: 1000 },
  celo: { name: 'Celo', chainId: 42220, symbol: 'cUSD', minBalance: 1000 },
  scroll: { name: 'Scroll', chainId: 534352, symbol: 'USDC', minBalance: 1000 },
  fuse: { name: 'Fuse', chainId: 122, symbol: 'USDC', minBalance: 1000 },
  gnosis: { name: 'Gnosis', chainId: 100, symbol: 'USDC', minBalance: 1000 },
  aurora: { name: 'Aurora', chainId: 1313161554, symbol: 'USDC', minBalance: 1000 }
};

// Monitoring intervals (in milliseconds)
const INTERVALS = {
  BALANCE_CHECK: 5 * 60 * 1000, // 5 minutes
  QUEUE_PROCESS: 30 * 1000, // 30 seconds
  RETRY_PROCESS: 60 * 1000, // 1 minute
  CLEANUP: 15 * 60 * 1000 // 15 minutes
};

async function checkBalances() {
  try {
    // Get enabled chains from environment
    const enabledChains = (process.env.ENABLED_CHAINS || 'arbitrum,polygon,base,optimism,celo,scroll,fuse,gnosis,aurora')
      .split(',')
      .map(c => c.trim());

    logger.info('🔍 Checking balances...');

    // Check balance on each chain
    for (const chain of enabledChains) {
      const info = CHAIN_INFO[chain as keyof typeof CHAIN_INFO];
      if (!info) {
        logger.warn(`⚠️ Unknown chain: ${chain}`);
        continue;
      }

      try {
        const balance = await getPlatformWalletBalance(chain, info.symbol as any);

        // Format balance
        const formattedBalance = new Intl.NumberFormat('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(balance);

        // Log balance with appropriate emoji based on level
        const emoji = balance < info.minBalance ? '⚠️' : '✅';
        logger.info(`${emoji} ${info.name}: ${formattedBalance} ${info.symbol}`);

        // Alert if balance is low
        if (balance < info.minBalance) {
          logger.warn(`Low balance warning on ${info.name}! Current: ${formattedBalance} ${info.symbol}, Minimum: ${info.minBalance}`);
          // TODO: Implement alert notification system (email, Slack, etc.)
        }
      } catch (error) {
        logger.error(`❌ Error checking balance on ${info.name}:`, error);
      }
    }
  } catch (error) {
    logger.error('Error in balance check:', error);
  }
}

async function processQueue() {
  try {
    logger.info('🔄 Processing transaction queue...');
    await processTransactionQueue();
  } catch (error) {
    logger.error('Error processing transaction queue:', error);
  }
}

async function processRetries() {
  try {
    logger.info('🔄 Processing scheduled retries...');
    await processScheduledRetries();
  } catch (error) {
    logger.error('Error processing retries:', error);
  }
}

async function cleanup() {
  try {
    logger.info('🧹 Running cleanup tasks...');
    const clearedCount = await clearDuplicateTransactions();
    if (clearedCount > 0) {
      logger.info(`Cleared ${clearedCount} duplicate transactions`);
    }
  } catch (error) {
    logger.error('Error in cleanup:', error);
  }
}

function startMonitoring() {
  logger.info('🚀 Starting platform wallet monitoring...');

  // Initial runs
  checkBalances();
  processQueue();
  processRetries();
  cleanup();

  // Set up intervals
  const balanceInterval = setInterval(checkBalances, INTERVALS.BALANCE_CHECK);
  const queueInterval = setInterval(processQueue, INTERVALS.QUEUE_PROCESS);
  const retryInterval = setInterval(processRetries, INTERVALS.RETRY_PROCESS);
  const cleanupInterval = setInterval(cleanup, INTERVALS.CLEANUP);

  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM. Shutting down...');
    clearInterval(balanceInterval);
    clearInterval(queueInterval);
    clearInterval(retryInterval);
    clearInterval(cleanupInterval);
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('Received SIGINT. Shutting down...');
    clearInterval(balanceInterval);
    clearInterval(queueInterval);
    clearInterval(retryInterval);
    clearInterval(cleanupInterval);
    process.exit(0);
  });

  // Log monitoring status
  logger.info('Monitoring active with intervals:');
  logger.info(`- Balance checks: ${INTERVALS.BALANCE_CHECK / 1000}s`);
  logger.info(`- Queue processing: ${INTERVALS.QUEUE_PROCESS / 1000}s`);
  logger.info(`- Retry processing: ${INTERVALS.RETRY_PROCESS / 1000}s`);
  logger.info(`- Cleanup: ${INTERVALS.CLEANUP / 1000}s`);
}

// Start monitoring
startMonitoring(); 