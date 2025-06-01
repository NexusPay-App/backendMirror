import express from 'express';
import { buyCrypto, handleMpesaCallback, claimCryptoWithReceipt } from '../controllers/mpesaController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// Protected routes (require authentication)
router.post('/buy-crypto', authenticate, buyCrypto);
router.post('/claim-crypto', authenticate, claimCryptoWithReceipt);

// Callback route (no auth required - called by M-Pesa)
router.post('/callback', handleMpesaCallback);

export default router; 