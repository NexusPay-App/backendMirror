import express from 'express';
import { conversionController, getUsdcBalance } from '../controllers/usdcController';
import { conversionRateLimiter } from '../middleware/rateLimiting';

const router = express.Router();

// GET /api/usdc/conversionrate - Get USD to KES conversion rate
router.get('/conversionrate', conversionRateLimiter, conversionController);

// GET /api/usdc/conversionrate/refresh - Force refresh the conversion rate (bypass cache)
router.get('/conversionrate/refresh', conversionRateLimiter, async (req, res) => {
  try {
    // Clear the cache to force a fresh fetch
    const { redis } = await import('../config/redis');
    await redis.del('usd_to_kes_rate');
    
    // Call the conversion controller
    await conversionController(req, res);
  } catch (error) {
    console.error('Error refreshing conversion rate:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh conversion rate',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/usdc/balance/:address - Get USDC balance for an address
router.get('/balance/:address', getUsdcBalance);

export default router;
