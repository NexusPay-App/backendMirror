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
                    return res.status(500).json(standardResponse(
                        false,
                        "Failed to send OTP via SMS, but check server logs for OTP code",
                        { phoneNumber }
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
                return handleError(error, res, "Failed to send login verification code. Please check server logs for OTP.");
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
