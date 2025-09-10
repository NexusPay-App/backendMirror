import { 
  processTransactionQueue, 
  scheduleQueueProcessing, 
  processScheduledRetries,
  clearFailedTransactionsAndRestart
} from './platformWallet';
import { recoverFailedTransactions, scheduleRecoveryScans } from './transactionRecovery';
import { getTransactionMetrics } from './transactionLogger';
import { KPLCService } from './kplcService';
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
import { redis, isRedisConnected } from '../config/redis';

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
  
  // Schedule KPLC token monitoring every 10 minutes
  const kplcMonitoringInterval = setInterval(async () => {
    try {
      await KPLCService.monitorPendingKPLCTokens();
    } catch (error) {
      logger.error('Error monitoring KPLC tokens:', error);
    }
  }, 10 * 60 * 1000); // 10 minutes
  intervals.push(kplcMonitoringInterval);
  logger.info('KPLC token monitoring scheduler started (every 10 minutes)');
  
  // Removed automatic MPESA retry scheduler
  logger.info('MPESA transactions will require manual claiming');
};

/**
 * Stop all schedulers
 */
export const stopSchedulers = () => {
  intervals.forEach(interval => clearInterval(interval));
  intervals.length = 0;
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
    
    logger.info('Immediate retry completed');
  } catch (error) {
    logger.error('Error in immediate retry:', error);
  }
}; 