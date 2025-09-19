import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { body, query, param } from 'express-validator';
import {
  createWallet,
  getWallet,
  getBalance,
  getAllBalances,
  sendPayment,
  getTransactionHistory,
  createTrustline,
  fundWallet,
  getPrices,
  getNetworkInfo,
  validateAddress
} from '../controllers/stellarController';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @route   POST /api/stellar/wallet
 * @desc    Create a new Stellar wallet for the authenticated user
 * @access  Private
 */
router.post('/wallet', createWallet);

/**
 * @route   GET /api/stellar/wallet
 * @desc    Get user's Stellar wallet information
 * @access  Private
 */
router.get('/wallet', getWallet);

/**
 * @route   GET /api/stellar/balance
 * @desc    Get wallet balance for a specific asset
 * @access  Private
 */
router.get('/balance', [
  query('asset').optional().isString().withMessage('Asset must be a string')
], validate, getBalance);

/**
 * @route   GET /api/stellar/balances
 * @desc    Get all wallet balances
 * @access  Private
 */
router.get('/balances', getAllBalances);

/**
 * @route   POST /api/stellar/send
 * @desc    Send payment to another Stellar address
 * @access  Private
 */
router.post('/send', [
  body('toAccountId')
    .notEmpty()
    .withMessage('Recipient address is required')
    .isString()
    .withMessage('Recipient address must be a string'),
  body('amount')
    .notEmpty()
    .withMessage('Amount is required')
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
], validate, sendPayment);

/**
 * @route   GET /api/stellar/transactions
 * @desc    Get transaction history
 * @access  Private
 */
router.get('/transactions', [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('cursor')
    .optional()
    .isString()
    .withMessage('Cursor must be a string')
], validate, getTransactionHistory);

/**
 * @route   POST /api/stellar/trustline
 * @desc    Create trustline for an asset
 * @access  Private
 */
router.post('/trustline', [
  body('assetCode')
    .notEmpty()
    .withMessage('Asset code is required')
    .isString()
    .withMessage('Asset code must be a string'),
  body('issuer')
    .notEmpty()
    .withMessage('Issuer address is required')
    .isString()
    .withMessage('Issuer address must be a string'),
  body('limit')
    .optional()
    .isString()
    .withMessage('Limit must be a string')
], validate, createTrustline);

/**
 * @route   POST /api/stellar/fund
 * @desc    Fund wallet with testnet XLM (testnet only)
 * @access  Private
 */
router.post('/fund', fundWallet);

/**
 * @route   GET /api/stellar/prices
 * @desc    Get current asset prices
 * @access  Public (no authentication required for price data)
 */
router.get('/prices', [
  query('asset')
    .optional()
    .isString()
    .withMessage('Asset must be a string')
    .isIn(['XLM', 'USDC'])
    .withMessage('Asset must be XLM or USDC')
], validate, getPrices);

/**
 * @route   GET /api/stellar/network
 * @desc    Get network information
 * @access  Public
 */
router.get('/network', getNetworkInfo);

/**
 * @route   POST /api/stellar/validate-address
 * @desc    Validate Stellar address
 * @access  Private
 */
router.post('/validate-address', [
  body('address')
    .notEmpty()
    .withMessage('Address is required')
    .isString()
    .withMessage('Address must be a string')
], validate, validateAddress);

export default router;
