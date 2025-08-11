// src/controllers/authController.ts
import { User } from '../models/models';
import bcrypt from 'bcrypt';
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { createAccount, generateOTP, otpStore, africastalking, SALT_ROUNDS } from "../services/auth";
import { handleError, standardResponse } from "../services/utils";
import config from '../config/env';
import { sendEmail, verifyOTP } from '../services/email';
import { registerVerifiedSession, invalidateSession } from '../middleware/strictAuthMiddleware';
import { verifyGoogleToken, GoogleUserInfo } from '../services/googleAuth';

export const initiateRegisterUser = async (req: Request, res: Response) => {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
        return res.status(400).json(standardResponse(false, "Phone number is required!"));
    }

    let existingUser;
    try {
        existingUser = await User.findOne({ phoneNumber: phoneNumber });
    } catch (error) {
        console.error("❌ Error checking existing user:", error);
        return handleError(error, res, "Failed to check existing user");
    }

    if (existingUser) {
        return res.status(409).json(standardResponse(false, "Phone number already registered!"));
    }

    const otp = generateOTP();
    otpStore[phoneNumber] = otp;

    // Log OTP for testing purposes
    console.log('\n======================================');
    console.log(`🔑 REGISTRATION OTP FOR ${phoneNumber}: ${otp}`);
    console.log('======================================\n');

    console.log(`✅ OTP generated for ${phoneNumber}: ${otp}`);

    try {
        const smsResponse: any = await africastalking.SMS.send({
            to: [phoneNumber],
            message: `Your verification code is: ${otp}`,
            from: 'NEXUSPAY'
        });

        console.log("📨 Full SMS API Response:", JSON.stringify(smsResponse, null, 2));

        const recipients = smsResponse?.SMSMessageData?.Recipients || smsResponse?.data?.SMSMessageData?.Recipients || [];

        if (recipients.length === 0) {
            console.error("❌ No recipients found in the response:", smsResponse);
            return res.status(400).json(standardResponse(false, "Failed to send OTP. No recipients found."));
        }

        const recipient = recipients[0];
        if (recipient.status !== "Success") {
            console.error(`❌ SMS sending failed for ${phoneNumber}:`, recipient);
            return res.status(400).json(standardResponse(
                false, 
                "Failed to send OTP. Check your number and try again.",
                null,
                recipient
            ));
        }

        return res.json(standardResponse(true, "OTP sent successfully. Please verify to complete registration."));

    } catch (error) {
        console.error("❌ Error sending OTP:", error);
        return handleError(error, res, "Failed to send OTP");
    }
};

export const registerUser = async (req: Request, res: Response) => {
    const { phoneNumber, email, password, verifyWith } = req.body;

    // Require at least one contact method
    if ((!phoneNumber && !email) || !password) {
        return res.status(400).json(standardResponse(false, "At least one contact method (phone number or email) and password are required!"));
    }

    // Determine verification method: phone, email, or both
    const verificationMethod = verifyWith || (email ? 'email' : 'phone');
    if (verificationMethod === 'email' && !email) {
        return res.status(400).json(standardResponse(false, "Email is required for email verification!"));
    }
    if (verificationMethod === 'phone' && !phoneNumber) {
        return res.status(400).json(standardResponse(false, "Phone number is required for phone verification!"));
    }

    try {
        // Check if user already exists
        const existingUserQuery: any = { $or: [] };
        if (phoneNumber) existingUserQuery.$or.push({ phoneNumber });
        if (email) existingUserQuery.$or.push({ email });

        const existingUser = await User.findOne(existingUserQuery);
        if (existingUser) {
            const fieldTaken = existingUser.phoneNumber === phoneNumber ? 'phone number' : 'email';
            return res.status(400).json(standardResponse(
                false,
                `User with this ${fieldTaken} already exists.`
            ));
        }

        // Create unified account
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        const userSmartAccount = await createAccount();
        const { pk, walletAddress } = userSmartAccount;

        // Send verification based on the chosen method
        let verificationSent = false;

        if (verificationMethod === 'email' || verificationMethod === 'both') {
            const emailSent = await sendEmail(email, 'registration');
            if (!emailSent && verificationMethod === 'email') {
                return res.status(500).json(standardResponse(false, "Failed to send verification email."));
            }
            verificationSent = verificationSent || emailSent;
        }

        if (verificationMethod === 'phone' || verificationMethod === 'both') {
            const otp = generateOTP();
            otpStore[phoneNumber] = otp;
            
            // Log OTP for testing purposes
            console.log('\n======================================');
            console.log(`🔑 VERIFY PHONE OTP FOR ${phoneNumber}: ${otp}`);
            console.log('======================================\n');
            
            try {
                const smsResponse: any = await africastalking.SMS.send({
                    to: [phoneNumber],
                    message: `Your NexusPay verification code is: ${otp}`,
                    from: 'NEXUSPAY'
                });
                
                const recipients = smsResponse?.SMSMessageData?.Recipients || smsResponse?.data?.SMSMessageData?.Recipients || [];
                const recipient = recipients[0];
                
                if (recipients.length === 0 || recipient.status !== "Success") {
                    if (verificationMethod === 'phone') {
                        return res.status(400).json(standardResponse(
                            false,
                            "Failed to send OTP. Check your number and try again."
                        ));
                    }
                } else {
                    verificationSent = true;
                }
            } catch (error) {
                console.error("❌ Error sending SMS OTP:", error);
                if (verificationMethod === 'phone') {
                    return handleError(error, res, "Failed to send SMS OTP");
                }
            }
        }

        if (!verificationSent) {
            return res.status(500).json(standardResponse(false, "Failed to send verification. Please try again later."));
        }

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
        return res.status(400).json(standardResponse(
            false, 
            "Either email or phone number, and password are required!"
        ));
    }

    try {
        // Find user by either email or phone number
        const query = email ? { email } : { phoneNumber };
        console.log(`🔍 Looking up user with query:`, query);
        
        const user = await User.findOne(query);
        
        if (!user) {
            console.log('❌ User not found');
            return res.status(401).json(standardResponse(
                false, 
                "Invalid credentials."
            ));
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
            return res.status(401).json(standardResponse(
                false, 
                "This account was created with Google. Please sign in with Google or add a password first."
            ));
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password);
        console.log(`🔑 Password valid: ${isValidPassword}`);
        
        if (!isValidPassword) {
            console.log('❌ Invalid password');
            return res.status(401).json(standardResponse(
                false, 
                "Invalid credentials."
            ));
        }

        // Verify email or phone is verified
        if (email && !user.isEmailVerified) {
            console.log('❌ Email not verified');
            return res.status(401).json(standardResponse(
                false, 
                "Please verify your email first."
            ));
        }
        
        if (phoneNumber && !user.isPhoneVerified) {
            console.log('❌ Phone not verified');
            return res.status(401).json(standardResponse(
                false, 
                "Please verify your phone number first."
            ));
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
                const smsResponse: any = await africastalking.SMS.send({
                    to: [phoneNumber],
                    message: `Your NexusPay login verification code is: ${otp}`,
                    from: 'NEXUSPAY'
                });
                
                const recipients = smsResponse?.SMSMessageData?.Recipients || smsResponse?.data?.SMSMessageData?.Recipients || [];
                const recipient = recipients[0];
                
                if (recipients.length === 0 || recipient.status !== "Success") {
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
    const { email } = req.body;

    if (!email) {
        return res.status(400).send({ message: "Email is required!" });
    }

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).send({ message: "User not found." });
        }

        const emailSent = await sendEmail(email, 'passwordReset');
        if (!emailSent) {
            return res.status(500).send({ message: "Failed to send password reset email." });
        }

        res.send({ 
            message: "Password reset instructions sent to your email.",
            email
        });

    } catch (error: any) {
        console.error('Error in requestPasswordReset:', error);
        res.status(500).send({ 
            message: "Error requesting password reset", 
            error: error.message || String(error)
        });
    }
};

