import { body } from 'express-validator';

export const googleAuthValidation = [
    body('idToken')
        .notEmpty()
        .withMessage('Google ID token is required')
        .isLength({ min: 10 })
        .withMessage('Invalid Google ID token format')
];

export const addPhonePasswordValidation = [
    body('phoneNumber')
        .notEmpty()
        .withMessage('Phone number is required')
        .matches(/^\+254[0-9]\d{8}$/)
        .withMessage('Phone number must be a valid Kenyan number (e.g., +254712345678)'),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number')
];

export const verifyPhonePasswordValidation = [
    body('phoneNumber')
        .notEmpty()
        .withMessage('Phone number is required')
        .matches(/^\+254[17]\d{8}$/)
        .withMessage('Phone number must be a valid Kenyan number starting with +254'),
    body('otp')
        .notEmpty()
        .withMessage('OTP is required')
        .isLength({ min: 4, max: 6 })
        .withMessage('OTP must be 4-6 characters long')
        .isNumeric()
        .withMessage('OTP must contain only numbers')
];

export const linkGoogleValidation = [
    body('idToken')
        .notEmpty()
        .withMessage('Google ID token is required')
        .isLength({ min: 10 })
        .withMessage('Invalid Google ID token format')
];