// src/controllers/authController.ts
import { User } from '../models/models';
import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { createAccount, generateOTP, otpStore, SALT_ROUNDS } from "../services/auth";
import { handleError, standardResponse } from "../services/utils";
import config from '../config/env';
import { sendEmail, verifyOTP } from '../services/email';
import { registerVerifiedSession, invalidateSession } from '../middleware/strictAuthMiddleware';
import { verifyGoogleToken, GoogleUserInfo } from '../services/googleAuth';
import { SMSService } from '../services/smsService';
import { UserOptimizationService } from '../services/userOptimizationService';
import { createErrorResponse, AUTH_ERROR_CODES } from '../utils/errorCodes';
import { ensService } from '../services/ensService';

export const initiateRegisterUser = async (req: Request, res: Response) => {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
        return res.status(400).json(createErrorResponse('INVALID_PHONE_FORMAT', 'Phone number is required'));
    }

    // Validate phone number format
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(phoneNumber)) {
        return res.status(400).json(createErrorResponse('INVALID_PHONE_FORMAT'));
    }

    // Ensure phone number is a string
    const phoneNumberStr = String(phoneNumber);
    console.log(`📱 Phone number received: ${phoneNumber} (type: ${typeof phoneNumber})`);
    console.log(`📱 Phone number converted: ${phoneNumberStr} (type: ${typeof phoneNumberStr})`);

    let existingUser;
    try {
        existingUser = await User.findOne({ phoneNumber: phoneNumberStr });
    } catch (error) {
        console.error("❌ Error checking existing user:", error);
        return res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Failed to check existing user'));
    }

    if (existingUser) {
        return res.status(409).json(createErrorResponse('USER_ALREADY_EXISTS', 'Phone number already registered'));
    }

    const otp = generateOTP();
    otpStore[phoneNumberStr] = otp;

    // Log OTP for testing purposes
    console.log('\n======================================');
    console.log(`🔑 REGISTRATION OTP FOR ${phoneNumberStr}: ${otp}`);
    console.log('======================================\n');

    console.log(`✅ OTP generated for ${phoneNumberStr}: ${otp}`);

    try {
        // Send OTP via SMS using the new SMS service
        const smsSent = await SMSService.sendOTP(phoneNumberStr, otp, 'registration');
        
        if (!smsSent) {
            return res.status(500).json(createErrorResponse('OTP_NOT_SENT', 'Failed to send OTP. Check your number and try again.'));
        }

        return res.json({
            success: true,
            message: "OTP sent successfully. Please verify to complete registration.",
            data: {
                phoneNumber: phoneNumberStr,
                otpExpiry: "5 minutes"
            },
            error: null,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error("❌ Error sending OTP:", error);
        return res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Failed to send OTP'));
    }
};

export const registerUser = async (req: Request, res: Response) => {
    const { phoneNumber, email, password, otp, verifyWith } = req.body;

    // Require at least one contact method and password
    if ((!phoneNumber && !email) || !password) {
        return res.status(400).json(createErrorResponse('INVALID_CREDENTIALS', 'At least one contact method (phone number or email) and password are required!'));
    }

    // Require OTP for completion
    if (!otp) {
        return res.status(400).json(createErrorResponse('INVALID_OTP', 'OTP is required to complete registration!'));
    }

    // Validate OTP format
    if (!/^\d{6}$/.test(otp)) {
        return res.status(400).json(createErrorResponse('INVALID_OTP', 'OTP must be 6 digits'));
    }

    // Determine verification method: phone, email, or both
    const verificationMethod = verifyWith || (email ? 'email' : 'phone');
    if (verificationMethod === 'email' && !email) {
        return res.status(400).json(createErrorResponse('INVALID_EMAIL_FORMAT', 'Email is required for email verification!'));
    }
    if (verificationMethod === 'phone' && !phoneNumber) {
        return res.status(400).json(createErrorResponse('INVALID_PHONE_FORMAT', 'Phone number is required for phone verification!'));
    }

    try {
        // Check if user already exists
        const existingUserQuery: any = { $or: [] };
        if (phoneNumber) existingUserQuery.$or.push({ phoneNumber });
        if (email) existingUserQuery.$or.push({ email });

        const existingUser = await User.findOne(existingUserQuery);
        if (existingUser) {
            const fieldTaken = existingUser.phoneNumber === phoneNumber ? 'phone number' : 'email';
            return res.status(409).json(createErrorResponse('USER_ALREADY_EXISTS', `User with this ${fieldTaken} already exists.`));
        }

        // Verify OTP before creating account
        let otpValid = false;
        
        if (verificationMethod === 'phone' || verificationMethod === 'both') {
            // Log OTP verification attempt
            console.log('\n======================================');
            console.log(`🔍 VERIFYING REGISTRATION OTP FOR ${phoneNumber}`);
            console.log(`📱 Received OTP: ${otp}`);
            console.log(`🔐 Stored OTP: ${otpStore[phoneNumber] || 'No OTP found'}`);
            console.log('======================================\n');
            
            otpValid = otpStore[phoneNumber] === otp;
            if (otpValid) {
                delete otpStore[phoneNumber]; // Clear OTP after successful verification
            }
        }
        
        if (verificationMethod === 'email' || verificationMethod === 'both') {
            const emailOtpValid = await verifyOTP(email, otp, 'registration');
            otpValid = verificationMethod === 'email' ? emailOtpValid : (otpValid || emailOtpValid);
        }

        if (!otpValid) {
            return res.status(400).json(createErrorResponse('INVALID_OTP', 'Invalid or expired OTP. Please try again.'));
        }

        // Create unified account only after OTP verification
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        const userSmartAccount = await createAccount();
        const { pk, walletAddress } = userSmartAccount;

        // Create new user with unified wallet
        const newUser = new User({
            phoneNumber: phoneNumber ? phoneNumber : undefined,
            email: email ? email : undefined,
            walletAddress,
            password: hashedPassword,
            privateKey: pk,
            isEmailVerified: false,
            isPhoneVerified: false,
            isUnified: true // Mark as unified wallet
        });
        await newUser.save();

        // Create ENS subdomain for the user
        try {
            console.log(`Creating ENS subdomain for user: ${newUser._id}`);
            const ensResult = await ensService.createUserSubdomain({
                email: email,
                phoneNumber: phoneNumber,
                userId: newUser._id.toString(),
                walletAddress: walletAddress
            });

            if (ensResult.success && ensResult.subdomain) {
                newUser.ensSubdomain = ensResult.subdomain;
                newUser.ensSubdomainCreated = true;
                newUser.ensSubdomainTxHash = ensResult.transactionHash;
                await newUser.save();
                console.log(`✅ ENS subdomain created: ${ensResult.subdomain}`);
            } else {
                console.error(`❌ Failed to create ENS subdomain: ${ensResult.error}`);
                // Don't fail registration if ENS creation fails
            }
        } catch (ensError) {
            console.error('Error creating ENS subdomain:', ensError);
            // Don't fail registration if ENS creation fails
        }

        const verificationChannel = verificationMethod === 'both' 
            ? 'email and phone' 
            : verificationMethod === 'email' ? 'email' : 'phone';

        const responseData = {
            registrationId: newUser._id.toString(),
            verificationMethod,
            ...(email && { email }),
            ...(phoneNumber && { phoneNumber })
        };

        res.status(201).json(standardResponse(
            true,
            `Registration initiated. Please verify your ${verificationChannel}.`,
            responseData
        ));

    } catch (error: any) {
        console.error('Error in registerUser:', error);
        return handleError(error, res, "Error registering user");
    }
};

export const verifyEmail = async (req: Request, res: Response) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json(standardResponse(false, "Email and OTP are required!"));
    }

    try {
        // Special bypass for testing - OTP "123456" always works in non-production
        const isProduction = process.env.NODE_ENV === 'production';
        const isValid = otp === "123456" && !isProduction ? true : await verifyOTP(email, otp, 'registration');
        
        if (!isValid) {
            return res.status(400).json(standardResponse(false, "Invalid or expired OTP."));
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json(standardResponse(false, "User not found."));
        }

        user.isEmailVerified = true;
        await user.save();

        const token = jwt.sign(
            { 
                id: user._id,
                email: user.email,
                phoneNumber: user.phoneNumber,
                walletAddress: user.walletAddress 
            },
            config.JWT_SECRET!,
            { expiresIn: '1h' }
        );

        res.json(standardResponse(
            true,
            "Email verified successfully!",
            {
                token,
                walletAddress: user.walletAddress,
                email: user.email,
                phoneNumber: user.phoneNumber
            }
        ));

    } catch (error: any) {
        console.error('Error in verifyEmail:', error);
        return handleError(error, res, "Error verifying email");
    }
};

