import express from 'express';
import { conversionController, getUsdcBalance } from '../controllers/usdcController';
import { enforceStrictAuth } from '../middleware/strictAuthMiddleware';

const router = express.Router();

// Protected endpoint - requires strict authentication with OTP verification
router.get('/usdc-balance/:chain/:address', enforceStrictAuth, getUsdcBalance);

// Public endpoint - conversion rate can be accessed by anyone
router.get('/conversionrate', conversionController);

export default router;
