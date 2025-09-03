import { body, param, query } from 'express-validator';

/**
 * Validation rules for MPESA deposit (STK Push)
 */
export const depositValidation = [
  body('amount')
    .notEmpty()
    .withMessage('Amount is required')
    .isNumeric()
    .withMessage('Amount must be a valid number')
    .custom((value) => {
      const amount = parseFloat(value);
      if (amount < 10) {
        throw new Error('Amount must be at least 10 KES');
      }
      if (amount > 150000) {
        throw new Error('Amount must not exceed 150,000 KES (MPESA limit)');
      }
      return true;
    }),
    
  body('phone')
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(/^(?:\+254|0)(?:7|1)[0-9]{8}$/)
    .withMessage('Please provide a valid Kenyan phone number (format: +254XXXXXXXXX or 07XXXXXXXX or 01XXXXXXXX)')
];

/**
 * Validation rules for withdrawal to MPESA
 */
export const withdrawValidation = [
  body('amount')
    .notEmpty()
    .withMessage('Amount is required')
    .isNumeric()
    .withMessage('Amount must be a valid number')
    .custom((value) => {
      const amount = parseFloat(value);
      if (amount <= 0) {
        throw new Error('Amount must be greater than 0');
      }
      return true;
    }),
    
  body('phone')
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(/^(?:\+254|0)(?:7|1)[0-9]{8}$/)
    .withMessage('Please provide a valid Kenyan phone number (format: +254XXXXXXXXX or 07XXXXXXXX or 01XXXXXXXX)')
];

/**
 * Validation rules for paybill payment
 */
export const paybillValidation = [
  body('amount')
    .notEmpty()
    .withMessage('Amount is required')
    .isNumeric()
    .withMessage('Amount must be a valid number')
    .custom((value) => {
      const amount = parseFloat(value);
      if (amount <= 0) {
        throw new Error('Amount must be greater than 0');
      }
      return true;
    }),
    
  body('businessNumber')
    .notEmpty()
    .withMessage('Business number is required')
    .isNumeric()
    .withMessage('Business number must contain only digits')
    .isLength({ min: 5, max: 6 })
    .withMessage('Business number must be 5-6 digits'),
    
  body('accountNumber')
    .notEmpty()
    .withMessage('Account number is required')
    .isString()
    .withMessage('Account number must be a string')
];

/**
 * Validation rules for till payment
 */
export const tillValidation = [
  body('amount')
    .notEmpty()
    .withMessage('Amount is required')
    .isNumeric()
    .withMessage('Amount must be a valid number')
    .custom((value) => {
      const amount = parseFloat(value);
      if (amount <= 0) {
        throw new Error('Amount must be greater than 0');
      }
      return true;
    }),
    
  body('tillNumber')
    .notEmpty()
    .withMessage('Till number is required')
    .isNumeric()
    .withMessage('Till number must contain only digits')
    .isLength({ min: 5, max: 6 })
    .withMessage('Till number must be 5-6 digits')
];

/**
 * Validation rules for transaction status query
 */
export const transactionStatusValidation = [
  param('transactionId')
    .notEmpty()
    .withMessage('Transaction ID is required')
    .isUUID()
    .withMessage('Transaction ID must be a valid UUID')
];

/**
 * Validation rules for buying crypto directly
 */
export const buyCryptoValidation = [
  body('amount')
    .notEmpty()
    .withMessage('Amount in KES is required')
    .isNumeric()
    .withMessage('Amount must be a valid number')
    .custom((value) => {
      const amount = parseFloat(value);
      if (amount <= 0) {
        throw new Error('Amount must be greater than 0');
      }
      if (amount > 150000) {
        throw new Error('Amount must not exceed 150,000 KES (M-Pesa limit)');
      }
      return true;
    }),
    
  body('phone')
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(/^(?:\+254|0)(?:7|1)[0-9]{8}$/)
    .withMessage('Please provide a valid Kenyan phone number (format: +254XXXXXXXXX or 07XXXXXXXX or 01XXXXXXXX)'),
    
  body('chain')
    .notEmpty()
    .withMessage('Chain is required')
    .isString()
    .withMessage('Chain must be a string')
    .isIn(['celo', 'polygon', 'base', 'optimism', 'bnb', 'ethereum', 'arbitrum'])
    .withMessage('Unsupported blockchain selected. Choose one of: celo, polygon, base, optimism, bnb, ethereum, arbitrum'),
    
  body('tokenType')
    .notEmpty()
    .withMessage('Token type is required')
    .isString()
    .withMessage('Token type must be a string')
    .isIn(['USDC', 'USDT', 'BTC', 'ETH'])
    .withMessage('Unsupported token selected. Choose one of: USDC, USDT, BTC, ETH')
];

