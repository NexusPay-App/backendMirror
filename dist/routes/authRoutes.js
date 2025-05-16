"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authController_1 = require("../controllers/authController");
const validation_1 = require("../middleware/validation");
const authValidators_1 = require("../middleware/validators/authValidators");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Login routes
router.post('/login', (0, validation_1.validate)(authValidators_1.loginValidation), authController_1.login);
router.post('/login/verify', (0, validation_1.validate)(authValidators_1.phoneLoginVerifyValidation), authController_1.verifyLogin);
// Phone OTP routes (for standalone OTP authentication)
router.post('/otp', (0, validation_1.validate)(authValidators_1.phoneOtpRequestValidation), async (req, res) => {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).json({
            success: false,
            message: "Phone number is required",
            data: null,
            error: {
                code: "MISSING_PHONE",
                message: "Phone number is required"
            }
        });
    }
    try {
        const { generateOTP, otpStore, africastalking } = require('../services/auth');
        const User = require('../models/models').User;
        // Check if user exists
        const user = await User.findOne({ phoneNumber: phone });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
                data: null,
                error: {
                    code: "USER_NOT_FOUND",
                    message: "No user found with this phone number"
                }
            });
        }
        // Generate and store OTP
        const otp = generateOTP();
        otpStore[phone] = otp;
        // Log OTP for testing purposes
        console.log('\n======================================');
        console.log(`🔑 OTP FOR ${phone}: ${otp}`);
        console.log('======================================\n');
        // Send OTP via SMS
        try {
            const smsResponse = await africastalking.SMS.send({
                to: [phone],
                message: `Your NexusPay verification code is: ${otp}`,
                from: 'NEXUSPAY'
            });
            const recipients = smsResponse?.SMSMessageData?.Recipients || smsResponse?.data?.SMSMessageData?.Recipients || [];
            const recipient = recipients[0];
            if (recipients.length === 0 || recipient.status !== "Success") {
                console.log(`❌ SMS sending failed but OTP was generated: ${otp}`);
                return res.status(500).json({
                    success: false,
                    message: "Failed to send OTP via SMS, but check server logs for OTP code",
                    data: null,
                    error: {
                        code: "SMS_FAILED",
                        message: "Failed to send SMS. Please check server logs for OTP."
                    }
                });
            }
            return res.json({
                success: true,
                message: "OTP sent successfully",
                data: {
                    phone
                }
            });
        }
        catch (error) {
            console.error('Error sending SMS:', error);
            console.log(`❌ SMS sending error but OTP was generated: ${otp}`);
            return res.status(500).json({
                success: false,
                message: "Failed to send OTP via SMS, but check server logs for OTP code",
                data: null,
                error: {
                    code: "SMS_ERROR",
                    message: "Error sending SMS. Please check server logs for OTP."
                }
            });
        }
    }
    catch (error) {
        console.error('Error generating OTP:', error);
        return res.status(500).json({
            success: false,
            message: "Server error",
            data: null,
            error: {
                code: "SERVER_ERROR",
                message: "An unexpected error occurred"
            }
        });
    }
});
router.post('/verify-otp', (0, validation_1.validate)(authValidators_1.phoneOtpVerifyValidation), async (req, res) => {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
        return res.status(400).json({
            success: false,
            message: "Phone number and OTP are required",
            data: null,
            error: {
                code: "MISSING_FIELDS",
                message: "Phone number and OTP are required"
            }
        });
    }
    try {
        const { otpStore } = require('../services/auth');
        const User = require('../models/models').User;
        const jwt = require('jsonwebtoken');
        const config = require('../config/env').default;
        // Log OTP verification attempt
        console.log('\n======================================');
        console.log(`🔍 STANDALONE VERIFYING OTP FOR ${phone}`);
        console.log(`📱 Received OTP: ${otp}`);
        console.log(`🔐 Stored OTP: ${otpStore[phone] || 'No OTP found'}`);
        console.log('======================================\n');
        // Verify OTP
        if (!otpStore[phone] || otpStore[phone] !== otp) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired OTP",
                data: null,
                error: {
                    code: "INVALID_OTP",
                    message: "The provided OTP is invalid or has expired"
                }
            });
        }
        // Clear OTP after verification
        delete otpStore[phone];
        // Find user and generate token
        const user = await User.findOne({ phoneNumber: phone });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
                data: null,
                error: {
                    code: "USER_NOT_FOUND",
                    message: "No user found with this phone number"
                }
            });
        }
        // Update last login timestamp
        user.lastLoginAt = new Date();
        await user.save();
        // Generate JWT token
        const token = jwt.sign({
            id: user._id,
            email: user.email,
            phoneNumber: user.phoneNumber,
            walletAddress: user.walletAddress
        }, config.JWT_SECRET, { expiresIn: '1h' });
        return res.json({
            success: true,
            message: "Login successful",
            data: {
                token,
                walletAddress: user.walletAddress,
                email: user.email,
                phoneNumber: user.phoneNumber
            }
        });
    }
    catch (error) {
        console.error('Error verifying OTP:', error);
        return res.status(500).json({
            success: false,
            message: "Server error",
            data: null,
            error: {
                code: "SERVER_ERROR",
                message: "An unexpected error occurred"
            }
        });
    }
});
// Registration routes
router.post('/register/initiate', authController_1.initiateRegisterUser);
router.post('/register', (0, validation_1.validate)(authValidators_1.registerValidation), authController_1.registerUser);
router.post('/register/verify/email', (0, validation_1.validate)(authValidators_1.verifyEmailValidation), authController_1.verifyEmail);
router.post('/register/verify/phone', (0, validation_1.validate)(authValidators_1.verifyPhoneValidation), authController_1.verifyPhone);
// Password reset routes
router.post('/password-reset/request', (0, validation_1.validate)(authValidators_1.passwordResetRequestValidation), authController_1.requestPasswordReset);
router.post('/password-reset', (0, validation_1.validate)(authValidators_1.passwordResetValidation), authController_1.resetPassword);
// Account deletion routes
router.post('/account-deletion/request', auth_1.authenticate, authController_1.requestAccountDeletion);
router.post('/account-deletion/confirm', auth_1.authenticate, authController_1.confirmAccountDeletion);
exports.default = router;
