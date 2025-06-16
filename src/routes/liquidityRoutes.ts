import express from 'express';
import { authenticate } from '../middleware/auth';
import {
    provideLiquidity,
    getLiquidityPositions,
    getLiquidityStats,
    withdrawLiquidity,
    initiateWithdrawal,
    deletePosition
} from '../controllers/liquidityController';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Provide liquidity
router.post('/provide', provideLiquidity);

// Get user's liquidity positions
router.get('/positions', getLiquidityPositions);

// Get liquidity stats for a token
router.get('/stats/:token', getLiquidityStats);

// Withdrawal flow
router.post('/withdraw/initiate', initiateWithdrawal);
router.post('/withdraw/confirm', withdrawLiquidity);

// Delete a liquidity position
router.delete('/position/:positionId', deletePosition);

export default router; 