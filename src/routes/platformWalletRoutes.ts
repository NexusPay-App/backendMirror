import express from 'express';
import { authenticate } from '../middleware/auth';
import {
    getWalletBalance,
    getAllBalances,
    getPlatformStatus,
    withdrawFees,
    transferFees
} from '../controllers/platformWalletController';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get balance for a specific token on a specific chain
router.get('/balance/:token', getWalletBalance);

// Get platform wallet status (addresses and balances)
router.get('/status', getPlatformStatus);

// Get all token balances across all chains
router.get('/balances', getAllBalances);

// Withdraw fees (requires admin keys)
router.post('/withdraw', withdrawFees);

// Transfer fees (requires admin keys)
router.post('/transfer', transferFees);

export default router; 