export const resetPassword = async (req: Request, res: Response) => {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
        return res.status(400).send({ message: "Email, OTP, and new password are required!" });
    }

    try {
        const isValid = await verifyOTP(email, otp, 'passwordReset');
        if (!isValid) {
            return res.status(400).send({ message: "Invalid or expired OTP." });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).send({ message: "User not found." });
        }

        user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await user.save();

        res.send({ message: "Password reset successful. You can now login with your new password." });

    } catch (error: any) {
        console.error('Error in resetPassword:', error);
        res.status(500).send({ 
            message: "Error resetting password", 
            error: error.message || String(error)
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
        let user = await User.findOne({ googleId: googleUser.id });

        if (user) {
            // Existing user - sign in
            user.lastLogin = new Date();
            await user.save();

            const token = jwt.sign(
                { id: user._id, phoneNumber: user.phoneNumber, email: user.email },
                config.JWT_SECRET,
                { expiresIn: '7d' }
            );

            return res.json(standardResponse(
                true,
                "Google sign in successful",
                {
                    token,
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
        }

        // Check if user exists with this email but no Google ID
        const existingEmailUser = await User.findOne({ email: googleUser.email });
        if (existingEmailUser) {
            // Link Google account to existing user
            existingEmailUser.googleId = googleUser.id;
            if (!existingEmailUser.authMethods.includes('google')) {
                existingEmailUser.authMethods.push('google');
            }
            existingEmailUser.isEmailVerified = true;
            existingEmailUser.lastLogin = new Date();
            await existingEmailUser.save();

            const token = jwt.sign(
                { id: existingEmailUser._id, phoneNumber: existingEmailUser.phoneNumber, email: existingEmailUser.email },
                config.JWT_SECRET,
                { expiresIn: '7d' }
            );

            return res.json(standardResponse(
                true,
                "Google account linked successfully",
                {
                    token,
                    user: {
                        id: existingEmailUser._id,
                        email: existingEmailUser.email,
                        phoneNumber: existingEmailUser.phoneNumber,
                        walletAddress: existingEmailUser.walletAddress,
                        role: existingEmailUser.role,
                        isVerified: existingEmailUser.isVerified,
                        isPhoneVerified: existingEmailUser.isPhoneVerified,
                        isEmailVerified: existingEmailUser.isEmailVerified,
                        authMethods: existingEmailUser.authMethods,
                        hasPassword: !!existingEmailUser.password,
                        hasPhoneNumber: !!existingEmailUser.phoneNumber
                    }
                }
            ));
        }

        // New user - create account
        const { walletAddress, pk: privateKey } = await createAccount();

        const newUser = new User({
            email: googleUser.email,
            googleId: googleUser.id,
            walletAddress,
            privateKey,
            authMethods: ['google'],
            isEmailVerified: true,
            isVerified: true,
            role: 'user',
            lastLogin: new Date()
        });

        await newUser.save();

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
            const smsResponse: any = await africastalking.SMS.send({
                to: [phoneNumber],
                message: `Your NexusPay phone verification code is: ${otp}`,
                from: 'NEXUSPAY'
            });

            const recipients = smsResponse?.SMSMessageData?.Recipients || smsResponse?.data?.SMSMessageData?.Recipients || [];
            let smsSuccess = recipients.length > 0 && recipients[0].status === "Success";
            
            // Store temporary data for verification regardless of SMS status
            otpStore[`${phoneNumber}_password`] = password;
            otpStore[`${phoneNumber}_userId`] = user._id.toString();

            if (!smsSuccess) {
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
