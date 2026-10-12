import express from 'express';
import { conversionController, getUsdcBalance } from '../controllers/usdcController';
import { conversionRateLimiter } from '../middleware/rateLimiting';

const router = express.Router();

// GET /api/usdc/conversionrate - Get USD to KES conversion rate
router.get('/conversionrate', conversionRateLimiter, conversionController);

// GET /api/usdc/conversionrate/refresh - Force refresh the conversion rate (bypass cache)
router.get('/conversionrate/refresh', conversionRateLimiter, conversionController);

// GET /api/usdc/balance/:address - Get USDC balance for an address
router.get('/balance/:address', getUsdcBalance);

export default router;
