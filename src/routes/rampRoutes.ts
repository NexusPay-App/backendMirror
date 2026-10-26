import express from 'express';
import { authenticate } from '../middleware/auth';
import {
    getUserTransactions,
    getTransactionStats,
    calculateSavings
} from '../controllers/rampController';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Create a new ramp transaction
router.post('/transaction', (_req, res) => {
    res.status(503).json({ success: false, message: 'Use the M-Pesa Buy or Pay flow to make a payment.' });
});

// Get user's transactions
router.get('/transactions', getUserTransactions);

// Get transaction statistics
router.get('/stats', getTransactionStats);

// Calculate potential savings
router.post('/calculate-savings', calculateSavings);

export default router; 