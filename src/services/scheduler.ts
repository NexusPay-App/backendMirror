import { retryAllFailedTransactions } from './mpesaRetry';

// Track interval IDs so they can be cleared if needed
const intervals: NodeJS.Timeout[] = [];

/**
 * Start all scheduled tasks
 */
export const startSchedulers = () => {
  console.log('🕒 Starting schedulers...');
  
  // Schedule MPESA retry every 15 minutes
  const mpesaRetryInterval = setInterval(async () => {
    try {
      await retryAllFailedTransactions();
    } catch (error) {
      console.error('❌ Error in MPESA retry scheduler:', error);
    }
  }, 15 * 60 * 1000); // 15 minutes
  
  intervals.push(mpesaRetryInterval);
  
  console.log('✅ Schedulers started successfully');
};

/**
 * Stop all scheduled tasks
 */
export const stopSchedulers = () => {
  console.log('🛑 Stopping schedulers...');
  
  intervals.forEach(interval => clearInterval(interval));
  intervals.length = 0; // Clear the array
  
  console.log('✅ All schedulers stopped');
};

/**
 * Run an immediate retry of all failed transactions 
 * Useful for manual invocation or testing
 */
export const runImmediateRetry = async () => {
  console.log('🔄 Running immediate retry of failed transactions');
  
  try {
    await retryAllFailedTransactions();
    console.log('✅ Immediate retry completed');
  } catch (error) {
    console.error('❌ Error in immediate retry:', error);
  }
}; 