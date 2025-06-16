import express from 'express';
import { authenticate } from '../middleware/auth';
import {
    provideLiquidity,
    getYieldInfo,
    claimYield,
    withdrawLiquidity,
    swapYieldTokens
} from '../controllers/yieldController';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Provide liquidity and receive yield tokens
router.post('/provide', provideLiquidity);

// Get yield token balance and earnings
router.get('/info', getYieldInfo);

// Claim yield tokens
router.post('/claim', claimYield);

// Withdraw liquidity
router.post('/withdraw', withdrawLiquidity);

// Swap yield tokens for supported tokens
router.post('/swap', swapYieldTokens);

export default router; 