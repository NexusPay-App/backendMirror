import express from 'express';
import { authenticate } from '../middleware/auth';
import {
    createRampTransaction,
    getUserTransactions,
    getTransactionStats,
    calculateSavings
} from '../controllers/rampController';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Create a new ramp transaction
router.post('/transaction', createRampTransaction);

// Get user's transactions
router.get('/transactions', getUserTransactions);

// Get transaction statistics
router.get('/stats', getTransactionStats);

// Calculate potential savings
router.post('/calculate-savings', calculateSavings);

export default router; 