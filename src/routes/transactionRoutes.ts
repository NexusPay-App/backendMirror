import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { body, query } from 'express-validator';
import {
  getTransactionHistory,
  getTransactionById
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

export default router; 