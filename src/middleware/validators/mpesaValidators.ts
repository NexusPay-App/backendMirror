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
  body('cryptoAmount')
    .notEmpty()
    .withMessage('Crypto amount is required')
    .isNumeric()
    .withMessage('Crypto amount must be a valid number')
    .custom((value) => {
      const amount = parseFloat(value);
      if (amount <= 0) {
        throw new Error('Crypto amount must be greater than 0');
      }
      // 150,000 KES divided by approx. exchange rate of 130 ≈ 1,150 USDC as max amount
      if (amount > 1150) {
        throw new Error('Crypto amount exceeds maximum allowed (MPESA limit)');
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