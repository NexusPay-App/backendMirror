import pino from 'pino';

// Configure logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty'
  }
});

// Define transaction types
export enum TransactionType {
  PLATFORM_TO_USER = 'platform_to_user',
  USER_TO_PLATFORM = 'user_to_platform',
  USER_TO_EXTERNAL = 'user_to_external',
  EXTERNAL_TO_USER = 'external_to_user',
  MPESA_TO_ESCROW = 'mpesa_to_escrow',
  ESCROW_TO_USER = 'escrow_to_user'
}

/**
 * Interface for transaction log entries
 */
export interface TransactionLogEntry {
  type: TransactionType | string;
  txId?: string;
  txHash?: string;
  status: string;
  fromAddress?: string;
  toAddress?: string;
  amount?: number;
  tokenType?: string;
  chainName?: string;
  executionTimeMs?: number;
  error?: string;
  escrowId?: string;
  userId?: string;
  mpesaReceiptNumber?: string;
  metadata?: Record<string, any>;
}

/**
 * Interface for transaction log with recovery fields
 */
export interface TransactionLogWithRecovery extends TransactionLogEntry {
  _id: string;
  createdAt: Date;
  recoveryAttempted?: boolean;
  recoveryTimestamp?: Date;
}

/**
 * Record a transaction in the transaction log
 * @param transaction The transaction details to record
 */
export async function recordTransaction(transaction: TransactionLogEntry): Promise<void> {
  try {
    // For now, just log the transaction to console
    logger.info('[Transaction Logger] Recording transaction:', {
      ...transaction,
      createdAt: new Date()
    });
    
    // In a real implementation, this would store to a database
    // For example:
    // const log = new TransactionLogModel({
    //   ...transaction,
    //   createdAt: new Date()
    // });
    // await log.save();
  } catch (error) {
    logger.error('Failed to record transaction:', error);
  }
}

/**
 * Get transaction metrics for a specific time period
 * @param timeRangeMs Time range in milliseconds to analyze
 * @returns Transaction metrics for the specified time period
 */
export async function getTransactionMetrics(timeRangeMs: number = 24 * 60 * 60 * 1000): Promise<{
  totalCount: number;
  successCount: number;
  failureCount: number;
  failureRate: number;
  avgExecutionTimeMs: number;
  slowTransactionsCount: number;
  slowTransactionsRate: number;
  medianExecutionTimeMs: number;
}> {
  try {
    // For now, we'll return some mock data since we don't have actual transaction logs
    // In a production environment, this would query from a database
    
    // Mock data for demonstration
    const totalCount = 100;
    const successCount = 92;
    const failureCount = 8;
    const failureRate = (failureCount / totalCount) * 100;
    const avgExecutionTimeMs = 2500;
    const slowTransactionsCount = 5;
    const slowTransactionsRate = (slowTransactionsCount / totalCount) * 100;
    const medianExecutionTimeMs = 2100;
    
    return {
      totalCount,
      successCount,
      failureCount,
      failureRate,
      avgExecutionTimeMs,
      slowTransactionsCount,
      slowTransactionsRate,
      medianExecutionTimeMs
    };
    
    // In production, this would look more like:
    /*
    const startTime = new Date(Date.now() - timeRangeMs);
    
    const metrics = await TransactionLogModel.aggregate([
      { $match: { createdAt: { $gte: startTime } } },
      { $group: {
        _id: null,
        totalCount: { $sum: 1 },
        successCount: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
        failureCount: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
        totalExecutionTime: { $sum: "$executionTimeMs" },
        executionTimes: { $push: "$executionTimeMs" }
      }}
    ]);
    
    if (!metrics.length) {
      return {
        totalCount: 0,
        successCount: 0,
        failureCount: 0,
        failureRate: 0,
        avgExecutionTimeMs: 0,
        slowTransactionsCount: 0,
        slowTransactionsRate: 0,
        medianExecutionTimeMs: 0
      };
    }
    
    const result = metrics[0];
    const executionTimes = result.executionTimes.filter(t => t !== null && t > 0);
    executionTimes.sort((a, b) => a - b);
    
    const avgExecutionTimeMs = result.totalCount > 0 
      ? result.totalExecutionTime / result.totalCount 
      : 0;
    
    const medianExecutionTimeMs = executionTimes.length > 0
      ? executionTimes[Math.floor(executionTimes.length / 2)]
      : 0;
    
    // Define slow transaction as taking more than 5 seconds
    const slowThresholdMs = 5000;
    const slowTransactionsCount = executionTimes.filter(t => t > slowThresholdMs).length;
    
    return {
      totalCount: result.totalCount,
      successCount: result.successCount,
      failureCount: result.failureCount,
      failureRate: result.totalCount > 0 ? (result.failureCount / result.totalCount) * 100 : 0,
      avgExecutionTimeMs,
      slowTransactionsCount,
      slowTransactionsRate: result.totalCount > 0 ? (slowTransactionsCount / result.totalCount) * 100 : 0,
      medianExecutionTimeMs
    };
    */
  } catch (error) {
    logger.error('Error getting transaction metrics:', error);
    
    // Return default values on error
    return {
      totalCount: 0,
      successCount: 0,
      failureCount: 0,
      failureRate: 0,
      avgExecutionTimeMs: 0,
      slowTransactionsCount: 0,
      slowTransactionsRate: 0,
      medianExecutionTimeMs: 0
    };
  }
}

/**
 * Get failed transactions for recovery
 * @param limit Maximum number of transactions to return
 * @returns Array of failed transactions
 */
export async function getFailedTransactions(limit: number = 50): Promise<TransactionLogWithRecovery[]> {
  try {
    // In a real implementation, this would query from a database
    // For mock purposes, we'll return an empty array
    logger.info(`Getting up to ${limit} failed transactions for recovery`);
    
    // Mock implementation - would be replaced with actual DB query in production
    // For example:
    /*
    return await TransactionLogModel.find({
      status: 'failed',
      recoveryAttempted: { $ne: true },
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }).limit(limit).sort({ createdAt: -1 });
    */
    
    return [];
  } catch (error) {
    logger.error('Error getting failed transactions:', error);
    return [];
  }
}

/**
 * Mark a transaction as having been attempted for recovery
 * @param transactionId The ID of the transaction to mark
 */
export async function markRecoveryAttempted(transactionId: string): Promise<void> {
  try {
    logger.info(`Marking transaction ${transactionId} as recovery attempted`);
    
    // In a real implementation, this would update a database record
    // For example:
    /*
    await TransactionLogModel.findByIdAndUpdate(
      transactionId,
      {
        recoveryAttempted: true,
        recoveryTimestamp: new Date()
      }
    );
    */
  } catch (error) {
    logger.error(`Error marking recovery attempted for transaction ${transactionId}:`, error);
  }
} 