import { sendFromPlatformWallet } from '../services/platformWallet';
import dotenv from 'dotenv';
import pino from 'pino';

// Configure logger with modified settings for better output formatting
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      levelFirst: true,
      translateTime: true,
      ignore: 'pid,hostname',
      messageFormat: '{msg}',
      singleLine: true
    }
  }
});

// Load environment variables
dotenv.config();

async function main() {
  try {
    // Test recipient address
    const testRecipient = '0xbc914553e01d07c2fc3de802dcf5f35c4b888dee';
    const amount = 0.1; // Test with 0.1 USDC
    
    // Get owner keys from environment
    const primaryKey = process.env.PLATFORM_WALLET_PRIMARY_KEY;
    const secondaryKey = process.env.PLATFORM_WALLET_SECONDARY_KEY;

    if (!primaryKey || !secondaryKey) {
      throw new Error('Missing platform wallet keys. Please set PLATFORM_WALLET_PRIMARY_KEY and PLATFORM_WALLET_SECONDARY_KEY in .env');
    }

    logger.info('\n🚀 Testing platform wallet transfer...');
    logger.info(`Sending ${amount} USDC to ${testRecipient} on Arbitrum\n`);

    const result = await sendFromPlatformWallet(
      amount,
      testRecipient,
      primaryKey,
      secondaryKey,
      'arbitrum',
      'USDC'
    );

    // Log results with better formatting
    logger.info('\n✅ Transfer successful!\n');
    logger.info('Transaction Details:');
    logger.info('-----------------');
    logger.info(`Hash: ${result.transactionHash}`);
    logger.info(`\nExplorer URL:`);
    logger.info(`${generateExplorerUrl(result.transactionHash)}\n`);

  } catch (error: any) {
    logger.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Helper function to generate explorer URL
function generateExplorerUrl(txHash: string): string {
  return `https://arbiscan.io/tx/${txHash}`;
}

main(); 