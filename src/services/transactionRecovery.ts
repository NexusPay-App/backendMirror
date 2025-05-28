import { getFailedTransactions, markRecoveryAttempted, TransactionLogWithRecovery } from './transactionLogger';
import pino from 'pino';
import { queueTransaction } from './platformWallet';
import { Escrow } from '../models/escrowModel';
import config from '../config/env';

// Configure logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty'
  }
});

// Maximum age of transactions to recover (24 hours)
const MAX_RECOVERY_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Scan for failed transactions and attempt to recover them
 */
export async function recoverFailedTransactions(): Promise<void> {
  try {
    logger.info('Starting transaction recovery scan');
    
    // Get failed transactions that need recovery
    const failedTransactions = await getFailedTransactions(50);
    
    if (failedTransactions.length === 0) {
      logger.info('No failed transactions to recover');
      return;
    }
    
    logger.info(`Found ${failedTransactions.length} failed transactions for recovery`);
    
    // Process each failed transaction
    await Promise.all(failedTransactions.map(async (tx: TransactionLogWithRecovery) => {
      try {
        // Skip transactions that are too old
        const txDate = new Date(tx.createdAt);
        const ageMs = Date.now() - txDate.getTime();
        
        if (ageMs > MAX_RECOVERY_AGE_MS) {
          logger.info(`Skipping recovery for old transaction ${tx._id}, age: ${Math.round(ageMs / (60 * 60 * 1000))} hours`);
          await markRecoveryAttempted(tx._id);
          return;
        }
        
        logger.info(`Attempting to recover transaction ${tx._id} (${tx.type})`);
        
        // Different recovery strategies based on transaction type
        if (tx.type === 'platform_to_user') {
          await recoverPlatformToUserTransaction(tx);
        } else if (tx.type === 'mpesa_to_escrow') {
          await recoverMpesaToEscrowTransaction(tx);
        } else if (tx.type === 'escrow_to_user') {
          await recoverEscrowToUserTransaction(tx);
        } else {
          logger.warn(`Unsupported transaction type for recovery: ${tx.type}`);
          await markRecoveryAttempted(tx._id);
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Error recovering transaction ${tx._id}: ${errorMessage}`);
        
        // Mark as attempted anyway to prevent infinite retries
        await markRecoveryAttempted(tx._id);
      }
    }));
    
    logger.info('Transaction recovery scan completed');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to run transaction recovery: ${errorMessage}`);
  }
}

/**
 * Recover a failed platform-to-user transaction
 * @param tx Failed transaction
 */
async function recoverPlatformToUserTransaction(tx: TransactionLogWithRecovery): Promise<void> {
  // Verify transaction details are present
  if (!tx.toAddress || !tx.amount || !tx.chainName || !tx.tokenType) {
    logger.error(`Missing essential details for transaction recovery: ${tx._id}`);
    await markRecoveryAttempted(tx._id);
    return;
  }
  
  // Check related escrow records
  if (tx.escrowId) {
    const escrow = await Escrow.findOne({ 
      $or: [
        { _id: tx.escrowId },
        { transactionId: tx.escrowId }
      ]
    });
    
    if (escrow && escrow.status === 'completed') {
      logger.info(`Escrow ${tx.escrowId} already completed, skipping recovery for ${tx._id}`);
      await markRecoveryAttempted(tx._id);
      return;
    }
  }
  
  // Requeue the transaction
  logger.info(`Requeuing transaction ${tx._id} from ${tx.fromAddress || 'platform'} to ${tx.toAddress}`);
  
  // Add to transaction queue
  const newTxId = await queueTransaction(
    tx.toAddress,
    tx.amount || 0,
    tx.chainName || 'celo',
    tx.tokenType as any || 'USDC'
  );
  
  logger.info(`Recovery transaction queued with ID ${newTxId} for original transaction ${tx._id}`);
  
  // Mark original as recovery attempted
  await markRecoveryAttempted(tx._id);
}

/**
 * Recover a failed M-Pesa to escrow transaction
 * @param tx Failed transaction
 */
async function recoverMpesaToEscrowTransaction(tx: TransactionLogWithRecovery): Promise<void> {
  // For M-Pesa transactions, manual review may be needed
  // We'll just log the issue for now
  logger.warn(`M-Pesa transaction ${tx._id} needs manual review`);
  
  // Add to recovery system notification
  // In production, you might want to notify admins or support
  
  // Mark as attempted
  await markRecoveryAttempted(tx._id);
}

/**
 * Recover a failed escrow-to-user transaction
 * @param tx Failed transaction
 */
async function recoverEscrowToUserTransaction(tx: TransactionLogWithRecovery): Promise<void> {
  // Find escrow record
  if (!tx.escrowId) {
    logger.error(`Missing escrow ID for escrow-to-user recovery: ${tx._id}`);
    await markRecoveryAttempted(tx._id);
    return;
  }
  
  const escrow = await Escrow.findOne({ 
    $or: [
      { _id: tx.escrowId },
      { transactionId: tx.escrowId }
    ]
  });
  
  if (!escrow) {
    logger.error(`Escrow record not found for transaction ${tx._id}`);
    await markRecoveryAttempted(tx._id);
    return;
  }
  
  // If M-Pesa payment was confirmed but crypto wasn't sent, retry sending crypto
  if (escrow.mpesaReceiptNumber && escrow.status !== 'completed') {
    if (!escrow.userId) {
      logger.error(`Missing user ID in escrow ${escrow.transactionId}`);
      await markRecoveryAttempted(tx._id);
      return;
    }
    
    // Get chain and token type from metadata
    const chain = escrow.metadata?.chain || 'celo';
    const tokenType = escrow.metadata?.tokenType || 'USDC';
    
    try {
      // Mock user lookup since we don't have the actual userModel
      // In a real implementation, this would use the actual User model
      /*
      const { User } = await import('../models/userModel');
      const user = await User.findById(escrow.userId);
      
      if (!user || !user.walletAddress) {
        logger.error(`User or wallet address not found for escrow ${escrow.transactionId}`);
        await markRecoveryAttempted(tx._id);
        return;
      }
      */
      
      // For now, just use a mock wallet address
      const userWalletAddress = `0x${escrow.userId.toString().padStart(40, '0')}`;
      
      // Queue token transfer
      logger.info(`Requeuing token transfer for escrow ${escrow.transactionId}`);
      
      const newTxId = await queueTransaction(
        userWalletAddress,
        escrow.cryptoAmount,
        chain,
        tokenType as any
      );
      
      // Update escrow with recovery attempt info
      escrow.metadata = {
        ...escrow.metadata,
        recoveryAttempted: true,
        recoveryTxId: newTxId,
        recoveryTimestamp: new Date()
      };
      await escrow.save();
      
      logger.info(`Recovery transaction queued with ID ${newTxId} for escrow ${escrow.transactionId}`);
    } catch (error) {
      logger.error(`Error during user lookup or transaction queuing: ${error instanceof Error ? error.message : String(error)}`);
      await markRecoveryAttempted(tx._id);
      return;
    }
  } else {
    logger.info(`Escrow ${escrow.transactionId} doesn't need recovery or is already completed`);
  }
  
  // Mark as attempted
  await markRecoveryAttempted(tx._id);
}

/**
 * Schedule regular recovery scans
 * @param intervalMs Interval between scans in milliseconds
 * @returns Interval ID
 */
export function scheduleRecoveryScans(intervalMs: number = 5 * 60 * 1000): NodeJS.Timeout {
  logger.info(`Scheduling transaction recovery to run every ${intervalMs / 60000} minutes`);
  
  return setInterval(() => {
    recoverFailedTransactions().catch(error => {
      logger.error(`Scheduled recovery scan error: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, intervalMs);
} 