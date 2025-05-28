import { logger } from '../config/logger';

interface ReconciliationLogData {
    transactionId: string;
    userId: string;
    type: string;
    status: string;
    fiatAmount?: number;
    cryptoAmount?: number;
    tokenType?: string;
    chain?: string;
    mpesaReceiptNumber?: string;
    cryptoTransactionHash?: string;
    queuedTxId?: string;
    error?: string;
    errorCode?: string;
    needsManualReview?: boolean;
    timestamp?: string;
}

/**
 * Log transaction data for reconciliation and auditing purposes
 */
export const logTransactionForReconciliation = (data: ReconciliationLogData): void => {
    try {
        // Add timestamp if not provided
        if (!data.timestamp) {
            data.timestamp = new Date().toISOString();
        }
        
        // Log in a structured format for easy querying
        logger.info({
            event: 'transaction_reconciliation',
            ...data
        });
        
        // For critical errors or manual review cases, log with more visibility
        if (data.needsManualReview || data.error) {
            console.log('\n📊 TRANSACTION NEEDS REVIEW');
            console.log(`- ID: ${data.transactionId}`);
            console.log(`- Type: ${data.type}`);
            console.log(`- Status: ${data.status}`);
            if (data.fiatAmount) console.log(`- Fiat Amount: ${data.fiatAmount} KES`);
            if (data.cryptoAmount) console.log(`- Crypto Amount: ${data.cryptoAmount} ${data.tokenType}`);
            if (data.error) console.log(`- Error: ${data.error}`);
            if (data.errorCode) console.log(`- Error Code: ${data.errorCode}`);
            console.log('');
        }
    } catch (error) {
        // Ensure reconciliation logging never throws errors
        console.error('Error logging transaction for reconciliation:', error);
    }
}; 