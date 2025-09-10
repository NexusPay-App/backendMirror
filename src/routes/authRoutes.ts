import express from 'express';
import { 
  requestPasswordReset, 
  resetPassword, 
  requestPhonePasswordReset,
  resetPhonePassword,
  login, 
  registerUser, 
  initiateRegisterUser, 
  verifyEmail, 
  verifyPhone, 
  verifyLogin, 
  requestAccountDeletion, 
  confirmAccountDeletion,
  logout,
  googleAuth,
  addPhoneAndPassword,
  verifyPhoneAndPassword,
  linkGoogleAccount,
  getCurrentUser
} from '../controllers/authController';
import { validate } from '../middleware/validation';
import {
  registerValidation,
  loginValidation,
  verifyEmailValidation,
  verifyPhoneValidation,
  passwordResetRequestValidation,
  passwordResetValidation,
  phonePasswordResetRequestValidation,
  phonePasswordResetValidation,
  phoneOtpRequestValidation,
  phoneOtpVerifyValidation,
  phoneLoginVerifyValidation
} from '../middleware/validators/authValidators';
import {
  googleAuthValidation,
  addPhonePasswordValidation,
  verifyPhonePasswordValidation,
  linkGoogleValidation
} from '../middleware/validators/googleAuthValidators';
import { authenticate } from '../middleware/auth';
import { registerVerifiedSession } from '../middleware/strictAuthMiddleware';
import { enforceStrictAuth } from '../middleware/strictAuthMiddleware';

const router = express.Router();

// Login routes
router.post('/login', validate(loginValidation), login);
router.post('/login/verify', validate(phoneLoginVerifyValidation), verifyLogin);
router.get('/me', authenticate, getCurrentUser);
router.post('/logout', enforceStrictAuth, logout);

// Phone OTP routes (for standalone OTP authentication)
router.post('/otp', validate(phoneOtpRequestValidation), async (req, res) => {
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
    const { generateOTP, otpStore } = require('../services/auth');
const { SMSService } = require('../services/smsService');
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
      // Send OTP via SMS using the new SMS service
      const smsSent = await SMSService.sendOTP(phone, otp, 'verification');
      
      if (!smsSent) {
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
    } catch (error) {
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
  } catch (error) {
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

router.post('/verify-otp', validate(phoneOtpVerifyValidation), async (req, res) => {
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
    const token = jwt.sign(
      { 
        id: user._id,
        email: user.email,
        phoneNumber: user.phoneNumber,
        walletAddress: user.walletAddress 
      },
      config.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // Register this as a verified session
    registerVerifiedSession(token, user._id.toString());
    
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
  } catch (error) {
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
router.post('/register/initiate', initiateRegisterUser);
router.post('/register', validate(registerValidation), registerUser);
router.post('/register/verify/email', validate(verifyEmailValidation), verifyEmail);
router.post('/register/verify/phone', validate(verifyPhoneValidation), verifyPhone);

// Password reset routes
router.post('/password-reset/request', validate(passwordResetRequestValidation), requestPasswordReset);
router.post('/password-reset', validate(passwordResetValidation), resetPassword);

// Phone-based password reset routes
router.post('/password-reset/phone/request', validate(phonePasswordResetRequestValidation), requestPhonePasswordReset);
router.post('/password-reset/phone', validate(phonePasswordResetValidation), resetPhonePassword);

// Account deletion routes
router.post('/account-deletion/request', authenticate, requestAccountDeletion);
router.post('/account-deletion/confirm', authenticate, confirmAccountDeletion);

// Google authentication routes
router.post('/google', validate(googleAuthValidation), googleAuth);
router.post('/google/link', authenticate, validate(linkGoogleValidation), linkGoogleAccount);

// Account settings routes (for adding phone/password after Google signup)
router.post('/settings/add-phone-password', authenticate, validate(addPhonePasswordValidation), addPhoneAndPassword);
router.post('/settings/verify-phone-password', validate(verifyPhonePasswordValidation), verifyPhoneAndPassword);

// Google configuration endpoint for frontend
router.get('/google-config', (req, res) => {
  const config = require('../config/env').default;
  res.status(200).json({
    success: true,
    message: 'Google configuration retrieved',
    data: {
      clientId: config.GOOGLE_CLIENT_ID,
      redirectUri: config.GOOGLE_REDIRECT_URI
    },
    timestamp: new Date().toISOString()
  });
});

export default router;