export const verifyPhone = async (req: Request, res: Response) => {
    const { phoneNumber, otp } = req.body;

    if (!phoneNumber || !otp) {
        return res.status(400).send({ message: "Phone number and OTP are required!" });
    }

    try {
        // Log OTP verification attempt
        console.log('\n======================================');
        console.log(`🔍 VERIFYING PHONE OTP FOR ${phoneNumber}`);
        console.log(`📱 Received OTP: ${otp}`);
        console.log(`🔐 Stored OTP: ${otpStore[phoneNumber] || 'No OTP found'}`);
        console.log('======================================\n');
        
        if (!otpStore[phoneNumber] || otpStore[phoneNumber] !== otp) {
            return res.status(400).send({ message: "Invalid or expired OTP." });
        }
        
        // Clear OTP after verification
        delete otpStore[phoneNumber];

        const user = await User.findOne({ phoneNumber });
        if (!user) {
            return res.status(404).send({ message: "User not found." });
        }

        user.isPhoneVerified = true;
        await user.save();

        const token = jwt.sign(
            { 
                id: user._id,
                email: user.email,
                phoneNumber: user.phoneNumber,
                walletAddress: user.walletAddress 
            },
            config.JWT_SECRET!,
            { expiresIn: '1h' }
        );

        res.send({
            token,
            message: "Phone number verified successfully!",
            walletAddress: user.walletAddress,
            email: user.email,
            phoneNumber: user.phoneNumber
        });

    } catch (error: any) {
        console.error('Error in verifyPhone:', error);
        res.status(500).send({ 
            message: "Error verifying phone number", 
            error: error.message || String(error)
        });
    }
};

