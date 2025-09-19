import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { body, query, param } from 'express-validator';
import {
  createMultiSigWallet,
  getMultiSigWallets,
  createPaymentChannel,
  executeChannelPayment,
  getPaymentChannels,
  getAssetInfo,
  createSwapOffer,
  getSwapOffers,
  executeSwap,
  getNetworkStats,
  createTimeLockedPayment
} from '../controllers/stellarAdvancedController';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @route   POST /api/stellar-advanced/multisig
 * @desc    Create a multi-signature wallet
 * @access  Private
 */
router.post('/multisig', [
  body('signers')
    .isArray({ min: 1 })
    .withMessage('At least one signer is required')
    .custom((signers) => {
      for (const signer of signers) {
        if (!signer.publicKey || typeof signer.weight !== 'number' || signer.weight < 1 || signer.weight > 255) {
          throw new Error('Each signer must have a valid publicKey and weight (1-255)');
        }
      }
      return true;
    }),
  body('threshold.low')
    .isInt({ min: 0, max: 255 })
    .withMessage('Low threshold must be between 0 and 255'),
  body('threshold.medium')
    .isInt({ min: 0, max: 255 })
    .withMessage('Medium threshold must be between 0 and 255'),
  body('threshold.high')
    .isInt({ min: 0, max: 255 })
    .withMessage('High threshold must be between 0 and 255')
], validate, createMultiSigWallet);

/**
 * @route   GET /api/stellar-advanced/multisig
 * @desc    Get user's multi-signature wallets
 * @access  Private
 */
router.get('/multisig', getMultiSigWallets);

/**
 * @route   POST /api/stellar-advanced/payment-channel
 * @desc    Create a payment channel
 * @access  Private
 */
router.post('/payment-channel', [
  body('destinationAccountId')
    .notEmpty()
    .withMessage('Destination account ID is required')
    .isString()
    .withMessage('Destination account ID must be a string'),
  body('asset')
    .notEmpty()
    .withMessage('Asset is required')
    .isString()
    .withMessage('Asset must be a string'),
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
  body('durationHours')
    .optional()
    .isInt({ min: 1, max: 168 })
    .withMessage('Duration must be between 1 and 168 hours (1 week)')
], validate, createPaymentChannel);

/**
 * @route   POST /api/stellar-advanced/payment-channel/:channelId/pay
 * @desc    Execute payment through a channel
 * @access  Private
 */
router.post('/payment-channel/:channelId/pay', [
  param('channelId')
    .notEmpty()
    .withMessage('Channel ID is required')
    .isString()
    .withMessage('Channel ID must be a string'),
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
  body('memo')
    .optional()
    .isString()
    .withMessage('Memo must be a string')
    .isLength({ max: 28 })
    .withMessage('Memo must be 28 characters or less')
], validate, executeChannelPayment);

/**
 * @route   GET /api/stellar-advanced/payment-channels
 * @desc    Get user's payment channels
 * @access  Private
 */
router.get('/payment-channels', getPaymentChannels);

/**
 * @route   GET /api/stellar-advanced/asset-info
 * @desc    Get asset information
 * @access  Public
 */
router.get('/asset-info', [
  query('assetCode')
    .notEmpty()
    .withMessage('Asset code is required')
    .isString()
    .withMessage('Asset code must be a string'),
  query('issuer')
    .optional()
    .isString()
    .withMessage('Issuer must be a string')
], validate, getAssetInfo);

/**
 * @route   POST /api/stellar-advanced/swap-offer
 * @desc    Create a swap offer
 * @access  Private
 */
router.post('/swap-offer', [
  body('fromAsset')
    .notEmpty()
    .withMessage('From asset is required')
    .isString()
    .withMessage('From asset must be a string'),
  body('toAsset')
    .notEmpty()
    .withMessage('To asset is required')
    .isString()
    .withMessage('To asset must be a string'),
  body('fromAmount')
    .notEmpty()
    .withMessage('From amount is required')
    .isString()
    .withMessage('From amount must be a string')
    .custom((value) => {
      if (parseFloat(value) <= 0) {
        throw new Error('From amount must be greater than 0');
      }
      return true;
    }),
  body('toAmount')
    .notEmpty()
    .withMessage('To amount is required')
    .isString()
    .withMessage('To amount must be a string')
    .custom((value) => {
      if (parseFloat(value) <= 0) {
        throw new Error('To amount must be greater than 0');
      }
      return true;
    }),
  body('expiresInHours')
    .optional()
    .isInt({ min: 1, max: 168 })
    .withMessage('Expiration must be between 1 and 168 hours (1 week)')
], validate, createSwapOffer);

/**
 * @route   GET /api/stellar-advanced/swap-offers
 * @desc    Get available swap offers
 * @access  Public
 */
router.get('/swap-offers', [
  query('fromAsset')
    .optional()
    .isString()
    .withMessage('From asset must be a string'),
  query('toAsset')
    .optional()
    .isString()
    .withMessage('To asset must be a string'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
], validate, getSwapOffers);

/**
 * @route   POST /api/stellar-advanced/swap/:offerId/execute
 * @desc    Execute a swap
 * @access  Private
 */
router.post('/swap/:offerId/execute', [
  param('offerId')
    .notEmpty()
    .withMessage('Offer ID is required')
    .isString()
    .withMessage('Offer ID must be a string'),
  body('userAccountId')
    .notEmpty()
    .withMessage('User account ID is required')
    .isString()
    .withMessage('User account ID must be a string'),
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
    })
], validate, executeSwap);

/**
 * @route   GET /api/stellar-advanced/network-stats
 * @desc    Get Stellar network statistics
 * @access  Public
 */
router.get('/network-stats', getNetworkStats);

/**
 * @route   POST /api/stellar-advanced/time-locked-payment
 * @desc    Create a time-locked payment
 * @access  Private
 */
router.post('/time-locked-payment', [
  body('toAccountId')
    .notEmpty()
    .withMessage('To account ID is required')
    .isString()
    .withMessage('To account ID must be a string'),
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
    .notEmpty()
    .withMessage('Asset is required')
    .isString()
    .withMessage('Asset must be a string'),
  body('unlockTime')
    .notEmpty()
    .withMessage('Unlock time is required')
    .isISO8601()
    .withMessage('Unlock time must be a valid ISO 8601 date')
    .custom((value) => {
      if (new Date(value) <= new Date()) {
        throw new Error('Unlock time must be in the future');
      }
      return true;
    }),
  body('memo')
    .optional()
    .isString()
    .withMessage('Memo must be a string')
    .isLength({ max: 28 })
    .withMessage('Memo must be 28 characters or less')
], validate, createTimeLockedPayment);

export default router;