/**
 * Validation rules for manual M-Pesa receipt submission
 */
export const manualReceiptValidation = [
  body('mpesaReceiptNumber')
    .notEmpty()
    .withMessage('M-Pesa receipt number is required')
    .isString()
    .withMessage('M-Pesa receipt number must be a string')
    .isLength({ min: 10, max: 10 })
    .withMessage('M-Pesa receipt number must be exactly 10 characters')
    .matches(/^[A-Z0-9]{10}$/i)
    .withMessage('M-Pesa receipt number must contain only letters and numbers')
    .customSanitizer((value) => {
      // Convert to uppercase for consistency
      return value.toUpperCase();
    }),
    
  body('transactionId')
    .notEmpty()
    .withMessage('Transaction ID is required')
    .isUUID()
    .withMessage('Transaction ID must be a valid UUID')
];

/**
 * Validation rules for crypto spending (pay paybills/tills with crypto)
 */
export const validateCryptoSpending = [
  body('amount')
    .notEmpty()
    .withMessage('Fiat amount is required')
    .isNumeric()
    .withMessage('Amount must be a valid number')
    .custom((value) => {
      const amount = parseFloat(value);
      if (amount <= 0) {
        throw new Error('Amount must be greater than 0');
      }
      if (amount > 150000) {
        throw new Error('Amount must not exceed 150,000 KES (M-Pesa limit)');
      }
      return true;
    }),
    
  body('cryptoAmount')
    .optional()
    .isNumeric()
    .withMessage('Crypto amount must be a valid number')
    .custom((value) => {
      if (value !== undefined) {
        const amount = parseFloat(value);
        if (amount <= 0) {
          throw new Error('Crypto amount must be greater than 0');
        }
      }
      return true;
    }),
    
  body('targetType')
    .notEmpty()
    .withMessage('Target type is required')
    .isString()
    .withMessage('Target type must be a string')
    .isIn(['paybill', 'till'])
    .withMessage('Target type must be either "paybill" or "till"'),
    
  body('targetNumber')
    .notEmpty()
    .withMessage('Target number is required')
    .isNumeric()
    .withMessage('Target number must contain only digits')
    .isLength({ min: 5, max: 7 })
    .withMessage('Target number must be 5-7 digits'),
    
  body('accountNumber')
    .optional()
    .isString()
    .withMessage('Account number must be a string')
    .custom((value, { req }) => {
      // Account number is required for paybills
      if (req.body.targetType === 'paybill' && !value) {
        throw new Error('Account number is required for paybill payments');
      }
      return true;
    }),
    
  body('chain')
    .notEmpty()
    .withMessage('Chain is required')
    .isString()
    .withMessage('Chain must be a string')
    .isIn(['celo', 'polygon', 'base', 'optimism', 'bnb', 'ethereum', 'arbitrum'])
    .withMessage('Unsupported blockchain selected. Choose one of: celo, polygon, base, optimism, bnb, ethereum, arbitrum'),
    
  body('tokenType')
    .notEmpty()
    .withMessage('Token type is required')
    .isString()
    .withMessage('Token type must be a string')
    .isIn(['USDC', 'USDT', 'BTC', 'ETH'])
    .withMessage('Unsupported token selected. Choose one of: USDC, USDT, BTC, ETH'),
    
  body('description')
    .optional()
    .isString()
    .withMessage('Description must be a string')
    .isLength({ max: 100 })
    .withMessage('Description must not exceed 100 characters')
]; 