export const login = async (req: Request, res: Response) => {
    const { email, phoneNumber, password } = req.body;

    // Log the login attempt
    console.log('\n======================================');
    console.log('🔒 LOGIN ATTEMPT');
    console.log(`📧 Email: ${email || 'Not provided'}`);
    console.log(`📱 Phone: ${phoneNumber || 'Not provided'}`);
    console.log('======================================\n');

    // At least one identifier (email or phone) is required
    if ((!email && !phoneNumber) || !password) {
        console.log('❌ Missing credentials: No email/phone or password');
        return res.status(400).json(createErrorResponse('INVALID_CREDENTIALS', 'Either email or phone number, and password are required!'));
    }

    try {
        // Find user by either email or phone number
        const query = email ? { email } : { phoneNumber };
        console.log(`🔍 Looking up user with query:`, query);
        
        const user = await User.findOne(query);
        
        if (!user) {
            console.log('❌ User not found');
            return res.status(404).json(createErrorResponse('USER_NOT_FOUND', 'No account found with this information'));
        }

        // Log found user details
        console.log('\n======================================');
        console.log('✅ USER FOUND');
        console.log(`📧 Email: ${user.email || 'Not set'}`);
        console.log(`📱 Phone: ${user.phoneNumber || 'Not set'}`);
        console.log(`📧 Email verified: ${user.isEmailVerified}`);
        console.log(`📱 Phone verified: ${user.isPhoneVerified}`);
        console.log('======================================\n');

        // Check if user has a password (Google OAuth users might not have one)
        if (!user.password) {
            console.log('❌ User has no password (Google OAuth account)');
            return res.status(401).json(createErrorResponse('INVALID_CREDENTIALS', 'This account was created with Google. Please sign in with Google or add a password first.'));
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password);
        console.log(`🔑 Password valid: ${isValidPassword}`);
        
        if (!isValidPassword) {
            console.log('❌ Invalid password');
            return res.status(401).json(createErrorResponse('WRONG_PASSWORD', 'Incorrect password provided'));
        }

        // Verify email or phone is verified
        if (email && !user.isEmailVerified) {
            console.log('❌ Email not verified');
            return res.status(401).json(createErrorResponse('EMAIL_NOT_VERIFIED', 'Please verify your email first.'));
        }
        
        if (phoneNumber && !user.isPhoneVerified) {
            console.log('❌ Phone not verified - suggesting password reset');
            return res.status(401).json(createErrorResponse('PHONE_NOT_VERIFIED', 'Phone number not verified. Please use password reset to verify your phone number and set a new password.'));
        }

        console.log('✅ All validation passed, sending OTP');

        // Send OTP based on login method
        if (email) {
            // Send email OTP
            const emailSent = await sendEmail(email, 'login');
            if (!emailSent) {
                return res.status(500).json(standardResponse(
                    false, 
                    "Failed to send login verification code."
                ));
            }

            return res.json(standardResponse(
                true, 
                "Please verify your login with the code sent to your email.",
                { email }
            ));
        } else {
            // Send SMS OTP for phone login
            const otp = generateOTP();
            otpStore[phoneNumber] = otp;
            
            // Log OTP for testing purposes
            console.log('\n======================================');
            console.log(`🔑 LOGIN OTP FOR ${phoneNumber}: ${otp}`);
            console.log('======================================\n');
            
            try {
                // Send OTP via SMS using the new SMS service
                const smsSent = await SMSService.sendOTP(phoneNumber, otp, 'login');
                
                if (!smsSent) {
                    console.log(`❌ SMS sending failed but login OTP was generated: ${otp}`);
                    return res.status(200).json(standardResponse(
                        true,
                        "OTP generated successfully. SMS failed, but check server logs for OTP code.",
                        { phoneNumber, smsFailure: true }
                    ));
                }
                
                return res.json(standardResponse(
                    true, 
                    "Please verify your login with the code sent to your phone number.",
                    { phoneNumber }
                ));
            } catch (error) {
                console.error("❌ Error sending SMS OTP:", error);
                console.log(`❌ SMS sending error but login OTP was generated: ${otp}`);
                return res.status(200).json(standardResponse(
                    true,
                    "OTP generated successfully. SMS service error, but check server logs for OTP code.",
                    { phoneNumber, smsFailure: true }
                ));
            }
        }
    } catch (error) {
        console.error('Error in login:', error);
        return handleError(error, res, "Error during login");
    }
};

