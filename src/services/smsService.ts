import AfricasTalking from 'africastalking';
import config from '../config/env';

// Africa's Talking setup
export const africastalking = AfricasTalking({
    apiKey: config.AFRICAS_TALKING_API_KEY,
    username: 'NEXUSPAY'
});

export interface SMSNotification {
    phoneNumber: string;
    message: string;
    type: 'otp' | 'transaction' | 'overdraft' | 'business' | 'security';
}

export interface TransactionSMSData {
    phoneNumber: string;
    amount: string;
    tokenType: string;
    transactionHash: string;
    transactionType: 'send' | 'receive' | 'buy' | 'sell' | 'overdraft_borrow' | 'overdraft_repay';
    status: 'success' | 'failed' | 'pending';
    recipientAddress?: string;
    senderAddress?: string;
    explorerUrl?: string;
    // Enhanced transaction details
    mpesaReceiptNumber?: string;
    mpesaTransactionTime?: string | Date;
    nexusPayReceipt?: string; // Transaction ID
    transactionDuration?: number; // Duration in seconds
    fiatAmount?: number; // KES amount for buy transactions
    chain?: string; // Blockchain chain
    nexusPayCode?: string; // NexusPay platform code
}

export interface OverdraftSMSData {
    phoneNumber: string;
    amount: string;
    transactionHash: string;
    type: 'borrow' | 'repay';
    newCreditBalance: string;
    availableCredit: string;
    explorerUrl?: string;
}

export interface BusinessSMSData {
    phoneNumber: string;
    businessName: string;
    merchantId: string;
    walletAddress: string;
    creditLimit: string;
    availableCredit: string;
    action: 'created' | 'upgraded' | 'verified';
}

export interface KPLCTokenData {
    phoneNumber: string;
    tokenMessage: string;
    accountNumber: string;
    amount: number;
    transactionId: string;
    timestamp: string;
}

export class SMSService {
    
    /**
     * Send OTP for authentication
     */
    static async sendOTP(phoneNumber: string, otp: string, purpose: string = 'verification'): Promise<boolean> {
        try {
            console.log(`📱 Attempting to send OTP to: ${phoneNumber} (type: ${typeof phoneNumber})`);
            
            // Format phone number for Africa's Talking
            const formattedPhone = this.formatPhoneNumber(phoneNumber);
            console.log(`📱 Formatted phone number: ${formattedPhone}`);
            
            const message = this.formatOTPMessage(otp, purpose);
            console.log(`📱 SMS message: ${message}`);
            
            await africastalking.SMS.send({
                to: [formattedPhone],
                message: message,
                from: 'NEXUSPAY'
            });
            
            console.log(`✅ OTP SMS sent to ${formattedPhone} for ${purpose}`);
            return true;
            
        } catch (error: any) {
            console.error(`❌ Failed to send OTP SMS to ${phoneNumber}:`, error);
            console.error(`❌ Error details:`, {
                phoneNumber,
                phoneNumberType: typeof phoneNumber,
                error: error.message,
                stack: error.stack
            });
            return false;
        }
    }
    
    /**
     * Send transaction notification
     */
    static async sendTransactionNotification(data: TransactionSMSData): Promise<boolean> {
        try {
            // Format phone number for Africa's Talking
            const formattedPhone = this.formatPhoneNumber(data.phoneNumber);
            
            const message = this.formatTransactionMessage(data);
            
            await africastalking.SMS.send({
                to: [formattedPhone],
                message: message,
                from: 'NEXUSPAY'
            });
            
            console.log(`✅ Transaction SMS sent to ${formattedPhone} for ${data.transactionType}`);
            return true;
            
        } catch (error) {
            console.error(`❌ Failed to send transaction SMS to ${data.phoneNumber}:`, error);
            return false;
        }
    }
    
    /**
     * Send overdraft notification
     */
    static async sendOverdraftNotification(data: OverdraftSMSData): Promise<boolean> {
        try {
            // Format phone number for Africa's Talking
            const formattedPhone = this.formatPhoneNumber(data.phoneNumber);
            
            const message = this.formatOverdraftMessage(data);
            
            await africastalking.SMS.send({
                to: [formattedPhone],
                message: message,
                from: 'NEXUSPAY'
            });
            
            console.log(`✅ Overdraft SMS sent to ${formattedPhone} for ${data.type}`);
            return true;
            
        } catch (error) {
            console.error(`❌ Failed to send overdraft SMS to ${data.phoneNumber}:`, error);
            return false;
        }
    }
    
