import axios from 'axios';
import config from '../config/env';

/**
 * Generate M-Pesa timestamp in the required format
 */
export const generateTimestamp = (): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');
    
    return `${year}${month}${day}${hour}${minute}${second}`;
};

/**
 * Get M-Pesa access token for API authentication
 */
export const getMpesaAccessToken = async (): Promise<string> => {
    try {
        const consumerKey = config.MPESA_CONSUMER_KEY;
        const consumerSecret = config.MPESA_CONSUMER_SECRET;
        
        if (!consumerKey || !consumerSecret) {
            throw new Error('M-Pesa consumer key and secret are required');
        }
        
        const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
        
        const response = await axios.get(
            'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
            {
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            }
        );
        
        if (!response.data?.access_token) {
            throw new Error('Failed to get access token from M-Pesa API');
        }
        
        return response.data.access_token;
    } catch (error: any) {
        console.error('❌ [MPESA-AUTH] Failed to get access token:', error.response?.data || error.message);
        throw new Error(`M-Pesa authentication failed: ${error.message}`);
    }
}; 