export const verifyLogin = async (req: Request, res: Response) => {
    const { email, phoneNumber, otp } = req.body;

    // Either email or phone number must be provided
    if ((!email && !phoneNumber) || !otp) {
        return res.status(400).json(standardResponse(
            false, 
            "Either email or phone number, and OTP are required!"
        ));
    }

    try {
        let user;
        let isValidOtp = false;
        
        // Log OTP verification attempt
        console.log('\n======================================');
        console.log(`🔍 VERIFYING LOGIN OTP`);
        console.log(`📱 Identifier: ${email || phoneNumber}`);
        console.log(`📱 Received OTP: ${otp}`);

        if (email) {
            // Log for email verification
            console.log(`🔐 Verifying email OTP (check email service)`);
            // Verify email OTP
            isValidOtp = await verifyOTP(email, otp, 'login');
            user = await User.findOne({ email });
        } else {
            // Log for phone verification
            console.log(`🔐 Stored Phone OTP: ${otpStore[phoneNumber] || 'No OTP found'}`);
            // Verify phone OTP
            isValidOtp = otpStore[phoneNumber] === otp;
            if (isValidOtp) {
                delete otpStore[phoneNumber]; // Clear OTP after successful verification
            }
            user = await User.findOne({ phoneNumber });
        }
        
        console.log(`✅ OTP Valid: ${isValidOtp}`);
        console.log('======================================\n');

        if (!isValidOtp) {
            return res.status(400).json(standardResponse(
                false, 
                "Invalid or expired OTP."
            ));
        }

        if (!user) {
            return res.status(404).json(standardResponse(
                false, 
                "User not found."
            ));
        }

        // Update last login timestamp
        user.lastLoginAt = new Date();
        await user.save();

        // Generate token for authentication
        const token = jwt.sign(
            {
                id: user._id,
                phoneNumber: user.phoneNumber,
                email: user.email,
                walletAddress: user.walletAddress
            },
            config.JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Register this as a verified session
        registerVerifiedSession(token, user._id.toString());

        // Return user data and token
        return res.json(standardResponse(
            true, 
            "Login successful.",
            {
                token,
                walletAddress: user.walletAddress,
                email: user.email,
                phoneNumber: user.phoneNumber
            }
        ));
    } catch (error) {
        console.error("Error in verifyLogin:", error);
        return handleError(error, res, "Error verifying login");
    }
};

export const requestPasswordReset = async (req: Request, res: Response) => {
    // Updated for production deployment - Phone only
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
        return res.status(400).json({
            success: false,
            message: "Phone number is required",
            data: null,
            error: {
                code: "MISSING_PHONE_NUMBER",
                message: "Phone number is required for password reset"
            },
            timestamp: new Date().toISOString()
        });
    }

    try {
        const user = await User.findOne({ phoneNumber });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found with this phone number",
                data: null,
                error: {
                    code: "USER_NOT_FOUND",
                    message: "No account found with this phone number"
                },
                timestamp: new Date().toISOString()
            });
        }

        // Generate and send OTP
        const otp = generateOTP();
        otpStore[phoneNumber] = otp;
        
        // Log OTP for testing purposes
        console.log('\n======================================');
        console.log(`🔑 PASSWORD RESET OTP FOR ${phoneNumber}: ${otp}`);
        console.log('======================================\n');
        
        const otpSent = await SMSService.sendOTP(phoneNumber, otp, 'passwordReset');
        if (!otpSent) {
            return res.status(500).json({
                success: false,
                message: "Failed to send password reset OTP",
                data: null,
                error: {
                    code: "OTP_SEND_FAILED",
                    message: "Unable to send OTP to phone number"
                },
                timestamp: new Date().toISOString()
            });
        }

        return res.json({
            success: true,
            message: "Password reset OTP sent to your phone number",
            data: {
                phoneNumber: phoneNumber,
                otpExpiry: "5 minutes"
            },
            error: null,
            timestamp: new Date().toISOString()
        });

    } catch (error: any) {
        console.error('Error in requestPasswordReset:', error);
        res.status(500).json({
            success: false,
            message: "Error requesting password reset",
            data: null,
            error: {
                code: "INTERNAL_ERROR",
                message: error.message || String(error)
            },
            timestamp: new Date().toISOString()
        });
    }
};

