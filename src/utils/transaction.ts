/**
 * Utility functions for transaction processing
 */
import { TransactionStatus } from '../types/transaction';
import { Redis } from 'ioredis';
import config from '../config/env';
import pino from 'pino';

// Initialize Redis client
import { redis, isRedisConnected } from '../config/redis';

// Configure logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty'
  }
});

/**
 * Transaction status tracking constants
 */
const TRANSACTION_STATUS_PREFIX = 'tx_status:';
const STATUS_TTL = 86400; // 24 hours

/**
 * Set transaction status in Redis for real-time tracking
 * @param txId Transaction ID
 * @param status Transaction status
 * @param details Optional details about the transaction
 */
export async function setTransactionStatus(
  txId: string, 
  status: TransactionStatus, 
  details?: Record<string, any>
): Promise<void> {
  try {
    const statusData = {
      status,
      updatedAt: new Date().toISOString(),
      ...details
    };
    
    await redis.set(
      `${TRANSACTION_STATUS_PREFIX}${txId}`, 
      JSON.stringify(statusData),
      'EX',
      STATUS_TTL
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to set transaction status for ${txId}: ${errorMessage}`);
  }
}

/**
 * Get transaction status from Redis
 * @param txId Transaction ID
 * @returns Transaction status data or null if not found
 */
export async function getTransactionStatus(txId: string): Promise<{
  status: TransactionStatus;
  updatedAt: string;
  [key: string]: any;
} | null> {
  try {
    const statusData = await redis.get(`${TRANSACTION_STATUS_PREFIX}${txId}`);
    
    if (!statusData) {
      return null;
    }
    
    return JSON.parse(statusData);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to get transaction status for ${txId}: ${errorMessage}`);
    return null;
  }
}

/**
 * Generate a unique batch ID for grouping similar transactions
 * @param chainName Blockchain name
 * @param tokenType Token type
 * @returns Batch ID
 */
export function generateBatchId(chainName: string, tokenType: string): string {
  // Group by chain, token, and hour for optimal batching
  const hourTimestamp = Math.floor(Date.now() / 3600000);
  return `${chainName}:${tokenType}:${hourTimestamp}`;
}

/**
 * Check if a transaction needs to be prioritized
 * @param amount Transaction amount
 * @param chainName Blockchain name
 * @returns Priority level
 */
export function determineTransactionPriority(
  amount: number, 
  chainName: string
): 'high' | 'normal' | 'low' {
  // Prioritize large transactions
  if (amount > 100) {
    return 'high';
  }
  
  // Deprioritize very small transactions except on low-fee chains
  if (amount < 1 && !isLowFeeChain(chainName)) {
    return 'low';
  }
  
  // Default priority
  return 'normal';
}

/**
 * Check if a chain typically has low gas fees
 * @param chainName Blockchain name
 * @returns Whether the chain has low fees
 */
function isLowFeeChain(chainName: string): boolean {
  // Chains known for lower fees
  const lowFeeChains = [
    'polygon',
    'optimism',
    'arbitrum',
    'base',
    'celo'
  ];
  
  return lowFeeChains.includes(chainName.toLowerCase());
}

/**
 * Subscribe to transaction status updates
 * This function is a stub that would be implemented with WebSockets in production
 */
export function subscribeToTransactionUpdates(
  txId: string,
  callback: (status: TransactionStatus, details?: any) => void
): { unsubscribe: () => void } {
  // In a real implementation, this would set up a WebSocket subscription
  // For now, it's just a stub
  
  logger.info(`Subscription created for transaction ${txId}`);
  
  // Return unsubscribe function
  return {
    unsubscribe: () => {
      logger.info(`Unsubscribed from transaction ${txId}`);
    }
  };
} 