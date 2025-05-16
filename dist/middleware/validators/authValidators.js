"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.phoneLoginVerifyValidation = exports.phoneOtpVerifyValidation = exports.phoneOtpRequestValidation = exports.passwordResetValidation = exports.passwordResetRequestValidation = exports.verifyPhoneValidation = exports.verifyEmailValidation = exports.loginValidation = exports.registerValidation = void 0;
const express_validator_1 = require("express-validator");
exports.registerValidation = [
    // Email validation if provided
    (0, express_validator_1.body)('email')
        .optional()
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),
    // Phone number validation if provided
    (0, express_validator_1.body)('phoneNumber')
        .optional()
        .matches(/^\+[1-9]\d{1,14}$/)
        .withMessage('Please provide a valid phone number in E.164 format (e.g., +254712345678)'),
    // Require at least one contact method
    (0, express_validator_1.body)()
        .custom((value, { req }) => {
        if (!req.body.email && !req.body.phoneNumber) {
            throw new Error('At least one contact method (email or phone number) is required');
        }
        return true;
    }),
    // Password validation
    (0, express_validator_1.body)('password')
        .notEmpty()
        .withMessage('Password is required')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
    // Verify with validation
    (0, express_validator_1.body)('verifyWith')
        .optional()
        .isIn(['email', 'phone', 'both'])
        .withMessage('Verification method must be email, phone, or both')
];
exports.loginValidation = [
    (0, express_validator_1.body)()
        .custom((value, { req }) => {
        // Check that at least one login identifier is provided
        if (!req.body.email && !req.body.phoneNumber) {
            throw new Error('Either email or phone number is required');
        }
        return true;
    }),
    // Email validation if provided
    (0, express_validator_1.body)('email')
        .optional()
        .isEmail()
        .withMessage('Please provide a valid email address'),
    // Phone number validation if provided
    (0, express_validator_1.body)('phoneNumber')
        .optional()
        .matches(/^\+[1-9]\d{1,14}$/)
        .withMessage('Please provide a valid phone number in E.164 format'),
    (0, express_validator_1.body)('password')
        .notEmpty()
        .withMessage('Password is required')
];
exports.verifyEmailValidation = [
    (0, express_validator_1.body)('email')
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Please provide a valid email address'),
    (0, express_validator_1.body)('otp')
        .notEmpty()
        .withMessage('OTP is required')
        .isLength({ min: 6, max: 6 })
        .withMessage('OTP must be 6 digits')
        .isNumeric()
        .withMessage('OTP must contain only numbers')
];
exports.verifyPhoneValidation = [
    (0, express_validator_1.body)('phoneNumber')
        .notEmpty()
        .withMessage('Phone number is required')
        .matches(/^\+[1-9]\d{1,14}$/)
        .withMessage('Please provide a valid phone number in E.164 format'),
    (0, express_validator_1.body)('otp')
        .notEmpty()
        .withMessage('OTP is required')
        .isLength({ min: 6, max: 6 })
        .withMessage('OTP must be 6 digits')
        .isNumeric()
        .withMessage('OTP must contain only numbers')
];
exports.passwordResetRequestValidation = [
    (0, express_validator_1.body)('email')
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Please provide a valid email address')
];
exports.passwordResetValidation = [
    (0, express_validator_1.body)('email')
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Please provide a valid email address'),
    (0, express_validator_1.body)('otp')
        .notEmpty()
        .withMessage('OTP is required')
        .isLength({ min: 6, max: 6 })
        .withMessage('OTP must be 6 digits')
        .isNumeric()
        .withMessage('OTP must contain only numbers'),
    (0, express_validator_1.body)('newPassword')
        .notEmpty()
        .withMessage('New password is required')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number')
];
exports.phoneOtpRequestValidation = [
    (0, express_validator_1.body)('phone')
        .notEmpty()
        .withMessage('Phone number is required')
        .matches(/^\+[1-9]\d{1,14}$/)
        .withMessage('Please provide a valid phone number in E.164 format')
];
exports.phoneOtpVerifyValidation = [
    (0, express_validator_1.body)('phone')
        .notEmpty()
        .withMessage('Phone number is required')
        .matches(/^\+[1-9]\d{1,14}$/)
        .withMessage('Please provide a valid phone number in E.164 format'),
    (0, express_validator_1.body)('otp')
        .notEmpty()
        .withMessage('OTP is required')
        .isLength({ min: 6, max: 6 })
        .withMessage('OTP must be 6 digits')
        .isNumeric()
        .withMessage('OTP must contain only numbers')
];
exports.phoneLoginVerifyValidation = [
    (0, express_validator_1.body)('phoneNumber')
        .notEmpty()
        .withMessage('Phone number is required')
        .matches(/^\+[1-9]\d{1,14}$/)
        .withMessage('Please provide a valid phone number in E.164 format'),
    (0, express_validator_1.body)('otp')
        .notEmpty()
        .withMessage('OTP is required')
        .isLength({ min: 6, max: 6 })
        .withMessage('OTP must be 6 digits')
        .isNumeric()
        .withMessage('OTP must contain only numbers')
];
