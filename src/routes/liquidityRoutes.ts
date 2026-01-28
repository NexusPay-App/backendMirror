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
import { ZkVerifyMetricsController } from '../controllers/zkverifyMetricsController';

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

// zkVerify Metrics (Grant Reporting)
router.get('/zkverify/metrics', ZkVerifyMetricsController.getLiquidityProofMetrics);
router.get('/zkverify/milestone-report', ZkVerifyMetricsController.getMilestoneReport);

export default router; 