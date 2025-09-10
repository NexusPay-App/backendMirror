import { Router } from 'express';
import { 
    kplcTokenWebhook, 
    sendKPLCTokenManually, 
    getKPLCTransactionStatus,
    getKPLCStats,
    simulateKPLCToken
} from '../controllers/kplcController';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * KPLC Token Webhook
 * This endpoint receives token messages from KPLC when payments are processed
 * No authentication required as it's called by KPLC's system
 */
router.post('/webhook/token', kplcTokenWebhook);

/**
 * Manual KPLC Token Sending (Admin/Testing)
 * Send KPLC token message manually for testing or admin purposes
 */
router.post('/send-token', authenticate, sendKPLCTokenManually);

/**
 * Get KPLC Transaction Status
 * Check if a transaction has received its KPLC token
 */
router.get('/transaction/:transactionId/status', authenticate, getKPLCTransactionStatus);

/**
 * Get KPLC Statistics (Admin)
 * Get overall KPLC transaction statistics
 */
router.get('/stats', authenticate, getKPLCStats);

/**
 * Simulate KPLC Token (Admin/Testing)
 * Simulate a KPLC token message for testing purposes
 */
router.post('/simulate-token', authenticate, simulateKPLCToken);

export default router;