    /**
     * Send business account notification
     */
    static async sendBusinessNotification(data: BusinessSMSData): Promise<boolean> {
        try {
            // Format phone number for Africa's Talking
            const formattedPhone = this.formatPhoneNumber(data.phoneNumber);
            
            const message = this.formatBusinessMessage(data);
            
            await africastalking.SMS.send({
                to: [formattedPhone],
                message: message,
                from: 'NEXUSPAY'
            });
            
            console.log(`✅ Business SMS sent to ${formattedPhone} for ${data.action}`);
            return true;
            
        } catch (error) {
            console.error(`❌ Failed to send business SMS to ${data.phoneNumber}:`, error);
            return false;
        }
    }
    
    /**
     * Send security alert
     */
    static async sendSecurityAlert(phoneNumber: string, alertType: string, details: string): Promise<boolean> {
        try {
            // Format phone number for Africa's Talking
            const formattedPhone = this.formatPhoneNumber(phoneNumber);
            
            const message = this.formatSecurityMessage(alertType, details);
            
            await africastalking.SMS.send({
                to: [formattedPhone],
                message: message,
                from: 'NEXUSPAY'
            });
            
            console.log(`✅ Security alert SMS sent to ${formattedPhone} for ${alertType}`);
            return true;
            
        } catch (error) {
            console.error(`❌ Failed to send security alert SMS to ${phoneNumber}:`, error);
            return false;
        }
    }
    
    /**
     * Send KPLC token message to user
     */
    static async sendKPLCTokenMessage(data: KPLCTokenData): Promise<boolean> {
        try {
            // Format phone number for Africa's Talking
            const formattedPhone = this.formatPhoneNumber(data.phoneNumber);
            
            const message = this.formatKPLCTokenMessage(data);
            
            await africastalking.SMS.send({
                to: [formattedPhone],
                message: message,
                from: 'NEXUSPAY'
            });
            
            console.log(`✅ KPLC token message sent to ${formattedPhone} for transaction ${data.transactionId}`);
            return true;
            
        } catch (error) {
            console.error(`❌ Failed to send KPLC token message to ${data.phoneNumber}:`, error);
            return false;
        }
    }
    
    /**
     * Format OTP message
     */
    private static formatOTPMessage(otp: string, purpose: string): string {
        const purposeText = purpose === 'business_creation' ? 'business account creation' : 
                           purpose === 'business_upgrade' ? 'business upgrade' : 
                           purpose === 'overdraft' ? 'overdraft request' : 
                           purpose === 'withdrawal' ? 'withdrawal' : 'verification';
        
        return `🔐 NEXUSPAY ${purposeText.toUpperCase()} OTP: ${otp}\n\nThis code expires in 5 minutes. Do not share with anyone.\n\nNEXUSPAY Team`;
    }
    
    /**
     * Format transaction message
     */
    private static formatTransactionMessage(data: TransactionSMSData): string {
        const statusEmoji = data.status === 'success' ? '✅' : data.status === 'failed' ? '❌' : '⏳';
        const statusText = data.status === 'success' ? 'SUCCESSFUL' : data.status === 'failed' ? 'FAILED' : 'PENDING';
        
        let message = `${statusEmoji} NEXUSPAY TRANSACTION ${statusText}\n\n`;
        
        switch (data.transactionType) {
            case 'send':
                message += `💰 Sent: ${data.amount} ${data.tokenType}\n`;
                message += `📤 To: ${data.recipientAddress?.slice(0, 8)}...${data.recipientAddress?.slice(-6)}\n`;
                break;
            case 'receive':
                message += `💰 Received: ${data.amount} ${data.tokenType}\n`;
                message += `📥 From: ${data.senderAddress?.slice(0, 8)}...${data.senderAddress?.slice(-6)}\n`;
                break;
            case 'buy':
                message += `💳 Crypto Purchase: ${data.amount} ${data.tokenType}\n`;
                break;
            case 'sell':
                message += `💳 Crypto Sale: ${data.amount} ${data.tokenType}\n`;
                break;
            case 'overdraft_borrow':
                message += `🏦 Overdraft Borrowed: ${data.amount} ${data.tokenType}\n`;
                break;
            case 'overdraft_repay':
                message += `🏦 Overdraft Repaid: ${data.amount} ${data.tokenType}\n`;
                break;
        }
        
        message += `🔗 TX: ${data.transactionHash?.slice(0, 8)}...${data.transactionHash?.slice(-6)}\n`;
        message += `⏰ ${new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })}\n\nNEXUSPAY Team`;
        
        return message;
    }
    
    /**
     * Format overdraft message
     */
    private static formatOverdraftMessage(data: OverdraftSMSData): string {
        const typeEmoji = data.type === 'borrow' ? '🏦' : '💰';
        const typeText = data.type === 'borrow' ? 'BORROWED' : 'REPAID';
        
        let message = `${typeEmoji} NEXUSPAY OVERDRAFT ${typeText}\n\n`;
        message += `💰 Amount: ${data.amount} USDC\n`;
        message += `💳 New Credit Balance: ${data.newCreditBalance} USDC\n`;
        message += `📊 Available Credit: ${data.availableCredit} USDC\n`;
        message += `🔗 TX: ${data.transactionHash?.slice(0, 8)}...${data.transactionHash?.slice(-6)}\n`;
        message += `⏰ ${new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })}\n\nNEXUSPAY Team`;
        
        return message;
    }
    
