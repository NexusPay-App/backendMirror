// import { Router } from "express"
// import {cryptoToFiat, mpesaDeposit, mpesaWithdraw, mpesaB2CWebhook, mpesaQueueWebhook, mpesaSTKPushWebhook } from "../controllers/mpesaController"
// import { authenticateToken } from "../middleware/authMiddleware"
// //import { mpesaDeposit, mpesaWithdraw, mpesaB2CWebhook, mpesaQueueWebhook, mpesaSTKPushWebhook } from "../controllers/mpesaController"


// const router = Router()

// router.post("/deposit", authenticateToken, mpesaDeposit)
// router.post("/withdraw", authenticateToken, mpesaWithdraw)
// router.post("/b2c/result", mpesaB2CWebhook)
// router.post("/stk-push/result", mpesaSTKPushWebhook)
// router.post("/queue", mpesaQueueWebhook)
// router.post("/crypto-to-fiat", authenticateToken, cryptoToFiat);

// export default router

// src/routes/mpesaRoutes.ts
// src/routes/mpesaRoutes.ts
// src/routes/mpesaRoutes.ts
import express from 'express';
import {
    mpesaDeposit,
    mpesaWithdraw,
    withdrawToMpesa,
    payToPaybill,
    payToTill,
    mpesaSTKPushWebhook,
    mpesaB2CWebhook,
    mpesaB2BWebhook,
    mpesaQueueWebhook,
    buyCrypto,
    getTransactionStatus,
    getLiquidityCheck,
    getMultiChainLiquidityOverview,
    getPlatformWalletStatus,
    withdrawFeesToMainWallet,
    stkPushCallback,
    submitMpesaReceiptManually,
    getTransactionsRequiringIntervention,
    testWebhookLogging,
    testB2BCallback,
    manualRollback,
    payWithCrypto
} from '../controllers/mpesaController';
import { validate } from '../middleware/validation';
import { 
    depositValidation,
    withdrawValidation,
    paybillValidation,
    tillValidation,
    buyCryptoValidation,
    manualReceiptValidation,
    validateCryptoSpending
} from '../middleware/validators/mpesaValidators';
import { authenticateToken } from '../middleware/authMiddleware';
import { enforceStrictAuth } from '../middleware/strictAuthMiddleware';
import { authenticateTransaction } from '../middleware/transactionAuthMiddleware';
import { isAdmin } from '../middleware/roleMiddleware';
import { cryptoSpendingProtection } from '../middleware/rateLimiting';

const router = express.Router();

// Public callback routes (no authentication required)
router.post('/stk-callback', mpesaSTKPushWebhook);
router.post('/b2c-callback', mpesaB2CWebhook);
router.post('/b2b-callback', mpesaB2BWebhook);
router.post('/queue-timeout', mpesaQueueWebhook);
router.post('/callback', stkPushCallback);

// User routes (strict authentication required)
router.post('/deposit', authenticateToken, validate(depositValidation), mpesaDeposit);
router.post('/withdraw', enforceStrictAuth, validate(withdrawValidation), mpesaWithdraw);
router.post('/pay/paybill', enforceStrictAuth, validate(paybillValidation), payToPaybill);
router.post('/pay/till', enforceStrictAuth, validate(tillValidation), payToTill);
router.post('/buy-crypto', authenticateToken, validate(buyCryptoValidation), buyCrypto);
router.get('/transaction/:transactionId', enforceStrictAuth, getTransactionStatus);
router.get('/liquidity-check/:tokenType/:chain', authenticateToken, getLiquidityCheck);
router.get('/liquidity-overview', authenticateToken, getMultiChainLiquidityOverview);

// Manual intervention routes (for failed automatic processing)
router.post('/submit-receipt', enforceStrictAuth, validate(manualReceiptValidation), submitMpesaReceiptManually);
router.get('/pending-interventions', enforceStrictAuth, getTransactionsRequiringIntervention);
router.post('/manual-rollback', enforceStrictAuth, manualRollback);

// Admin routes (requires admin role)
router.get('/platform-wallet', enforceStrictAuth, isAdmin, getPlatformWalletStatus);
router.post('/withdraw-fees', enforceStrictAuth, isAdmin, withdrawFeesToMainWallet);

// Test webhook logging route
router.post('/test-webhook-logging', testWebhookLogging);
router.post('/test-b2b-callback', testB2BCallback);

// 🚀 NEW: Crypto Spending - Pay Paybills/Tills with Crypto (with comprehensive protection)
router.post('/pay-with-crypto', 
  ...cryptoSpendingProtection,
  authenticateToken, 
  validate(validateCryptoSpending), 
  payWithCrypto
);

// 🔄 Crypto to MPESA - Real endpoint for sending crypto to MPESA
router.post('/crypto-to-mpesa', authenticateTransaction, withdrawToMpesa);

export default router;