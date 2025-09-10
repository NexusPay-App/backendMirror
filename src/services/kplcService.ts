import { Escrow } from '../models/escrowModel';
import { User } from '../models/userModel';
import { SMSService, KPLCTokenData } from './smsService';

/**
 * KPLC Service for handling Kenya Power token messages
 */
export class KPLCService {
    
    /**
     * Monitor for pending KPLC transactions that should receive tokens
     */
    static async monitorPendingKPLCTokens(): Promise<void> {
        try {
            console.log('🔍 [KPLC-MONITOR] Checking for pending KPLC token transactions...');
            
            // Find KPLC transactions that are completed but haven't received tokens yet
            const pendingTransactions = await Escrow.find({
                paybillNumber: '888880', // KPLC paybill
                status: 'completed',
                'metadata.kplcTokenExpected': true,
                'metadata.kplcToken': { $exists: false },
                createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
            });
            
            console.log(`🔍 [KPLC-MONITOR] Found ${pendingTransactions.length} pending KPLC token transactions`);
            
            for (const escrow of pendingTransactions) {
                const timeSinceCompletion = Date.now() - new Date(escrow.completedAt || escrow.createdAt).getTime();
                const minutesSinceCompletion = Math.floor(timeSinceCompletion / (1000 * 60));
                
                console.log(`⏰ [KPLC-MONITOR] Transaction ${escrow.transactionId} - ${minutesSinceCompletion} minutes since completion`);
                
                // If more than 30 minutes have passed without a token, mark for manual intervention
                if (minutesSinceCompletion > 30) {
                    console.log(`⚠️ [KPLC-MONITOR] Transaction ${escrow.transactionId} - No token received after ${minutesSinceCompletion} minutes`);
                    
                    escrow.metadata = {
                        ...escrow.metadata,
                        kplcTokenTimeout: true,
                        kplcTokenTimeoutAt: new Date().toISOString(),
                        requiresManualIntervention: true
                    };
                    await escrow.save();
                    
                    // Notify admin about missing token
                    await this.notifyAdminMissingToken(escrow);
                }
            }
            
        } catch (error) {
            console.error('❌ Error monitoring KPLC tokens:', error);
        }
    }
    
    /**
     * Process a KPLC token message
     */
    static async processKPLCToken(
        accountNumber: string,
        tokenMessage: string,
        amount: number,
        phoneNumber?: string
    ): Promise<boolean> {
        try {
            console.log(`⚡ [KPLC-TOKEN] Processing token for account: ${accountNumber}`);
            
            // Find the corresponding escrow transaction
            const escrow = await Escrow.findOne({
                accountNumber: accountNumber,
                paybillNumber: '888880',
                status: 'completed',
                'metadata.kplcTokenExpected': true
            }).sort({ createdAt: -1 });
            
            if (!escrow) {
                console.error(`❌ [KPLC-TOKEN] No matching escrow found for account: ${accountNumber}`);
                return false;
            }
            
            // Get user information
            const user = await User.findById(escrow.userId);
            if (!user) {
                console.error(`❌ [KPLC-TOKEN] User not found for escrow: ${escrow.transactionId}`);
                return false;
            }
            
            // Update escrow with token information
            escrow.metadata = {
                ...escrow.metadata,
                kplcToken: tokenMessage,
                kplcTokenReceivedAt: new Date().toISOString(),
                kplcTokenProcessed: true
            };
            await escrow.save();
            
            // Prepare KPLC token data for SMS
            const kplcData: KPLCTokenData = {
                phoneNumber: user.phoneNumber,
                tokenMessage: tokenMessage,
                accountNumber: accountNumber,
                amount: amount,
                transactionId: escrow.transactionId,
                timestamp: new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })
            };
            
            // Send token message to user
            const smsSent = await SMSService.sendKPLCTokenMessage(kplcData);
            
            if (smsSent) {
                console.log(`✅ [KPLC-TOKEN] Token message sent to user: ${user.phoneNumber}`);
                return true;
            } else {
                console.error(`❌ [KPLC-TOKEN] Failed to send token message to user: ${user.phoneNumber}`);
                return false;
            }
            
        } catch (error) {
            console.error('❌ Error processing KPLC token:', error);
            return false;
        }
    }
    
    /**
     * Notify admin about missing KPLC token
     */
    private static async notifyAdminMissingToken(escrow: any): Promise<void> {
        try {
            const user = await User.findById(escrow.userId);
            if (!user) return;
            
            // Send alert to admin (you can customize this to send to admin phone/email)
            console.log(`🚨 [KPLC-ALERT] Missing token for transaction: ${escrow.transactionId}`);
            console.log(`- User: ${user.phoneNumber}`);
            console.log(`- Account: ${escrow.accountNumber}`);
            console.log(`- Amount: ${escrow.amount} KES`);
            console.log(`- Completed: ${escrow.completedAt}`);
            
            // You can implement admin notification here (SMS, email, etc.)
            
        } catch (error) {
            console.error('❌ Error notifying admin about missing token:', error);
        }
    }
    
    /**
     * Get KPLC transaction statistics
     */
    static async getKPLCStats(): Promise<any> {
        try {
            const totalKPLCTransactions = await Escrow.countDocuments({
                paybillNumber: '888880'
            });
            
            const completedKPLCTransactions = await Escrow.countDocuments({
                paybillNumber: '888880',
                status: 'completed'
            });
            
            const tokensReceived = await Escrow.countDocuments({
                paybillNumber: '888880',
                'metadata.kplcToken': { $exists: true }
            });
            
            const pendingTokens = await Escrow.countDocuments({
                paybillNumber: '888880',
                status: 'completed',
                'metadata.kplcTokenExpected': true,
                'metadata.kplcToken': { $exists: false }
            });
            
            return {
                totalTransactions: totalKPLCTransactions,
                completedTransactions: completedKPLCTransactions,
                tokensReceived: tokensReceived,
                pendingTokens: pendingTokens,
                tokenSuccessRate: completedKPLCTransactions > 0 ? (tokensReceived / completedKPLCTransactions * 100).toFixed(2) : 0
            };
            
        } catch (error) {
            console.error('❌ Error getting KPLC stats:', error);
            return null;
        }
    }
    
    /**
     * Simulate KPLC token message (for testing)
     */
    static async simulateKPLCToken(transactionId: string, tokenMessage: string): Promise<boolean> {
        try {
            const escrow = await Escrow.findOne({ transactionId });
            if (!escrow) {
                console.error(`❌ [KPLC-SIM] Transaction not found: ${transactionId}`);
                return false;
            }
            
            if (escrow.paybillNumber !== '888880') {
                console.error(`❌ [KPLC-SIM] Not a KPLC transaction: ${transactionId}`);
                return false;
            }
            
            return await this.processKPLCToken(
                escrow.accountNumber || '',
                tokenMessage,
                escrow.amount,
                undefined
            );
            
        } catch (error) {
            console.error('❌ Error simulating KPLC token:', error);
            return false;
        }
    }
}
