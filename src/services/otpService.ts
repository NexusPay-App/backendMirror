import { redis } from '../config/redis';

const OTP_EXPIRY = 300; // 5 minutes in seconds
const OTP_PREFIX = 'otp:';

/**
 * Verify an OTP for a given phone number
 * @param phoneNumber The phone number to verify OTP for
 * @param otp The OTP to verify
 * @returns Promise<boolean> True if OTP is valid, false otherwise
 */
export async function verifyOtp(phoneNumber: string, otp: string): Promise<boolean> {
    try {
        // Get stored OTP from Redis
        const key = `${OTP_PREFIX}${phoneNumber}`;
        const storedOtp = await redis.get(key);

        // If no OTP found or doesn't match
        if (!storedOtp || storedOtp !== otp) {
            return false;
        }

        // Delete the OTP after successful verification
        await redis.del(key);

        return true;
    } catch (error) {
        console.error('Error verifying OTP:', error);
        return false;
    }
}

/**
 * Store an OTP for a phone number
 * @param phoneNumber The phone number to store OTP for
 * @param otp The OTP to store
 */
export async function storeOtp(phoneNumber: string, otp: string): Promise<void> {
    try {
        const key = `${OTP_PREFIX}${phoneNumber}`;
        await redis.set(key, otp, 'EX', OTP_EXPIRY);
    } catch (error) {
        console.error('Error storing OTP:', error);
        throw error;
    }
} 