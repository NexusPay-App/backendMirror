import { initializeMultiChainWallet } from '../services/platformWallet';
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

// Required environment variables
const REQUIRED_ENV_VARS = {
  // ThirdWeb Configuration
  THIRDWEB_SECRET_KEY: process.env.THIRDWEB_SECRET_KEY,
  THIRDWEB_CLIENT_ID: process.env.THIRDWEB_CLIENT_ID,
  SMART_WALLET_FACTORY_ADDRESS: process.env.SMART_WALLET_FACTORY_ADDRESS,

  // Platform Wallet Keys
  PLATFORM_WALLET_PRIMARY_KEY: process.env.PLATFORM_WALLET_PRIMARY_KEY,
  PLATFORM_WALLET_SECONDARY_KEY: process.env.PLATFORM_WALLET_SECONDARY_KEY,
  PLATFORM_WALLET_BACKUP_KEY: process.env.PLATFORM_WALLET_BACKUP_KEY,
};

// Optional environment variables with defaults
const OPTIONAL_ENV_VARS = {
  // Chain RPC URLs (will use defaults if not provided)
  ARBITRUM_RPC_URL: process.env.ARBITRUM_RPC_URL,
  POLYGON_RPC_URL: process.env.POLYGON_RPC_URL,
  BASE_RPC_URL: process.env.BASE_RPC_URL,
  OPTIMISM_RPC_URL: process.env.OPTIMISM_RPC_URL,
  CELO_RPC_URL: process.env.CELO_RPC_URL,
  SCROLL_RPC_URL: process.env.SCROLL_RPC_URL,
  FUSE_RPC_URL: process.env.FUSE_RPC_URL,
  GNOSIS_RPC_URL: process.env.GNOSIS_RPC_URL,
  AURORA_RPC_URL: process.env.AURORA_RPC_URL,

  // Redis Configuration
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  REDIS_PREFIX: process.env.REDIS_PREFIX || 'platform',

  // Feature Flags
  ENABLE_GASLESS: process.env.ENABLE_GASLESS || 'true',
  ENABLED_CHAINS: process.env.ENABLED_CHAINS || 'arbitrum,polygon,base,optimism,celo,scroll,gnosis',

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info'
};

// Chain information for logging
const CHAIN_INFO = {
  arbitrum: { name: 'Arbitrum One', chainId: 42161 },
  polygon: { name: 'Polygon', chainId: 137 },
  base: { name: 'Base', chainId: 8453 },
  optimism: { name: 'Optimism', chainId: 10 },
  celo: { name: 'Celo', chainId: 42220 },
  scroll: { name: 'Scroll', chainId: 534352 },
  gnosis: { name: 'Gnosis', chainId: 100 }
} as const;

async function main() {
  try {
    // Validate required environment variables
    const missingVars = Object.entries(REQUIRED_ENV_VARS)
      .filter(([_, value]) => !value)
      .map(([key]) => key);

    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    // Get enabled chains
    const enabledChains = OPTIONAL_ENV_VARS.ENABLED_CHAINS.split(',').map(c => c.trim());

    // Log configuration
    logger.info('🔧 Configuration:');
    logger.info('Enabled Chains:');
    for (const chain of enabledChains) {
      const info = CHAIN_INFO[chain as keyof typeof CHAIN_INFO];
      if (info) {
        logger.info(`- ${info.name} (chainId: ${info.chainId})`);
        logger.info(`  RPC: ${process.env[`${chain.toUpperCase()}_RPC_URL`] || 'Using default'}`);
      }
    }
    logger.info('Features:');
    logger.info(`- Gasless Transactions: ${OPTIONAL_ENV_VARS.ENABLE_GASLESS}`);
    logger.info('Infrastructure:');
    logger.info(`- Redis URL: ${OPTIONAL_ENV_VARS.REDIS_URL}`);
    logger.info(`- Redis Prefix: ${OPTIONAL_ENV_VARS.REDIS_PREFIX}`);
    logger.info(`- Log Level: ${OPTIONAL_ENV_VARS.LOG_LEVEL}`);

    // Get owner keys from environment
    const primaryKey = REQUIRED_ENV_VARS.PLATFORM_WALLET_PRIMARY_KEY;
    const secondaryKey = REQUIRED_ENV_VARS.PLATFORM_WALLET_SECONDARY_KEY;
    const backupKey = REQUIRED_ENV_VARS.PLATFORM_WALLET_BACKUP_KEY;

    // We can safely assert these are strings since we validated them above
    const ownerKeys = [primaryKey, secondaryKey, backupKey] as string[];

    logger.info('\n🚀 Initializing platform wallets...');

    // Initialize wallets
    const walletAddresses = await initializeMultiChainWallet(ownerKeys);

    // Log results
    logger.info('\n✅ Platform wallets initialized successfully!');
    logger.info('Wallet Addresses:');
    for (const [chain, address] of Object.entries(walletAddresses)) {
      const info = CHAIN_INFO[chain as keyof typeof CHAIN_INFO];
      if (info) {
        logger.info(`${info.name}: ${address}`);
      }
    }

    logger.info('\n🔒 Security Reminders:');
    logger.info('1. Store your private keys securely');
    logger.info('2. Keep offline backups of all three keys');
    logger.info('3. Store the backup key in a different physical location');
    logger.info('4. Never share or expose these keys');
    logger.info('5. Consider using a hardware security module (HSM) for key storage');

    logger.info('\n⚙️ Next Steps:');
    logger.info('1. Verify wallet initialization on each chain');
    logger.info('2. Test a small transaction on each chain');
    logger.info('3. Set up monitoring for wallet balances');
    logger.info('4. Configure alerts for low balances');
    logger.info('5. Document recovery procedures');

  } catch (error) {
    logger.error('❌ Error initializing wallets:', error);
    process.exit(1);
  }
}

// Run the initialization
main(); 