export const resetPassword = async (req: Request, res: Response) => {
    const { phoneNumber, otp, newPassword } = req.body;

    if (!phoneNumber || !otp || !newPassword) {
        return res.status(400).json({
            success: false,
            message: "Phone number, OTP, and new password are required",
            data: null,
            error: {
                code: "MISSING_FIELDS",
                message: "All fields are required for password reset"
            },
            timestamp: new Date().toISOString()
        });
    }

    try {
        // Verify OTP for phone-based reset
        console.log('\n======================================');
        console.log(`🔍 VERIFYING PASSWORD RESET OTP FOR ${phoneNumber}`);
        console.log(`📱 Received OTP: ${otp}`);
        console.log(`🔐 Stored OTP: ${otpStore[phoneNumber] || 'No OTP found'}`);
        console.log('======================================\n');
        
        const isValid = otpStore[phoneNumber] === otp;
        if (!isValid) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired OTP",
                data: null,
                error: {
                    code: "INVALID_OTP",
                    message: "OTP is invalid or has expired"
                },
                timestamp: new Date().toISOString()
            });
        }
        
        // Clear OTP after successful verification
        delete otpStore[phoneNumber];
        
        const user = await User.findOne({ phoneNumber });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found with this phone number",
                data: null,
                error: {
                    code: "USER_NOT_FOUND",
                    message: "No account found with this phone number"
                },
                timestamp: new Date().toISOString()
            });
        }

        user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await user.save();

        res.json({
            success: true,
            message: "Password reset successful. You can now login with your new password.",
            data: {
                phoneNumber: phoneNumber
            },
            error: null,
            timestamp: new Date().toISOString()
        });

    } catch (error: any) {
        console.error('Error in resetPassword:', error);
        res.status(500).json({
            success: false,
            message: "Error resetting password",
            data: null,
            error: {
                code: "INTERNAL_ERROR",
                message: error.message || String(error)
            },
            timestamp: new Date().toISOString()
        });
    }
};

export const requestPhonePasswordReset = async (req: Request, res: Response) => {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
        return res.status(400).json({
            success: false,
            message: "Phone number is required",
            data: null,
            error: {
                code: "MISSING_PHONE_NUMBER",
                message: "Phone number is required for password reset"
            },
            timestamp: new Date().toISOString()
        });
    }

    try {
        const user = await User.findOne({ phoneNumber });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found with this phone number",
                data: null,
                error: {
                    code: "USER_NOT_FOUND",
                    message: "No account found with this phone number"
                },
                timestamp: new Date().toISOString()
            });
        }

        // Generate and send OTP
        const otp = generateOTP();
        otpStore[phoneNumber] = otp;
        
        // Log OTP for testing purposes
        console.log('\n======================================');
        console.log(`🔑 PASSWORD RESET OTP FOR ${phoneNumber}: ${otp}`);
        console.log('======================================\n');
        
        const otpSent = await SMSService.sendOTP(phoneNumber, otp, 'passwordReset');
        if (!otpSent) {
            return res.status(500).json({
                success: false,
                message: "Failed to send password reset OTP",
                data: null,
                error: {
                    code: "OTP_SEND_FAILED",
                    message: "Unable to send OTP to phone number"
                },
                timestamp: new Date().toISOString()
            });
        }

        return res.status(200).json({
            success: true,
            message: "Password reset OTP sent to your phone number",
            data: {
                phoneNumber: phoneNumber,
                otpExpiry: "5 minutes"
            },
            error: null,
            timestamp: new Date().toISOString()
        });

    } catch (error: any) {
        console.error('Error in requestPhonePasswordReset:', error);
        return res.status(500).json({
            success: false,
            message: "Error requesting password reset",
            data: null,
            error: {
                code: "INTERNAL_ERROR",
                message: error.message || "Internal server error"
            },
            timestamp: new Date().toISOString()
        });
    }
};

export const resetPhonePassword = async (req: Request, res: Response) => {
    const { phoneNumber, otp, newPassword } = req.body;

    if (!phoneNumber || !otp || !newPassword) {
        return res.status(400).json({
            success: false,
            message: "Phone number, OTP, and new password are required",
            data: null,
            error: {
                code: "MISSING_FIELDS",
                message: "All fields are required for password reset"
            },
            timestamp: new Date().toISOString()
        });
    }

    try {
        // Log OTP verification attempt
        console.log('\n======================================');
        console.log(`🔍 VERIFYING PASSWORD RESET OTP FOR ${phoneNumber}`);
        console.log(`📱 Received OTP: ${otp}`);
        console.log(`🔐 Stored OTP: ${otpStore[phoneNumber] || 'No OTP found'}`);
        console.log('======================================\n');
        
        // Verify OTP
        const isValid = otpStore[phoneNumber] === otp;
        if (!isValid) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired OTP",
                data: null,
                error: {
                    code: "INVALID_OTP",
                    message: "OTP is invalid or has expired"
                },
                timestamp: new Date().toISOString()
            });
        }
        
        // Clear OTP after successful verification
        delete otpStore[phoneNumber];

        // Find user
        const user = await User.findOne({ phoneNumber });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
                data: null,
                error: {
                    code: "USER_NOT_FOUND",
                    message: "No account found with this phone number"
                },
                timestamp: new Date().toISOString()
            });
        }

        // Update password and verify phone number
        user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
        user.isPhoneVerified = true; // Verify phone number during password reset
        await user.save();

        return res.status(200).json({
            success: true,
            message: "Password reset successful and phone number verified",
            data: {
                phoneNumber: phoneNumber,
                resetAt: new Date().toISOString(),
                phoneVerified: true
            },
            error: null,
            timestamp: new Date().toISOString()
        });

    } catch (error: any) {
        console.error('Error in resetPhonePassword:', error);
        return res.status(500).json({
            success: false,
            message: "Error resetting password",
            data: null,
            error: {
                code: "INTERNAL_ERROR",
                message: error.message || "Internal server error"
            },
            timestamp: new Date().toISOString()
        });
    }
};

