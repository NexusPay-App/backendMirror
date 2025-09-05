import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { transactionHistoryLimiter } from '../middleware/rateLimiting';
import { body, query } from 'express-validator';
import {
  getTransactionHistory,
  getTransactionById,
  getAllTransactions,
  getOnchainTransactions,
  getFiatCryptoTransactions
} from '../controllers/transactionController';

const router = Router();

/**
 * Validation for transaction history with filters
 */
const transactionHistoryValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  query('status')
    .optional()
    .isIn(['pending', 'completed', 'failed', 'error', 'reserved'])
    .withMessage('Invalid status filter'),
  
  query('type')
    .optional()
    .isIn(['fiat_to_crypto', 'crypto_to_fiat', 'crypto_to_paybill', 'crypto_to_till', 'token_transfer'])
    .withMessage('Invalid transaction type filter'),
  
  query('chain')
    .optional()
    .isIn(['celo', 'polygon', 'arbitrum', 'base', 'optimism', 'ethereum', 'bnb', 'avalanche', 'fantom', 'gnosis', 'scroll', 'moonbeam', 'fuse', 'aurora', 'lisk', 'somnia'])
    .withMessage('Invalid blockchain filter'),
  
  query('tokenType')
    .optional()
    .isIn(['USDC', 'USDT', 'BTC', 'ETH', 'WETH', 'WBTC', 'DAI', 'CELO'])
    .withMessage('Invalid token type filter'),
  
  query('dateFrom')
    .optional()
    .isISO8601()
    .withMessage('Date from must be a valid ISO8601 date'),
  
  query('dateTo')
    .optional()
    .isISO8601()
    .withMessage('Date to must be a valid ISO8601 date')
];

/**
 * Validation for transaction by ID
 */
const transactionByIdValidation = [
  body('id')
    .notEmpty()
    .withMessage('Transaction ID is required')
    .isString()
    .withMessage('Transaction ID must be a string')
];

/**
 * Validation for comprehensive transaction queries
 */
const comprehensiveTransactionValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  query('status')
    .optional()
    .isIn(['pending', 'completed', 'failed', 'error', 'reserved', 'processing'])
    .withMessage('Invalid status filter'),
  
  query('type')
    .optional()
    .isIn(['fiat_to_crypto', 'crypto_to_fiat', 'crypto_to_paybill', 'crypto_to_till', 'token_transfer'])
    .withMessage('Invalid transaction type filter'),
  
  query('chain')
    .optional()
    .isIn(['celo', 'polygon', 'arbitrum', 'base', 'optimism', 'ethereum', 'bnb', 'avalanche', 'fantom', 'gnosis', 'scroll', 'moonbeam', 'fuse', 'aurora', 'lisk', 'somnia'])
    .withMessage('Invalid blockchain filter'),
  
  query('tokenType')
    .optional()
    .isIn(['USDC', 'USDT', 'BTC', 'ETH', 'WETH', 'WBTC', 'DAI', 'CELO'])
    .withMessage('Invalid token type filter'),
  
  query('dateFrom')
    .optional()
    .isISO8601()
    .withMessage('Date from must be a valid ISO8601 date'),
  
  query('dateTo')
    .optional()
    .isISO8601()
    .withMessage('Date to must be a valid ISO8601 date'),
  
  query('userId')
    .optional()
    .isString()
    .withMessage('User ID must be a string'),
  
  query('minAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum amount must be a positive number'),
  
  query('maxAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum amount must be a positive number'),
  
  query('hasTransactionHash')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('hasTransactionHash must be true or false'),
  
  query('hasMpesaId')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('hasMpesaId must be true or false'),
  
  query('conversionType')
    .optional()
    .isIn(['buy', 'sell', 'all'])
    .withMessage('Conversion type must be buy, sell, or all')
];

