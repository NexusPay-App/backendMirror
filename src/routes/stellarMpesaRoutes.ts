import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { body, query, param } from 'express-validator';
import {
  initiateDeposit,
  initiateWithdrawal,
  getTransactionStatus,
  getTransactionHistory,
  getExchangeRates,
  convertKesToAsset,
  convertAssetToKes,
  handleMpesaCallback
} from '../controllers/stellarMpesaController';

const router = Router();

/**
 * @route   POST /api/stellar-mpesa/deposit
 * @desc    Initiate Stellar deposit via MPESA
 * @access  Private
 */
router.post('/deposit', authenticate, [
  body('phoneNumber')
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(/^254[0-9]{9}$/)
    .withMessage('Phone number must be in format 254XXXXXXXXX'),
  body('amountKES')
    .notEmpty()
    .withMessage('Amount in KES is required')
    .isNumeric()
    .withMessage('Amount must be a number')
    .custom((value) => {
      if (parseFloat(value) < 1) {
        throw new Error('Amount must be at least 1 KES');
      }
      if (parseFloat(value) > 150000) {
        throw new Error('Amount cannot exceed 150,000 KES');
      }
      return true;
    }),
  body('asset')
    .optional()
    .isString()
    .withMessage('Asset must be a string')
    .isIn(['XLM', 'USDC'])
    .withMessage('Asset must be XLM or USDC'),
  body('memo')
    .optional()
    .isString()
    .withMessage('Memo must be a string')
    .isLength({ max: 28 })
    .withMessage('Memo must be 28 characters or less')
], validate, initiateDeposit);

/**
 * @route   POST /api/stellar-mpesa/withdraw
 * @desc    Initiate Stellar withdrawal to MPESA
 * @access  Private
 */
router.post('/withdraw', authenticate, [
  body('phoneNumber')
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(/^254[0-9]{9}$/)
    .withMessage('Phone number must be in format 254XXXXXXXXX'),
  body('amountAsset')
    .notEmpty()
    .withMessage('Amount in asset is required')
    .isString()
    .withMessage('Amount must be a string')
    .custom((value) => {
      if (parseFloat(value) <= 0) {
        throw new Error('Amount must be greater than 0');
      }
      return true;
    }),
  body('asset')
    .optional()
    .isString()
    .withMessage('Asset must be a string')
    .isIn(['XLM', 'USDC'])
    .withMessage('Asset must be XLM or USDC'),
  body('memo')
    .optional()
    .isString()
    .withMessage('Memo must be a string')
    .isLength({ max: 28 })
    .withMessage('Memo must be 28 characters or less')
], validate, initiateWithdrawal);

/**
 * @route   GET /api/stellar-mpesa/transaction/:transactionId
 * @desc    Get transaction status
 * @access  Private
 */
router.get('/transaction/:transactionId', authenticate, [
  param('transactionId')
    .notEmpty()
    .withMessage('Transaction ID is required')
    .isString()
    .withMessage('Transaction ID must be a string')
], validate, getTransactionStatus);

/**
 * @route   GET /api/stellar-mpesa/transactions
 * @desc    Get user's transaction history
 * @access  Private
 */
router.get('/transactions', authenticate, [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
], validate, getTransactionHistory);

/**
 * @route   GET /api/stellar-mpesa/rates
 * @desc    Get exchange rates
 * @access  Public (no authentication required for exchange rates)
 */
router.get('/rates', getExchangeRates);

/**
 * @route   POST /api/stellar-mpesa/convert/kes-to-asset
 * @desc    Convert KES to Stellar asset amount
 * @access  Private
 */
router.post('/convert/kes-to-asset', authenticate, [
  body('amountKES')
    .notEmpty()
    .withMessage('Amount in KES is required')
    .isNumeric()
    .withMessage('Amount must be a number')
    .custom((value) => {
      if (parseFloat(value) <= 0) {
        throw new Error('Amount must be greater than 0');
      }
      return true;
    }),
  body('asset')
    .optional()
    .isString()
    .withMessage('Asset must be a string')
    .isIn(['XLM', 'USDC'])
    .withMessage('Asset must be XLM or USDC')
], validate, convertKesToAsset);

/**
 * @route   POST /api/stellar-mpesa/convert/asset-to-kes
 * @desc    Convert Stellar asset amount to KES
 * @access  Private
 */
router.post('/convert/asset-to-kes', authenticate, [
  body('amountAsset')
    .notEmpty()
    .withMessage('Amount in asset is required')
    .isString()
    .withMessage('Amount must be a string')
    .custom((value) => {
      if (parseFloat(value) <= 0) {
        throw new Error('Amount must be greater than 0');
      }
      return true;
    }),
  body('asset')
    .optional()
    .isString()
    .withMessage('Asset must be a string')
    .isIn(['XLM', 'USDC'])
    .withMessage('Asset must be XLM or USDC')
], validate, convertAssetToKes);

/**
 * @route   POST /api/stellar-mpesa/callback
 * @desc    Handle MPESA callback for Stellar transactions
 * @access  Public (MPESA webhook)
 */
router.post('/callback', handleMpesaCallback);

export default router;