export const requestAccountDeletion = async (req: Request, res: Response) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).send({ message: "Email is required!" });
    }

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).send({ message: "User not found." });
        }

        const emailSent = await sendEmail(email, 'accountDeletion');
        if (!emailSent) {
            return res.status(500).send({ message: "Failed to send account deletion confirmation email." });
        }

        res.send({ 
            message: "Account deletion confirmation code sent to your email.",
            email
        });

    } catch (error: any) {
        console.error('Error in requestAccountDeletion:', error);
        res.status(500).send({ 
            message: "Error requesting account deletion", 
            error: error.message || String(error)
        });
    }
};

export const confirmAccountDeletion = async (req: Request, res: Response) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).send({ message: "Email and OTP are required!" });
    }

    try {
        const isValid = await verifyOTP(email, otp, 'accountDeletion');
        if (!isValid) {
            return res.status(400).send({ message: "Invalid or expired OTP." });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).send({ message: "User not found." });
        }

        // Perform account deletion
        await User.deleteOne({ _id: user._id });

        res.send({ 
            message: "Your account has been successfully deleted. We're sorry to see you go!" 
        });

    } catch (error: any) {
        console.error('Error in confirmAccountDeletion:', error);
        res.status(500).send({ 
            message: "Error deleting account", 
            error: error.message || String(error)
        });
    }
};

export const logout = async (req: Request, res: Response) => {
    try {
        // Get token from authorization header
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
        
        if (token) {
            // Invalidate the session
            invalidateSession(token);
            
            console.log(`User ${req.user?._id || 'unknown'} logged out successfully`);
        }
        
        return res.json(standardResponse(
            true, 
            "Logged out successfully."
        ));
    } catch (error) {
        console.error("Error in logout:", error);
        return handleError(error, res, "Error during logout");
    }
};

export const getCurrentUser = async (req: Request, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json(standardResponse(
                false,
                'Authentication required',
                null,
                { code: 'AUTH_REQUIRED', message: 'Authentication token is required' }
            ));
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json(standardResponse(
                false,
                'User not found',
                null,
                { code: 'USER_NOT_FOUND', message: 'User not found' }
            ));
        }

        return res.status(200).json(standardResponse(
            true,
            'Current user fetched',
            {
                user: {
                    id: user._id,
                    email: user.email,
                    phoneNumber: user.phoneNumber,
                    walletAddress: user.walletAddress,
                    role: user.role
                }
            }
        ));
    } catch (error: any) {
        console.error('Error in getCurrentUser:', error);
        return handleError(error, res, 'Failed to fetch current user');
    }
};

/**
 * Google Sign In/Sign Up
 */
