import { randomUUID } from 'crypto';
import { addToTransactionQueue } from './redis';
import { logger } from '../config/logger';
import { TokenSymbol } from '../types/token';

/**
 * Queue a transaction for processing
 * @param recipientAddress The wallet address to send tokens to
 * @param amount The amount of tokens to send
 * @param chain The blockchain network to use
 * @param tokenType The type of token to send
 * @param priority Optional priority level (default: normal)
 * @returns Transaction ID that can be used to track the transaction
 */
export const queueTransaction = async (
    recipientAddress: string, 
    amount: number, 
    chain: string, 
    tokenType: TokenSymbol,
    priority: 'high' | 'normal' | 'low' = 'normal'
): Promise<string> => {
    // Generate a unique transaction ID
    const txId = randomUUID();
    
    try {
        // Log the transaction details
        logger.info(`Queueing transaction ${txId} (${priority} priority)`, {
            txId,
            recipientAddress,
            amount,
            chain,
            tokenType,
            priority,
            timestamp: new Date().toISOString()
        });
        
        // Store transaction data in database
        // This part depends on your database structure, but typically you'd
        // create a record in a "transactions" or "pendingTransactions" collection
        
        // Add to processing queue based on priority
        await addToTransactionQueue(txId, priority);
        
        return txId;
    } catch (error) {
        logger.error(`Failed to queue transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw new Error(`Failed to queue transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
};

/**
 * Record a transaction for auditing and reconciliation
 */
export const recordTransaction = async (data: {
    type: string;
    txId: string;
    status: string;
    executionTimeMs: number;
    escrowId: string;
    userId: string;
    amount: number;
    mpesaReceiptNumber?: string;
}) => {
    try {
        // Log transaction for auditing
        logger.info({
            event: 'transaction_record',
            ...data,
            timestamp: new Date().toISOString()
        });
        
        // You could also store this in a database collection for analytics
        return true;
    } catch (error) {
        logger.error(`Failed to record transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return false;
    }
}; 