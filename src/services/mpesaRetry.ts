import { Escrow } from '../models/escrowModel';
import { User } from '../models/models';
import { initiateB2C, initiateSTKPush } from './mpesa';
import { retryOperation } from './utils';
import config from '../config/env';
import { sendToken } from './token';

/**
 * Retry failed MPESA deposits
 * @param minutes Only retry transactions that are less than this many minutes old
 * @returns Number of transactions successfully retried
 */
export const retryFailedDeposits = async (minutes: number = 60): Promise<number> => {
  console.log('🔄 Checking for failed deposits to retry...');
  
  try {
    // Find failed deposit transactions that are less than X minutes old
    const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
    
    const failedTransactions = await Escrow.find({
      type: 'fiat_to_crypto',
      status: 'failed',
      createdAt: { $gt: cutoffTime },
      retryCount: { $lt: 3 } // Maximum 3 retry attempts
    });
    
    console.log(`Found ${failedTransactions.length} failed deposits to retry`);
    
    let successCount = 0;
    
    for (const transaction of failedTransactions) {
      try {
        // Get user information
        const user = await User.findById(transaction.userId);
        if (!user) {
          console.error(`User not found for transaction ${transaction.transactionId}`);
          continue;
        }
        
        // Get phone number from transaction or user
        const phone = user.phoneNumber;
        if (!phone) {
          console.error(`Phone number not found for transaction ${transaction.transactionId}`);
          continue;
        }
        
        // Increment retry count
        transaction.retryCount = (transaction.retryCount || 0) + 1;
        await transaction.save();
        
        // Retry STK push
        const mpesaResponse = await retryOperation(async () => {
          return initiateSTKPush(
            phone,
            config.MPESA_SHORTCODE!,
            transaction.amount,
            `NexusPay Retry ${transaction.retryCount}`,
            user._id.toString()
          );
        });
        
        if (mpesaResponse) {
          const checkoutRequestId = mpesaResponse.checkoutRequestId;
          const queryResponse = mpesaResponse.queryResponse;
          
          // Success either if query response shows success or transaction is processing
          const isSuccess = 
            (queryResponse && typeof queryResponse === 'object' && 'ResultCode' in queryResponse && queryResponse.ResultCode === "0") ||
            mpesaResponse.isProcessing === true;
          
          if (isSuccess) {
            // Update transaction with new MPESA ID and set status to pending
            transaction.status = 'pending';
            transaction.mpesaTransactionId = checkoutRequestId;
            transaction.lastRetryAt = new Date();
            await transaction.save();
            
            console.log(`✅ Successfully retried transaction ${transaction.transactionId}`);
            successCount++;
          } else {
            const errorMessage = queryResponse?.ResultDesc || 'Unknown error';
            console.error(`Failed to retry transaction ${transaction.transactionId}: ${errorMessage}`);
          }
        } else {
          console.error(`Failed to retry transaction ${transaction.transactionId}: STK push returned no data`);
        }
      } catch (error) {
        console.error(`Error retrying transaction ${transaction.transactionId}:`, error);
      }
    }
    
    return successCount;
  } catch (error) {
    console.error('Error retrying failed deposits:', error);
    return 0;
  }
};

/**
 * Retry failed MPESA withdrawals
 * @param minutes Only retry transactions that are less than this many minutes old
 * @returns Number of transactions successfully retried
 */
export const retryFailedWithdrawals = async (minutes: number = 60): Promise<number> => {
  console.log('🔄 Checking for failed withdrawals to retry...');
  
  try {
    // Find failed withdrawal transactions that are less than X minutes old
    const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
    
    const failedTransactions = await Escrow.find({
      type: 'crypto_to_fiat',
      status: 'failed',
      createdAt: { $gt: cutoffTime },
      retryCount: { $lt: 3 } // Maximum 3 retry attempts
    });
    
    console.log(`Found ${failedTransactions.length} failed withdrawals to retry`);
    
    let successCount = 0;
    
    for (const transaction of failedTransactions) {
      try {
        // Get user information
        const user = await User.findById(transaction.userId);
        if (!user) {
          console.error(`User not found for transaction ${transaction.transactionId}`);
          continue;
        }
        
        // Extract phone from user data or transaction data
        const phoneNumber = user.phoneNumber?.replace(/\D/g, '');
        if (!phoneNumber) {
          console.error(`Phone number not found for transaction ${transaction.transactionId}`);
          continue;
        }
        
        // Format phone number for B2C
        let formattedPhone = phoneNumber;
        if (formattedPhone.startsWith('0')) {
          formattedPhone = '254' + formattedPhone.substring(1);
        } else if (!formattedPhone.startsWith('254')) {
          formattedPhone = '254' + formattedPhone;
        }
        
        // Extract numeric part only
        const phoneNumberInt = parseInt(formattedPhone, 10);
        if (isNaN(phoneNumberInt)) {
          console.error(`Invalid phone number format for transaction ${transaction.transactionId}`);
          continue;
        }
        
        // Increment retry count
        transaction.retryCount = (transaction.retryCount || 0) + 1;
        await transaction.save();
        
        // First check if we need to transfer tokens again
        if (!transaction.cryptoTransactionHash) {
          // Crypto hasn't been transferred yet
          try {
            const cryptoAmount = typeof transaction.cryptoAmount === 'string' 
              ? parseFloat(transaction.cryptoAmount) 
              : transaction.cryptoAmount;
              
            await sendToken(
              config.PLATFORM_WALLET_ADDRESS,
              cryptoAmount,
              "celo",
              user.privateKey
            );
          } catch (tokenError) {
            console.error(`Failed to transfer tokens for transaction ${transaction.transactionId}:`, tokenError);
            continue;
          }
        }
        
        // Retry B2C
        const result = await retryOperation(async () => {
          return initiateB2C(
            transaction.amount, 
            phoneNumberInt,
            `NexusPay Retry ${transaction.retryCount} - ${transaction.transactionId.substring(0, 8)}`
          );
        });
        
        if (result && result.ResponseCode === "0") {
          // Update transaction with new MPESA ID and set status to pending
          transaction.status = 'pending';
          transaction.mpesaTransactionId = result.ConversationID;
          transaction.lastRetryAt = new Date();
          await transaction.save();
          
          console.log(`✅ Successfully retried withdrawal ${transaction.transactionId}`);
          successCount++;
        } else {
          console.error(`Failed to retry withdrawal ${transaction.transactionId}: ${result?.ResponseDescription || 'Unknown error'}`);
        }
      } catch (error) {
        console.error(`Error retrying withdrawal ${transaction.transactionId}:`, error);
      }
    }
    
    return successCount;
  } catch (error) {
    console.error('Error retrying failed withdrawals:', error);
    return 0;
  }
};

/**
 * Scheduled function to retry all types of failed transactions
 * This should be called periodically by a cron job or scheduler
 */
export const retryAllFailedTransactions = async (): Promise<void> => {
  try {
    console.log('🔄 Starting scheduled retry of failed transactions');
    
    // Retry deposits
    const depositRetries = await retryFailedDeposits();
    console.log(`✅ Retried ${depositRetries} failed deposits`);
    
    // Retry withdrawals
    const withdrawalRetries = await retryFailedWithdrawals();
    console.log(`✅ Retried ${withdrawalRetries} failed withdrawals`);
    
    console.log('🔄 Completed scheduled retry of failed transactions');
  } catch (error) {
    console.error('❌ Error during scheduled retry of failed transactions:', error);
  }
}; 