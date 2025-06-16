import express from 'express';
import { buyCrypto } from '../controllers/mpesaController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// Protected routes (require authentication)
router.post('/buy-crypto', authenticate, buyCrypto);

export default router; 