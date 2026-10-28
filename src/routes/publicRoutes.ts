import { Router } from 'express';
import { getPublicTransactions } from '../controllers/publicTransactionsController';
import { publicDashboardLimiter } from '../middleware/rateLimiting';

/**
 * Unauthenticated read-only routes.
 *
 * Everything mounted here is intentionally public: no JWT, no OTP step-up, no session.
 * Keep responses to public-safe fields only (see publicTransactionsController). The
 * transaction feed is BOT Chain–only; other-chain ledgers stay on authenticated history.
 * Keep the dedicated rate limiter attached to every route.
 */
const router = Router();

router.get('/transactions', publicDashboardLimiter, getPublicTransactions);

export default router;
