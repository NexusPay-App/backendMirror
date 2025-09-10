import { Request, Response, NextFunction } from 'express';
import { SMSService, KPLCTokenData } from '../services/smsService';
import { Escrow } from '../models/escrowModel';
import { User } from '../models/userModel';

/**
 * Handle KPLC token message webhook
 * This endpoint receives token messages from KPLC when payments are processed
 */
export const kplcTokenWebhook = async (req: Request, res: Response, next: NextFunction) => {
    try {
        console.log('🔌 [KPLC-WEBHOOK] Received KPLC token message:', JSON.stringify(req.body, null, 2));
        
        // Acknowledge the webhook immediately
        res.status(200).json({ status: 'success', message: 'Token message received' });
        
        // Process the token message asynchronously
        processKPLCTokenMessage(req.body).catch(err => {
            console.error('❌ Error processing KPLC token message:', err);
        });
        
    } catch (error) {
        console.error('❌ Error in KPLC webhook handler:', error);
        res.status(500).json({ status: 'error', message: 'Failed to process token message' });
    }
};

/**
 * Process KPLC token message and forward to user
 */
async function processKPLCTokenMessage(tokenData: any) {
    try {
        // Extract token information from KPLC response
        const {
            accountNumber,
            amount,
            tokenMessage,
            transactionId,
            phoneNumber,
            timestamp
        } = tokenData;
        
        console.log(`⚡ [KPLC-TOKEN] Processing token for account: ${accountNumber}`);
        console.log(`- Amount: ${amount} KES`);
        console.log(`- Token: ${tokenMessage}`);
        console.log(`- Phone: ${phoneNumber}`);
        
        // Find the corresponding escrow transaction
        const escrow = await Escrow.findOne({
            accountNumber: accountNumber,
            paybillNumber: '888880', // KPLC paybill
            status: 'processing'
        }).sort({ createdAt: -1 }); // Get the most recent transaction
        
        if (!escrow) {
            console.error(`❌ [KPLC-TOKEN] No matching escrow found for account: ${accountNumber}`);
            return;
        }
        
        console.log(`✅ [KPLC-TOKEN] Found matching escrow: ${escrow.transactionId}`);
        
        // Get user information
        const user = await User.findById(escrow.userId);
        if (!user) {
            console.error(`❌ [KPLC-TOKEN] User not found for escrow: ${escrow.transactionId}`);
            return;
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
        } else {
            console.error(`❌ [KPLC-TOKEN] Failed to send token message to user: ${user.phoneNumber}`);
        }
        
    } catch (error) {
        console.error('❌ Error processing KPLC token message:', error);
    }
}

/**
 * Manual KPLC token message endpoint (for testing/admin use)
 */
export const sendKPLCTokenManually = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { transactionId, tokenMessage } = req.body;
        
        if (!transactionId || !tokenMessage) {
            return res.status(400).json({
                success: false,
                message: 'Transaction ID and token message are required'
            });
        }
        
        // Find the escrow transaction
        const escrow = await Escrow.findOne({ transactionId });
        if (!escrow) {
            return res.status(404).json({
                success: false,
                message: 'Transaction not found'
            });
        }
        
        // Get user information
        const user = await User.findById(escrow.userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        // Prepare KPLC token data
        const kplcData: KPLCTokenData = {
            phoneNumber: user.phoneNumber,
            tokenMessage: tokenMessage,
            accountNumber: escrow.accountNumber || 'N/A',
            amount: escrow.amount,
            transactionId: escrow.transactionId,
            timestamp: new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })
        };
        
        // Send token message
        const smsSent = await SMSService.sendKPLCTokenMessage(kplcData);
        
        if (smsSent) {
            // Update escrow with token information
            escrow.metadata = {
                ...escrow.metadata,
                kplcToken: tokenMessage,
                kplcTokenReceivedAt: new Date().toISOString(),
                kplcTokenProcessed: true,
                manualTokenSent: true
            };
            await escrow.save();
            
            res.json({
                success: true,
                message: 'KPLC token message sent successfully',
                data: {
                    transactionId: escrow.transactionId,
                    phoneNumber: user.phoneNumber,
                    tokenMessage: tokenMessage
                }
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to send KPLC token message'
            });
        }
        
    } catch (error) {
        console.error('❌ Error in manual KPLC token sending:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

/**
 * Get KPLC transaction status
 */
export const getKPLCTransactionStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { transactionId } = req.params;
        
        const escrow = await Escrow.findOne({ transactionId });
        if (!escrow) {
            return res.status(404).json({
                success: false,
                message: 'Transaction not found'
            });
        }
        
        const hasToken = !!(escrow.metadata?.kplcToken);
        const tokenProcessed = !!(escrow.metadata?.kplcTokenProcessed);
        
        res.json({
            success: true,
            data: {
                transactionId: escrow.transactionId,
                status: escrow.status,
                amount: escrow.amount,
                accountNumber: escrow.accountNumber,
                paybillNumber: escrow.paybillNumber,
                hasKPLCToken: hasToken,
                tokenProcessed: tokenProcessed,
                kplcToken: escrow.metadata?.kplcToken || null,
                tokenReceivedAt: escrow.metadata?.kplcTokenReceivedAt || null,
                createdAt: escrow.createdAt,
                completedAt: escrow.completedAt
            }
        });
        
    } catch (error) {
        console.error('❌ Error getting KPLC transaction status:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

/**
 * Get KPLC statistics (Admin endpoint)
 */
export const getKPLCStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { KPLCService } = await import('../services/kplcService');
        const stats = await KPLCService.getKPLCStats();
        
        res.json({
            success: true,
            data: stats
        });
        
    } catch (error) {
        console.error('❌ Error getting KPLC stats:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

/**
 * Simulate KPLC token (Admin endpoint for testing)
 */
export const simulateKPLCToken = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { transactionId, tokenMessage } = req.body;
        
        if (!transactionId || !tokenMessage) {
            return res.status(400).json({
                success: false,
                message: 'Transaction ID and token message are required'
            });
        }
        
        const { KPLCService } = await import('../services/kplcService');
        const success = await KPLCService.simulateKPLCToken(transactionId, tokenMessage);
        
        if (success) {
            res.json({
                success: true,
                message: 'KPLC token simulated successfully'
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to simulate KPLC token'
            });
        }
        
    } catch (error) {
        console.error('❌ Error simulating KPLC token:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
