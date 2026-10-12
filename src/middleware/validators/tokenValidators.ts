import { paymentChains } from '../../config/chains';
import { getTokenConfig } from '../../config/tokens';
import { parseAmount } from '../../utils/amounts';
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
      const isAddress = ethers.isAddress(value);
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      
      if (!isPhoneNumber && !isAddress && !isEmail) {
        throw new Error('Recipient must be a valid wallet address, phone number in E.164 format, or email address');
      }
      
      return true;
    }),
    
  body('tokenSymbol').optional().custom((value, { req }) => { if (!getTokenConfig(req.body.chain || req.body.chainName, value)) throw new Error('Unsupported asset on selected network'); return true; }),
  body('amount')
    .notEmpty()
    .withMessage('Amount is required')
    .isNumeric()
    .withMessage('Amount must be a valid number')
    .custom((value, { req }) => {
      const token = getTokenConfig(req.body.chain, req.body.tokenSymbol || "USDC");
      if (!token) throw new Error("Unsupported asset");
      parseAmount(value, token.decimals);
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
      if (!ethers.isAddress(value)) {
        throw new Error('Sender address must be a valid Ethereum address');
      }
      return true;
    }),
    
  body('chain')
    .notEmpty()
    .withMessage('Chain is required')
    .isIn(paymentChains)
    .withMessage('Unsupported payment chain')
];

/**
 * Validate the merchant payment request
 */
export const payMerchantValidation = [
  body('senderAddress')
    .notEmpty()
    .withMessage('Sender address is required')
    .custom((value) => {
      if (!ethers.isAddress(value)) {
        throw new Error('Sender address must be a valid Ethereum address');
      }
      return true;
    }),
    
  body('merchantId')
    .notEmpty()
    .withMessage('Merchant ID is required')
    .matches(/^NX-\d{5,10}$/)
    .withMessage('Invalid merchant ID format'),
    
  body('tokenSymbol').optional().custom((value, { req }) => { if (!getTokenConfig(req.body.chain || req.body.chainName, value)) throw new Error('Unsupported asset on selected network'); return true; }),
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
    .isIn(paymentChains)
    .withMessage('Unsupported payment chain')
];

/**
 * Validate token transfer events query
 */
export const tokenTransferEventsValidation = [
  query('address')
    .notEmpty()
    .withMessage('Wallet address is required')
    .custom((value) => {
      if (!ethers.isAddress(value)) {
        throw new Error('Address must be a valid Ethereum address');
      }
      return true;
    }),
    
  query('chain')
    .notEmpty()
    .withMessage('Chain is required')
    .isIn(paymentChains)
    .withMessage('Unsupported payment chain'),
    
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
    
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
]; 