import { issueChallenge, consumeChallenge } from './verificationChallenges';
import { randomInt } from "node:crypto";
import nodemailer from 'nodemailer';
import config from '../config/env';

// Define email template types
type EmailTemplate = {
    subject: string;
    html: string;
};

type StandardTemplateFunction = (otp: string) => EmailTemplate;
type TransactionTemplateFunction = (otp: string, amount: string, token: string) => EmailTemplate;

// Create a transporter using Gmail
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: config.EMAIL_USER,
        pass: config.EMAIL_APP_PASSWORD
    }
});

// Email templates
const emailTemplates = {
    registration: ((otp: string) => ({
        subject: 'Welcome to NexusPay - Verify Your Email',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Welcome to NexusPay!</h2>
                <p>Thank you for registering. Please use the following OTP to verify your email address:</p>
                <div style="background-color: #f4f4f4; padding: 15px; text-align: center; font-size: 24px; letter-spacing: 5px; margin: 20px 0;">
                    <strong>${otp}</strong>
                </div>
                <p>This OTP will expire in 5 minutes.</p>
                <p>If you didn't request this, please ignore this email.</p>
            </div>
        `
    })) as StandardTemplateFunction,
    
    login: ((otp: string) => ({
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
    })) as StandardTemplateFunction,
    
    passwordReset: ((otp: string) => ({
        subject: 'NexusPay Password Reset',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Password Reset Request</h2>
                <p>You requested to reset your password. Use this OTP to proceed:</p>
                <div style="background-color: #f4f4f4; padding: 15px; text-align: center; font-size: 24px; letter-spacing: 5px; margin: 20px 0;">
                    <strong>${otp}</strong>
                </div>
                <p>This OTP will expire in 5 minutes.</p>
                <p>If you didn't request a password reset, please ignore this email.</p>
            </div>
        `
    })) as StandardTemplateFunction,
    
    transactionConfirmation: ((otp: string, amount: string, token: string) => ({
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
    })) as TransactionTemplateFunction,
    
    accountDeletion: ((otp: string) => ({
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
    })) as StandardTemplateFunction
};

// Helper function to check if template is transaction confirmation
function isTransactionTemplate(template: string): template is 'transactionConfirmation' {
    return template === 'transactionConfirmation';
}

export async function sendEmail(
    to: string, 
    template: keyof typeof emailTemplates, 
    ...args: string[]
): Promise<boolean> {
    try {
        const otp = generateOTP();
        
        // Handle different template types
        let emailContent: EmailTemplate;
        
        if (isTransactionTemplate(template) && args.length >= 2) {
            const [amount, token] = args;
            emailContent = emailTemplates[template](otp, amount, token);
        } else {
            emailContent = (emailTemplates[template] as StandardTemplateFunction)(otp);
        }

        await storeOTP(to, otp, template);
        try {
            // Try to send email
            await transporter.sendMail({
                from: `"NexusPay" <test@nexuspay.com>`,
                to,
                subject: emailContent.subject,
                html: emailContent.html
            });
            console.log(`✅ Email sent to ${to} for ${template}`);
        } catch (emailError) {
            // A delivery failure must not advance the verification flow.
            console.error('Verification email delivery failed');
            return false;
        }

        // Store OTP with purpose and expiry
        // Return success only after delivery completes.
        return true;
    } catch (error) {
        console.error('❌ Error in sendEmail function:', error);
        return false;
    }
}

// Generate 6-digit OTP
function generateOTP(): string {
    return randomInt(100000, 1000000).toString();
}

// Verification state is durable and purpose-bound across serverless instances.
async function storeOTP(email: string, otp: string, purpose: string): Promise<void> {
    await issueChallenge(email, `email-${purpose}`, otp);
}
export async function verifyOTP(email: string, otp: string, purpose: keyof typeof emailTemplates): Promise<boolean> {
    return !!await consumeChallenge(email, `email-${purpose}`, otp);
}
