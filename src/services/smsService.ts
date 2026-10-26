import AfricasTalking from 'africastalking';
import config from '../config/env';

// Africa's Talking setup
let smsClient: ReturnType<typeof AfricasTalking> | undefined;
export const africastalking = new Proxy({} as ReturnType<typeof AfricasTalking>, {
    get(_target, property) {
        if (!smsClient) {
            if (!config.AFRICAS_TALKING_API_KEY) throw new Error('SMS is not configured');
            smsClient = AfricasTalking({ apiKey: config.AFRICAS_TALKING_API_KEY, username: process.env.AFRICAS_TALKING_USERNAME || 'NEXUSPAY' });
        }
        return Reflect.get(smsClient, property);
    }
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
    networkName?: string;
}

export interface OverdraftSMSData {
    phoneNumber: string;
    amount: string;
    transactionHash: string;
    type: 'borrow' | 'repay';
    newCreditBalance: string;
    availableCredit: string;
    explorerUrl?: string;
    networkName?: string;
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

export class SMSService {
    
    /**
     * Send OTP for authentication
     */
    static async sendOTP(phoneNumber: string, otp: string, purpose: string = 'verification'): Promise<boolean> {
        try {
            const formattedPhone = this.formatPhoneNumber(phoneNumber);
            const response = await africastalking.SMS.send({
                to: [formattedPhone],
                message: this.formatOTPMessage(otp, purpose),
                from: 'NEXUSPAY'
            });
            return response.SMSMessageData?.Recipients?.some(recipient =>
                recipient.number === formattedPhone && recipient.status === 'Success'
            ) ?? false;
        } catch {
            return false;
        }
    }

    /**
     * Send transaction notification
     */
    static async submitTransactionNotification(data: TransactionSMSData): Promise<{ status: 'accepted' | 'rejected' | 'unknown'; messageId?: string; code?: string }> {
        if (!config.AFRICAS_TALKING_API_KEY) return { status: 'rejected', code: 'SMS_NOT_CONFIGURED' };
        const phone = this.formatPhoneNumber(data.phoneNumber);
        if (!this.validatePhoneNumber(phone)) return { status: 'rejected', code: 'INVALID_PHONE' };
        try {
            const response = await africastalking.SMS.send({ to: [phone], message: this.formatTransactionMessage(data), from: process.env.AFRICAS_TALKING_SENDER_ID || 'NEXUSPAY' });
            const recipient = response.SMSMessageData?.Recipients?.find(item => item.number === phone);
            if (recipient?.status === 'Success' && recipient.messageId) return { status: 'accepted', messageId: recipient.messageId };
            return recipient ? { status: 'rejected', code: String(recipient.statusCode || 'PROVIDER_REJECTED') } : { status: 'unknown', code: 'PROVIDER_RESPONSE_INCOMPLETE' };
        } catch (error: any) {
            const status = error?.response?.status;
            return [400, 401, 403, 422, 429].includes(status)
                ? { status: 'rejected', code: `PROVIDER_HTTP_${status}` }
                : { status: 'unknown', code: 'PROVIDER_OUTCOME_UNKNOWN' };
        }
    }

    static async sendTransactionNotification(data: TransactionSMSData): Promise<boolean> {
        return (await this.submitTransactionNotification(data)).status === 'accepted';
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
        const action = data.transactionType === 'receive' ? 'Received' : data.transactionType === 'send' ? 'Sent' : data.transactionType.replaceAll('_', ' ');
        const status = data.status === 'success' ? '' : ` (${data.status})`;
        const network = data.networkName ? ` on ${data.networkName}` : '';
        const hash = `${data.transactionHash.slice(0, 10)}...${data.transactionHash.slice(-6)}`;
        return `NexusPay: ${action} ${data.amount} ${data.tokenType}${network}${status}. Tx: ${hash}. Open your wallet: https://app.nexuspayapp.xyz`;
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
