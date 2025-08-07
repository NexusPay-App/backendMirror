import { body, query, param } from 'express-validator';
import { ethers } from 'ethers';

/**
 * Validate the send token request
 */
export const sendTokenValidation = [
  body('recipientIdentifier')
    .notEmpty()
    .withMessage('Recipient identifier is required')
    .custom((value) => {
      // Check if it's a valid wallet address, phone number, or email
      const isPhoneNumber = /^\+[1-9]\d{1,14}$/.test(value);
      const isAddress = ethers.utils.isAddress(value);
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      
      if (!isPhoneNumber && !isAddress && !isEmail) {
        throw new Error('Recipient must be a valid wallet address, phone number in E.164 format, or email address');
      }
      
      return true;
    }),
    
  body('amount')
    .notEmpty()
    .withMessage('Amount is required')
    .isNumeric()
    .withMessage('Amount must be a valid number')
    .custom((value) => {
      // Ensure amount is positive
      if (parseFloat(value) <= 0) {
        throw new Error('Amount must be greater than 0');
      }
      return true;
    }),
    
  body('senderAddress')
    .notEmpty()
    .withMessage('Sender address is required')
    .custom((value) => {
      if (!ethers.utils.isAddress(value)) {
        throw new Error('Sender address must be a valid Ethereum address');
      }
      return true;
    }),
    
  body('chain')
    .notEmpty()
    .withMessage('Chain is required')
    .isIn(['arbitrum', 'celo'])
    .withMessage('Chain must be either "arbitrum" or "celo"')
];

/**
 * Validate the merchant payment request
 */
export const payMerchantValidation = [
  body('senderAddress')
    .notEmpty()
    .withMessage('Sender address is required')
    .custom((value) => {
      if (!ethers.utils.isAddress(value)) {
        throw new Error('Sender address must be a valid Ethereum address');
      }
      return true;
    }),
    
  body('merchantId')
    .notEmpty()
    .withMessage('Merchant ID is required')
    .matches(/^NX-\d{10}$/)
    .withMessage('Invalid merchant ID format'),
    
  body('amount')
    .notEmpty()
    .withMessage('Amount is required')
    .isNumeric()
    .withMessage('Amount must be a valid number')
    .custom((value) => {
      if (parseFloat(value) <= 0) {
        throw new Error('Amount must be greater than 0');
      }
      return true;
    }),
    
  body('chainName')
    .notEmpty()
    .withMessage('Chain name is required')
    .isIn(['arbitrum', 'celo'])
    .withMessage('Chain must be either "arbitrum" or "celo"')
];

/**
 * Validate token transfer events query
 */
export const tokenTransferEventsValidation = [
  query('address')
    .notEmpty()
    .withMessage('Wallet address is required')
    .custom((value) => {
      if (!ethers.utils.isAddress(value)) {
        throw new Error('Address must be a valid Ethereum address');
      }
      return true;
    }),
    
  query('chain')
    .notEmpty()
    .withMessage('Chain is required')
    .isIn(['arbitrum', 'celo'])
    .withMessage('Chain must be either "arbitrum" or "celo"'),
    
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
    
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
]; 