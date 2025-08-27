import { sendFromPlatformWallet, getPlatformWalletBalance } from './platformWallet';
import { Chain, TokenSymbol } from '../types/token';
import config from '../config/env';
import pino from 'pino';
import Redis from 'ioredis';

// Initialize Redis client
import { redis, isRedisConnected } from '../config/redis';

// Configure logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty'
  }
});

interface MpesaPayment {
  transactionId: string;
  amount: number;
  phoneNumber: string;
  status: 'pending' | 'completed' | 'failed';
  timestamp: Date;
}

interface CryptoRelease {
  mpesaTransactionId: string;
  recipientAddress: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  retryCount: number;
  error?: string;
}

/**
 * Process crypto release after successful M-Pesa payment
 * @param payment Successful M-Pesa payment details
 * @param recipientAddress Recipient's wallet address
 */
export async function processCryptoRelease(
  payment: MpesaPayment,
  recipientAddress: string
): Promise<void> {
  try {
    // Validate M-Pesa payment status
    if (payment.status !== 'completed') {
      throw new Error(`Invalid payment status: ${payment.status}`);
    }

    // Convert KES to USDC amount (implement your conversion logic here)
    const usdcAmount = await convertKEStoUSDC(payment.amount);

    // Check platform wallet balance
    const currentBalance = await getPlatformWalletBalance();
    if (currentBalance < usdcAmount) {
      throw new Error('Insufficient platform wallet balance');
    }

    // Get owner keys from environment variables
    const primaryKey = process.env.PLATFORM_WALLET_PRIMARY_KEY;
    const secondaryKey = process.env.PLATFORM_WALLET_SECONDARY_KEY;
    
    if (!primaryKey || !secondaryKey) {
      throw new Error('Missing platform wallet owner keys');
    }

    // Create crypto release record
    const release: CryptoRelease = {
      mpesaTransactionId: payment.transactionId,
      recipientAddress,
      amount: usdcAmount,
      status: 'pending',
      retryCount: 0
    };

    // Store release record in Redis
    await redis.set(
      `crypto_release:${payment.transactionId}`,
      JSON.stringify(release)
    );

    // Initiate transfer
    const result = await sendFromPlatformWallet(
      usdcAmount,
      recipientAddress,
      primaryKey,
      secondaryKey
    );

    // Update release status
    release.status = 'completed';
    await redis.set(
      `crypto_release:${payment.transactionId}`,
      JSON.stringify(release)
    );

    logger.info(`Crypto release completed for M-Pesa transaction ${payment.transactionId}`);
    logger.info(`Transaction hash: ${result.transactionHash}`);
  } catch (err) {
    const error = err as Error;
    logger.error('Error processing crypto release:', error);

    // Update release status with error
    const release: CryptoRelease = {
      mpesaTransactionId: payment.transactionId,
      recipientAddress,
      amount: 0, // Will be set after conversion
      status: 'failed',
      retryCount: 0,
      error: error.message
    };

    await redis.set(
      `crypto_release:${payment.transactionId}`,
      JSON.stringify(release)
    );

    throw error;
  }
}

/**
 * Convert KES amount to USDC
 * @param kesAmount Amount in KES
 * @returns Equivalent amount in USDC
 */
async function convertKEStoUSDC(kesAmount: number): Promise<number> {
  // Implement your conversion logic here
  // This could involve:
  // 1. Fetching current KES/USD exchange rate
  // 2. Applying any platform fees/spreads
  // 3. Converting to the appropriate USDC decimal places
  
  // For now, using a simple mock conversion (implement proper conversion)
  const mockUsdRate = 0.0069; // 1 KES = 0.0069 USD
  return kesAmount * mockUsdRate;
} 