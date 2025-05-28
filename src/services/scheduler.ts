import { retryAllFailedTransactions } from './mpesaRetry';
import { 
  processTransactionQueue, 
  scheduleQueueProcessing, 
  processScheduledRetries,
  clearFailedTransactionsAndRestart
} from './platformWallet';
import { recoverFailedTransactions, scheduleRecoveryScans } from './transactionRecovery';
import { getTransactionMetrics } from './transactionLogger';
import pino from 'pino';
import { Redis } from 'ioredis';
import config from '../config/env';

// Configure logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty'
  }
});

// Connect to Redis for monitoring
const redis = new Redis(config.REDIS_URL);

// Track interval IDs so they can be cleared if needed
const intervals: NodeJS.Timeout[] = [];

/**
 * Start all scheduled tasks
 */
export const startSchedulers = async () => {
  logger.info('Starting schedulers...');
  
  // Clear any failed transactions from previous runs
  try {
    await clearFailedTransactionsAndRestart();
  } catch (error) {
    logger.error('Error clearing failed transactions on startup:', error);
  }
  
  // Process transaction queue immediately
  try {
    await processTransactionQueue();
  } catch (error) {
    logger.error('Error processing transaction queue on startup:', error);
  }
  
  // Schedule transaction queue processing with optimized setup
  const queueTimers = scheduleQueueProcessing(30 * 1000); // 30 seconds
  queueTimers.forEach((timer: NodeJS.Timeout) => intervals.push(timer as NodeJS.Timeout));
  logger.info('Transaction queue processor scheduled (every 30 seconds)');
  
  // Also schedule explicit retry processing for resilience
  const retryInterval = setInterval(async () => {
    try {
      await processScheduledRetries();
    } catch (error) {
      logger.error('Error processing scheduled retries:', error);
    }
  }, 15 * 1000); // 15 seconds
  intervals.push(retryInterval);
  
  // Schedule transaction recovery every 5 minutes
  const recoveryInterval = scheduleRecoveryScans(5 * 60 * 1000); // 5 minutes
  intervals.push(recoveryInterval);
  logger.info('Transaction recovery scheduler started (every 5 minutes)');
  
  // Schedule MPESA retry every 15 minutes
  const mpesaRetryInterval = setInterval(async () => {
    try {
      await retryAllFailedTransactions();
    } catch (error) {
      logger.error('Error in MPESA retry scheduler:', error);
    }
  }, 15 * 60 * 1000); // 15 minutes
  intervals.push(mpesaRetryInterval);
  logger.info('MPESA retry scheduler started (every 15 minutes)');
  
  // Schedule metrics collection and monitoring every 5 minutes
  const metricsInterval = setInterval(async () => {
    try {
      // Get transaction metrics for the last hour
      const hourlyMetrics = await getTransactionMetrics(60 * 60 * 1000); // 1 hour
      
      // Log metrics summary
      logger.info({
        msg: 'Transaction metrics (1 hour)',
        ...hourlyMetrics
      });
      
      // Alert on high failure rate
      if (hourlyMetrics.totalCount > 10 && hourlyMetrics.failureRate > 10) {
        logger.warn({
          msg: '⚠️ High transaction failure rate detected',
          failureRate: hourlyMetrics.failureRate,
          failureCount: hourlyMetrics.failureCount,
          totalCount: hourlyMetrics.totalCount
        });
      }
      
      // Alert on slow transactions
      if (hourlyMetrics.slowTransactionsRate > 15) {
        logger.warn({
          msg: '⚠️ High rate of slow transactions detected',
          slowRate: hourlyMetrics.slowTransactionsRate,
          slowCount: hourlyMetrics.slowTransactionsCount,
          avgTime: hourlyMetrics.avgExecutionTimeMs
        });
      }
      
      // Monitor queue sizes for each priority
      try {
        const [highPriorityCount, normalPriorityCount, lowPriorityCount, legacyCount, retryCount] = await Promise.all([
          redis.llen('tx_queue:high'),
          redis.llen('tx_queue:normal'),
          redis.llen('tx_queue:low'),
          redis.llen('tx_queue'),
          redis.zcard('tx_retry_schedule')
        ]);
        
        logger.info({
          msg: 'Transaction queue status',
          high: highPriorityCount,
          normal: normalPriorityCount,
          low: lowPriorityCount,
          legacy: legacyCount,
          retries: retryCount,
          total: highPriorityCount + normalPriorityCount + lowPriorityCount + legacyCount + retryCount
        });
        
        // Alert if queues are growing too large
        const totalQueueSize = highPriorityCount + normalPriorityCount + lowPriorityCount + legacyCount;
        if (totalQueueSize > 100) {
          logger.warn({
            msg: '⚠️ Large transaction queue detected',
            queueSize: totalQueueSize,
            retries: retryCount
          });
          
          // If queue is large, trigger immediate processing
          processTransactionQueue().catch((error: Error) => {
            logger.error('Error in force-triggered queue processing:', error);
          });
        }
      } catch (error) {
        logger.error('Error monitoring queue sizes:', error);
      }
    } catch (error) {
      logger.error('Error in metrics collection scheduler:', error);
    }
  }, 5 * 60 * 1000); // 5 minutes
  intervals.push(metricsInterval);
  logger.info('Metrics collection scheduler started (every 5 minutes)');
  
  logger.info('All schedulers started successfully');
};

/**
 * Stop all scheduled tasks
 */
export const stopSchedulers = () => {
  logger.info('Stopping schedulers...');
  
  intervals.forEach(interval => clearInterval(interval));
  intervals.length = 0; // Clear the array
  
  logger.info('All schedulers stopped');
};

/**
 * Run an immediate retry of all failed transactions 
 * Useful for manual invocation or testing
 */
export const runImmediateRetry = async () => {
  logger.info('Running immediate retry of failed transactions');
  
  try {
    // Process scheduled retries first
    await processScheduledRetries();
    
    // Process main transaction queue
    await processTransactionQueue();
    
    // Recover failed transactions
    await recoverFailedTransactions();
    
    // Retry MPESA transactions
    await retryAllFailedTransactions();
    
    logger.info('Immediate retry completed');
  } catch (error) {
    logger.error('Error in immediate retry:', error);
  }
}; 