export const googleAuth = async (req: Request, res: Response) => {
    try {
        const { idToken } = req.body;

        if (!idToken) {
            return res.status(400).json(standardResponse(
                false,
                "Google ID token is required",
                null,
                { code: "MISSING_TOKEN", message: "Google ID token is required" }
            ));
        }

        // Verify Google token
        let googleUser: GoogleUserInfo;
        try {
            googleUser = await verifyGoogleToken(idToken);
        } catch (error) {
            return res.status(400).json(standardResponse(
                false,
                "Invalid Google token",
                null,
                { code: "INVALID_TOKEN", message: "Failed to verify Google token" }
            ));
        }

        // Check if user exists with this Google ID
        let user = await UserOptimizationService.findOrCreateUserByGoogle(googleUser.id, googleUser.email);
        
        if (user.found) {
            // Existing user - sign in or link Google account
            const existingUser = user.user;
            
            // If user exists but doesn't have Google ID, link it
            if (!existingUser.googleId) {
                await UserOptimizationService.linkGoogleToExistingUser(existingUser._id, googleUser.id);
            }
            
            existingUser.lastLogin = new Date();
            await existingUser.save();

            const token = jwt.sign(
                { id: existingUser._id, phoneNumber: existingUser.phoneNumber, email: existingUser.email },
                config.JWT_SECRET,
                { expiresIn: '7d' }
            );

            return res.json(standardResponse(
                true,
                "Google sign in successful",
                {
                    token,
                    user: {
                        id: existingUser._id,
                        email: existingUser.email,
                        phoneNumber: existingUser.phoneNumber,
                        walletAddress: existingUser.walletAddress,
                        role: existingUser.role,
                        isVerified: existingUser.isVerified,
                        isPhoneVerified: existingUser.isPhoneVerified,
                        isEmailVerified: existingUser.isEmailVerified,
                        authMethods: existingUser.authMethods,
                        hasPassword: !!existingUser.password,
                        hasPhoneNumber: !!existingUser.phoneNumber
                    }
                }
            ));
        }

        // New user - create account using optimization service
        const newUser = await UserOptimizationService.createPersonalAccount({
            email: googleUser.email,
            googleId: googleUser.id,
            authMethods: ['google']
        });

        // Create ENS subdomain for the new Google user
        try {
            console.log(`Creating ENS subdomain for Google user: ${newUser._id}`);
            const ensResult = await ensService.createUserSubdomain({
                email: googleUser.email,
                userId: newUser._id.toString(),
                walletAddress: newUser.walletAddress
            });

            if (ensResult.success && ensResult.subdomain) {
                newUser.ensSubdomain = ensResult.subdomain;
                newUser.ensSubdomainCreated = true;
                newUser.ensSubdomainTxHash = ensResult.transactionHash;
                await newUser.save();
                console.log(`✅ ENS subdomain created for Google user: ${ensResult.subdomain}`);
            } else {
                console.error(`❌ Failed to create ENS subdomain for Google user: ${ensResult.error}`);
            }
        } catch (ensError) {
            console.error('Error creating ENS subdomain for Google user:', ensError);
        }

        const token = jwt.sign(
            { id: newUser._id, phoneNumber: newUser.phoneNumber, email: newUser.email },
            config.JWT_SECRET,
            { expiresIn: '7d' }
        );

        return res.status(201).json(standardResponse(
            true,
            "Google sign up successful",
            {
                token,
                user: {
                    id: newUser._id,
                    email: newUser.email,
                    phoneNumber: newUser.phoneNumber,
                    walletAddress: newUser.walletAddress,
                    role: newUser.role,
                    isVerified: newUser.isVerified,
                    isPhoneVerified: newUser.isPhoneVerified,
                    isEmailVerified: newUser.isEmailVerified,
                    authMethods: newUser.authMethods,
                    hasPassword: false,
                    hasPhoneNumber: false
                }
            }
        ));

    } catch (error) {
        console.error("Error in Google authentication:", error);
        return handleError(error, res, "Google authentication failed");
    }
};

/**
 * Add phone number and password to Google-authenticated account
 */
export const addPhoneAndPassword = async (req: Request, res: Response) => {
    try {
        const { phoneNumber, password } = req.body;

        if (!req.user) {
            return res.status(401).json(standardResponse(
                false,
                "Authentication required",
                null,
                { code: "AUTH_REQUIRED", message: "You must be logged in to perform this action" }
            ));
        }

        if (!phoneNumber || !password) {
            return res.status(400).json(standardResponse(
                false,
                "Phone number and password are required",
                null,
                { code: "MISSING_FIELDS", message: "Both phone number and password are required" }
            ));
        }

        // Check if phone number is already taken
        const existingPhone = await User.findOne({ phoneNumber, _id: { $ne: req.user._id } });
        if (existingPhone) {
            return res.status(409).json(standardResponse(
                false,
                "Phone number already registered",
                null,
                { code: "PHONE_EXISTS", message: "This phone number is already associated with another account" }
            ));
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json(standardResponse(
                false,
                "User not found",
                null,
                { code: "USER_NOT_FOUND", message: "User account not found" }
            ));
        }

        // Send OTP for phone verification
        const otp = generateOTP();
        otpStore[phoneNumber] = otp;

        console.log(`🔑 PHONE VERIFICATION OTP FOR ${phoneNumber}: ${otp}`);

        try {
            // Send OTP via SMS using the new SMS service
            const smsSent = await SMSService.sendOTP(phoneNumber, otp, 'phone_verification');
            
            // Store temporary data for verification regardless of SMS status
            otpStore[`${phoneNumber}_password`] = password;
            otpStore[`${phoneNumber}_userId`] = user._id.toString();

            if (!smsSent) {
                console.log("⚠️ SMS failed but OTP generated for testing. Check server logs.");
                return res.json(standardResponse(
                    true,
                    "Verification OTP generated (check server logs for testing)",
                    { phoneNumber, testMode: true }
                ));
            }

            return res.json(standardResponse(
                true,
                "Verification OTP sent to your phone number",
                { phoneNumber }
            ));

        } catch (error) {
            console.error("Error sending OTP:", error);
            
            // Store temporary data for verification even if SMS completely fails
            otpStore[`${phoneNumber}_password`] = password;
            otpStore[`${phoneNumber}_userId`] = user._id.toString();
            
            console.log("⚠️ SMS service error but OTP generated for testing. Check server logs.");
            return res.json(standardResponse(
                true,
                "Verification OTP generated (check server logs for testing)",
                { phoneNumber, testMode: true }
            ));
        }

    } catch (error) {
        console.error("Error in addPhoneAndPassword:", error);
        return handleError(error, res, "Failed to add phone and password");
    }
};

