"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = sendEmail;
exports.verifyOTP = verifyOTP;
const nodemailer_1 = __importDefault(require("nodemailer"));
const env_1 = __importDefault(require("../config/env"));
const ioredis_1 = __importDefault(require("ioredis"));
// In-memory OTP store as fallback when Redis is unavailable
const inMemoryOtpStore = {};
// Setup Redis client with better error handling
let redis = null;
let useRedis = true;
try {
    redis = new ioredis_1.default(env_1.default.REDIS_URL || 'redis://localhost:6379', {
        retryStrategy: (times) => {
            if (times > 3) {
                // After 3 retries, we'll switch to in-memory storage
                useRedis = false;
                console.log('⚠️ Redis connection failed after multiple attempts, using in-memory storage');
                return null; // Stop retrying
            }
            const delay = Math.min(times * 50, 2000);
            return delay;
        },
        maxRetriesPerRequest: 3,
        connectTimeout: 5000 // Timeout after 5 seconds
    });
    // Handle Redis connection events
    redis.on('connect', () => {
        console.log('✅ Connected to Redis');
        useRedis = true;
    });
    redis.on('error', (err) => {
        console.error('❌ Redis connection error:', err);
        if (useRedis) {
            console.log('⚠️ Switching to in-memory OTP storage');
            useRedis = false;
        }
    });
}
catch (error) {
    console.error('❌ Failed to initialize Redis:', error);
    useRedis = false;
    console.log('⚠️ Using in-memory OTP storage');
}
// Create a transporter using Gmail
const transporter = nodemailer_1.default.createTransport({
    service: 'gmail',
    auth: {
        user: env_1.default.EMAIL_USER,
        pass: env_1.default.EMAIL_APP_PASSWORD
    }
});
// Email templates
const emailTemplates = {
    registration: ((otp) => ({
        subject: 'Welcome to NexusPay - Verify Your Email',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Welcome to NexusPay!</h2>
                <p>Thank you for registering. Please use the following OTP to verify your email address:</p>
                <div style="background-color: #f4f4f4; padding: 15px; text-align: center; font-size: 24px; letter-spacing: 5px; margin: 20px 0;">
                    <strong>${otp}</strong>
                </div>
                <p>This OTP will expire in 10 minutes.</p>
                <p>If you didn't request this, please ignore this email.</p>
            </div>
        `
    })),
    login: ((otp) => ({
        subject: 'NexusPay Login Verification',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Login Verification</h2>
                <p>Use the following OTP to verify your login:</p>
                <div style="background-color: #f4f4f4; padding: 15px; text-align: center; font-size: 24px; letter-spacing: 5px; margin: 20px 0;">
                    <strong>${otp}</strong>
                </div>
                <p>This OTP will expire in 5 minutes.</p>
                <p>If you didn't attempt to log in, please secure your account immediately.</p>
            </div>
        `
    })),
    passwordReset: ((otp) => ({
        subject: 'NexusPay Password Reset',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Password Reset Request</h2>
                <p>You requested to reset your password. Use this OTP to proceed:</p>
                <div style="background-color: #f4f4f4; padding: 15px; text-align: center; font-size: 24px; letter-spacing: 5px; margin: 20px 0;">
                    <strong>${otp}</strong>
                </div>
                <p>This OTP will expire in 10 minutes.</p>
                <p>If you didn't request a password reset, please ignore this email.</p>
            </div>
        `
    })),
    transactionConfirmation: ((otp, amount, token) => ({
        subject: 'NexusPay Transaction Verification',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Verify Your Transaction</h2>
                <p>You're about to send ${amount} ${token}. Use this OTP to confirm:</p>
                <div style="background-color: #f4f4f4; padding: 15px; text-align: center; font-size: 24px; letter-spacing: 5px; margin: 20px 0;">
                    <strong>${otp}</strong>
                </div>
                <p>This OTP will expire in 5 minutes.</p>
                <p>If you didn't initiate this transaction, please contact support immediately.</p>
            </div>
        `
    })),
    accountDeletion: ((otp) => ({
        subject: 'NexusPay Account Deletion Request',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Account Deletion Confirmation</h2>
                <p>We received a request to delete your NexusPay account. This action is irreversible and will remove all your account data.</p>
                <p>Please use the following OTP to confirm your account deletion:</p>
                <div style="background-color: #f4f4f4; padding: 15px; text-align: center; font-size: 24px; letter-spacing: 5px; margin: 20px 0;">
                    <strong>${otp}</strong>
                </div>
                <p>This OTP will expire in 5 minutes.</p>
                <p>If you did not request this action, please secure your account immediately and contact our support team.</p>
            </div>
        `
    }))
};
// Helper function to check if template is transaction confirmation
function isTransactionTemplate(template) {
    return template === 'transactionConfirmation';
}
async function sendEmail(to, template, ...args) {
    try {
        const otp = generateOTP();
        // Handle different template types
        let emailContent;
        if (isTransactionTemplate(template) && args.length >= 2) {
            const [amount, token] = args;
            emailContent = emailTemplates[template](otp, amount, token);
        }
        else {
            emailContent = emailTemplates[template](otp);
        }
        try {
            // Try to send email
            await transporter.sendMail({
                from: `"NexusPay" <test@nexuspay.com>`,
                to,
                subject: emailContent.subject,
                html: emailContent.html
            });
            console.log(`✅ Email sent to ${to} for ${template}`);
        }
        catch (emailError) {
            // If email fails, just log the error and continue
            console.error('❌ Error sending email:', emailError);
            console.log(`⚠️ Email not sent but continuing with OTP: ${otp}`);
        }
        // Store OTP with purpose and expiry
        await storeOTP(to, otp, template);
        // Always return true so verification flow can continue
        return true;
    }
    catch (error) {
        console.error('❌ Error in sendEmail function:', error);
        return false;
    }
}
// Generate 6-digit OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
// Store OTP with expiry in Redis or in-memory
async function storeOTP(email, otp, purpose) {
    try {
        const key = `otp:${purpose}:${email}`;
        const expirySeconds = getExpiryTime(purpose);
        if (useRedis && redis) {
            // Store in Redis with expiry
            await redis.set(key, otp, 'EX', expirySeconds);
            console.log(`✅ OTP stored in Redis for ${email} (${purpose}): ${otp}`);
        }
        else {
            // Store in memory with expiry
            const expiryTime = Date.now() + (expirySeconds * 1000);
            inMemoryOtpStore[key] = { otp, expiry: expiryTime };
            console.log(`✅ OTP stored in memory for ${email} (${purpose}): ${otp}`);
            // Set up cleanup of expired OTPs in memory
            setTimeout(() => {
                if (inMemoryOtpStore[key] && inMemoryOtpStore[key].expiry <= Date.now()) {
                    delete inMemoryOtpStore[key];
                }
            }, expirySeconds * 1000);
        }
    }
    catch (error) {
        console.error(`❌ Error storing OTP:`, error);
        throw new Error(`Failed to store OTP: ${error.message || String(error)}`);
    }
}
// Get expiry time based on purpose
function getExpiryTime(purpose) {
    switch (purpose) {
        case 'login':
            return 5 * 60; // 5 minutes
        case 'registration':
        case 'passwordReset':
            return 10 * 60; // 10 minutes
        case 'transactionConfirmation':
            return 5 * 60; // 5 minutes
        case 'accountDeletion':
            return 5 * 60; // 5 minutes
        default:
            return 10 * 60; // Default 10 minutes
    }
}
// Verify OTP from Redis or in-memory
async function verifyOTP(email, otp, purpose) {
    try {
        const key = `otp:${purpose}:${email}`;
        if (useRedis && redis) {
            // Verify from Redis
            const storedOTP = await redis.get(key);
            if (storedOTP === otp) {
                // Delete OTP after successful verification
                await redis.del(key);
                return true;
            }
        }
        else {
            // Verify from in-memory store
            const storedData = inMemoryOtpStore[key];
            if (storedData && storedData.otp === otp) {
                // Check if the OTP is still valid
                if (storedData.expiry > Date.now()) {
                    // Delete OTP after successful verification
                    delete inMemoryOtpStore[key];
                    return true;
                }
            }
        }
        return false;
    }
    catch (error) {
        console.error(`❌ Error verifying OTP:`, error);
        return false;
    }
}