/**
 * @route GET /api/transactions/history
 * @desc Get enhanced transaction history with comprehensive details
 * @access Private (authenticated users)
 * @query page - Page number (default: 1)
 * @query limit - Items per page (default: 10, max: 100)
 * @query status - Filter by transaction status
 * @query type - Filter by transaction type
 * @query chain - Filter by blockchain
 * @query tokenType - Filter by token symbol
 * @query dateFrom - Filter transactions from this date
 * @query dateTo - Filter transactions to this date
 */
router.get(
  '/history',
  authenticate,
  transactionHistoryLimiter,
  validate(transactionHistoryValidation),
  getTransactionHistory
);

/**
 * @route GET /api/transactions/:id
 * @desc Get enhanced transaction details by ID
 * @access Private (authenticated users)
 * @param id - Transaction ID or database ObjectId
 */
router.get(
  '/:id',
  authenticate,
  getTransactionById
);

/**
 * @route GET /api/transactions/dashboard/insights
 * @desc Get comprehensive dashboard insights for user's transaction portfolio
 * @access Private (authenticated users)
 */
router.get(
  '/dashboard/insights',
  authenticate,
  async (req, res) => {
    try {
      // This endpoint provides dashboard-specific data
      // It's handled by the transaction history endpoint but could be separate
      const { getTransactionHistory } = require('../controllers/transactionController');
      
      // Get recent transactions for insights
      req.query = { ...req.query, limit: '50' }; // Get more data for better insights
      
      return await getTransactionHistory(req, res);
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate dashboard insights',
        error: error.message
      });
    }
  }
);

/**
 * @route GET /api/transactions/all
 * @desc Get ALL platform transactions (admin only)
 * @access Private (admin users only)
 * @query page - Page number (default: 1)
 * @query limit - Items per page (default: 50, max: 100)
 * @query status - Filter by transaction status
 * @query type - Filter by transaction type
 * @query chain - Filter by blockchain
 * @query tokenType - Filter by token symbol
 * @query dateFrom - Filter transactions from this date
 * @query dateTo - Filter transactions to this date
 * @query userId - Filter by specific user ID
 * @query minAmount - Filter by minimum amount
 * @query maxAmount - Filter by maximum amount
 * @query hasTransactionHash - Filter transactions with blockchain hash
 * @query hasMpesaId - Filter transactions with M-Pesa ID
 */
router.get(
  '/all',
  authenticate,
  validate(comprehensiveTransactionValidation),
  getAllTransactions
);

/**
 * @route GET /api/transactions/onchain
 * @desc Get ALL onchain transactions across all chains (admin only)
 * @access Private (admin users only)
 * @query page - Page number (default: 1)
 * @query limit - Items per page (default: 50, max: 100)
 * @query chain - Filter by blockchain
 * @query tokenType - Filter by token symbol
 * @query dateFrom - Filter transactions from this date
 * @query dateTo - Filter transactions to this date
 * @query userId - Filter by specific user ID
 * @query minAmount - Filter by minimum amount
 * @query maxAmount - Filter by maximum amount
 * @query status - Filter by transaction status
 */
router.get(
  '/onchain',
  authenticate,
  validate(comprehensiveTransactionValidation),
  getOnchainTransactions
);

/**
 * @route GET /api/transactions/fiat-crypto
 * @desc Get Fiat-Crypto conversion transactions (admin only)
 * @access Private (admin users only)
 * @query page - Page number (default: 1)
 * @query limit - Items per page (default: 50, max: 100)
 * @query type - Filter by transaction type (fiat_to_crypto, crypto_to_fiat)
 * @query chain - Filter by blockchain
 * @query tokenType - Filter by token symbol
 * @query dateFrom - Filter transactions from this date
 * @query dateTo - Filter transactions to this date
 * @query userId - Filter by specific user ID
 * @query minAmount - Filter by minimum amount
 * @query maxAmount - Filter by maximum amount
 * @query status - Filter by transaction status
 * @query conversionType - Filter by conversion direction (buy, sell, all)
 */
router.get(
  '/fiat-crypto',
  authenticate,
  validate(comprehensiveTransactionValidation),
  getFiatCryptoTransactions
);

export default router; 