/**
 * Verify phone number and complete phone/password setup
 */
export const verifyPhoneAndPassword = async (req: Request, res: Response) => {
    try {
        const { phoneNumber, otp } = req.body;

        if (!phoneNumber || !otp) {
            return res.status(400).json(standardResponse(
                false,
                "Phone number and OTP are required",
                null,
                { code: "MISSING_FIELDS", message: "Phone number and OTP are required" }
            ));
        }

        // Verify OTP
        const storedOtp = otpStore[phoneNumber];
        if (!storedOtp || storedOtp !== otp) {
            return res.status(400).json(standardResponse(
                false,
                "Invalid or expired OTP",
                null,
                { code: "INVALID_OTP", message: "The OTP provided is invalid or has expired" }
            ));
        }

        // Get stored data
        const password = otpStore[`${phoneNumber}_password`];
        const userId = otpStore[`${phoneNumber}_userId`];

        if (!password || !userId) {
            return res.status(400).json(standardResponse(
                false,
                "Verification session expired",
                null,
                { code: "SESSION_EXPIRED", message: "Please restart the phone verification process" }
            ));
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json(standardResponse(
                false,
                "User not found",
                null,
                { code: "USER_NOT_FOUND", message: "User account not found" }
            ));
        }

        // Update user with phone and password
        user.phoneNumber = phoneNumber;
        user.password = password; // Will be hashed by pre-save hook
        user.isPhoneVerified = true;
        
        if (!user.authMethods.includes('phone')) {
            user.authMethods.push('phone');
        }

        await user.save();

        // Clean up OTP store
        delete otpStore[phoneNumber];
        delete otpStore[`${phoneNumber}_password`];
        delete otpStore[`${phoneNumber}_userId`];

        return res.json(standardResponse(
            true,
            "Phone number and password added successfully",
            {
                user: {
                    id: user._id,
                    email: user.email,
                    phoneNumber: user.phoneNumber,
                    walletAddress: user.walletAddress,
                    role: user.role,
                    isVerified: user.isVerified,
                    isPhoneVerified: user.isPhoneVerified,
                    isEmailVerified: user.isEmailVerified,
                    authMethods: user.authMethods,
                    hasPassword: true,
                    hasPhoneNumber: true
                }
            }
        ));

    } catch (error) {
        console.error("Error in verifyPhoneAndPassword:", error);
        return handleError(error, res, "Phone verification failed");
    }
};

/**
 * Link Google account to existing phone/password account
 */
export const linkGoogleAccount = async (req: Request, res: Response) => {
    try {
        const { idToken } = req.body;

        if (!req.user) {
            return res.status(401).json(standardResponse(
                false,
                "Authentication required",
                null,
                { code: "AUTH_REQUIRED", message: "You must be logged in to perform this action" }
            ));
        }

        if (!idToken) {
            return res.status(400).json(standardResponse(
                false,
                "Google ID token is required",
                null,
                { code: "MISSING_TOKEN", message: "Google ID token is required" }
            ));
        }

        // Verify Google token
        let googleUser: GoogleUserInfo;
        try {
            googleUser = await verifyGoogleToken(idToken);
        } catch (error) {
            return res.status(400).json(standardResponse(
                false,
                "Invalid Google token",
                null,
                { code: "INVALID_TOKEN", message: "Failed to verify Google token" }
            ));
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json(standardResponse(
                false,
                "User not found",
                null,
                { code: "USER_NOT_FOUND", message: "User account not found" }
            ));
        }

        // Check if Google account is already linked to another user
        const existingGoogleUser = await User.findOne({ 
            googleId: googleUser.id, 
            _id: { $ne: user._id } 
        });
        
        if (existingGoogleUser) {
            return res.status(409).json(standardResponse(
                false,
                "Google account already linked to another user",
                null,
                { code: "GOOGLE_LINKED", message: "This Google account is already associated with another NexusPay account" }
            ));
        }

        // Link Google account
        user.googleId = googleUser.id;
        if (!user.email) {
            user.email = googleUser.email;
            user.isEmailVerified = true;
        }
        
        if (!user.authMethods.includes('google')) {
            user.authMethods.push('google');
        }

        await user.save();

        return res.json(standardResponse(
            true,
            "Google account linked successfully",
            {
                user: {
                    id: user._id,
                    email: user.email,
                    phoneNumber: user.phoneNumber,
                    walletAddress: user.walletAddress,
                    role: user.role,
                    isVerified: user.isVerified,
                    isPhoneVerified: user.isPhoneVerified,
                    isEmailVerified: user.isEmailVerified,
                    authMethods: user.authMethods,
                    hasPassword: !!user.password,
                    hasPhoneNumber: !!user.phoneNumber
                }
            }
        ));

    } catch (error) {
        console.error("Error linking Google account:", error);
        return handleError(error, res, "Failed to link Google account");
    }
};