    /**
     * Format business message
     */
    private static formatBusinessMessage(data: BusinessSMSData): string {
        const actionEmoji = data.action === 'created' ? '🏢' : data.action === 'upgraded' ? '⬆️' : '✅';
        const actionText = data.action === 'created' ? 'CREATED' : data.action === 'upgraded' ? 'UPGRADED' : 'VERIFIED';
        
        let message = `${actionEmoji} NEXUSPAY BUSINESS ${actionText}\n\n`;
        message += `🏢 Business: ${data.businessName}\n`;
        message += `🆔 Merchant ID: ${data.merchantId}\n`;
        message += `💼 Wallet: ${data.walletAddress?.slice(0, 8)}...${data.walletAddress?.slice(-6)}\n`;
        message += `💳 Credit Limit: ${data.creditLimit} USDC\n`;
        message += `📊 Available Credit: ${data.availableCredit} USDC\n`;
        message += `⏰ ${new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })}\n\nNEXUSPAY Team`;
        
        return message;
    }
    
    /**
     * Format security message
     */
    private static formatSecurityMessage(alertType: string, details: string): string {
        const alertEmoji = '🚨';
        
        let message = `${alertEmoji} NEXUSPAY SECURITY ALERT\n\n`;
        message += `⚠️ Alert: ${alertType}\n`;
        message += `📝 Details: ${details}\n`;
        message += `⏰ ${new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })}\n\n`;
        message += `If this wasn't you, contact support immediately.\nNEXUSPAY Team`;
        
        return message;
    }
    
    /**
     * Format KPLC token message
     */
    private static formatKPLCTokenMessage(data: KPLCTokenData): string {
        const tokenEmoji = '⚡';
        
        let message = `${tokenEmoji} KENYA POWER TOKEN\n\n`;
        message += `🔑 ${data.tokenMessage}\n\n`;
        message += `📊 Account: ${data.accountNumber}\n`;
        message += `💰 Amount: ${data.amount} KES\n`;
        message += `🆔 TX: ${data.transactionId}\n`;
        message += `⏰ ${data.timestamp}\n\n`;
        message += `Thank you for using NEXUSPAY!`;
        
        return message;
    }
    
    /**
     * Send bulk SMS notifications
     */
    static async sendBulkSMS(notifications: SMSNotification[]): Promise<{ success: number; failed: number }> {
        let success = 0;
        let failed = 0;
        
        for (const notification of notifications) {
            try {
                // Format phone number for Africa's Talking
                const formattedPhone = this.formatPhoneNumber(notification.phoneNumber);
                
                await africastalking.SMS.send({
                    to: [formattedPhone],
                    message: notification.message,
                    from: 'NEXUSPAY'
                });
                success++;
            } catch (error) {
                console.error(`❌ Failed to send SMS to ${notification.phoneNumber}:`, error);
                failed++;
            }
        }
        
        console.log(`📱 Bulk SMS sent: ${success} successful, ${failed} failed`);
        return { success, failed };
    }
    
    /**
     * Validate phone number format
     */
    static validatePhoneNumber(phoneNumber: string): boolean {
        // Remove any non-digit characters except +
        const cleaned = phoneNumber.replace(/[^\d+]/g, '');
        
        // Check if it starts with + and has 10-15 digits
        return /^\+[1-9]\d{9,14}$/.test(cleaned);
    }
    
    /**
     * Format phone number for Africa's Talking
     */
    static formatPhoneNumber(phoneNumber: string | number): string {
        // Convert to string if it's a number
        let phoneStr = String(phoneNumber);
        
        // Remove any non-digit characters except +
        let cleaned = phoneStr.replace(/[^\d+]/g, '');
        
        // If it doesn't start with +, add it
        if (!cleaned.startsWith('+')) {
            // If it starts with 254 (Kenya), add +
            if (cleaned.startsWith('254')) {
                cleaned = '+' + cleaned;
            }
            // If it starts with 0, replace with +254
            else if (cleaned.startsWith('0')) {
                cleaned = '+254' + cleaned.substring(1);
            }
            // If it's a 9-digit number, assume it's Kenyan and add +254
            else if (cleaned.length === 9) {
                cleaned = '+254' + cleaned;
            }
            // Otherwise, add +254 as default
            else {
                cleaned = '+254' + cleaned;
            }
        }
        
        // Validate the final format
        if (!/^\+[1-9]\d{9,14}$/.test(cleaned)) {
            console.warn(`⚠️ Invalid phone number format: ${phoneNumber} -> ${cleaned}`);
        }
        
        return cleaned;
    }
}
