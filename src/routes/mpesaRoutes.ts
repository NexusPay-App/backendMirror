import { mpesaCapabilities, type RampMode } from '../services/mpesaReadiness';
import { protectRampRequest } from '../middleware/rampRequest';
import { getRateQuote } from '../services/rates';
import { calculateTransactionFee } from '../services/platformWallet';
import { acceptCallback } from '../services/paymentInbox';
import express from 'express';
import {
    withdrawToMpesa,
    buyCrypto,
    getTransactionStatus,
    getLiquidityCheck,
    getMultiChainLiquidityOverview,
    getPlatformWalletStatus,
    withdrawFeesToMainWallet,
    submitMpesaReceiptManually,
    getTransactionsRequiringIntervention,
    testWebhookLogging,
    testB2BCallback,
    manualRollback,
    payWithCrypto
} from '../controllers/mpesaController';
import { validate } from '../middleware/validation';
import { 
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
const requireRamp = (mode: RampMode): express.RequestHandler => (req, res, next) => {
  const capabilities = mpesaCapabilities();
  if (!capabilities.modes[mode]) return void res.status(503).json({success: false, message: 'This M-Pesa payment option is not available yet.'});
  if (!capabilities.networks.some(network => network.id === req.body.chain) || req.body.tokenType !== 'USDC') return void res.status(400).json({success: false, message: 'Select a supported settlement network and asset.'});
  next();
};
router.post('/quote', authenticateToken, async (req, res) => {
  const {mode, chain, tokenType, amount} = req.body;
  const capabilities = mpesaCapabilities();
  if (!['buy', 'withdraw', 'bills'].includes(mode) || !capabilities.modes[mode as RampMode]) return res.status(503).json({success: false, message: 'This M-Pesa option is not available yet.'});
  if (!capabilities.networks.some(network => network.id === chain) || tokenType !== 'USDC' || !/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(String(amount)) || !Number.isFinite(Number(amount)) || Number(amount) <= 0) return res.status(400).json({success: false, message: 'Enter a valid amount and supported asset.'});
  try {
    const rate = await getRateQuote(tokenType);
    const cryptoAmount = mode === 'withdraw' ? Number(amount) : Number(amount) / rate.rate;
    const fiatAmount = mode === 'withdraw' ? Math.floor(cryptoAmount * rate.rate) : Number(amount);
    if (!Number.isInteger(fiatAmount) || fiatAmount < 10 || fiatAmount > 150000) return res.status(400).json({success: false, message: 'Enter a whole KES amount between 10 and 150,000.'});
    const serviceFee = mode === 'withdraw' ? calculateTransactionFee(cryptoAmount) : 0;
    return res.json({success: true, data: {fiatAmount, cryptoAmount: mode === 'bills' ? (Math.ceil(cryptoAmount * 1e6) / 1e6).toFixed(6) : cryptoAmount.toFixed(6), serviceFee: String(serviceFee), rate: rate.rate, expiresAt: new Date(Date.now() + 60000).toISOString()}});
  } catch { return res.status(503).json({success: false, message: 'A current exchange rate is unavailable. No payment has started.'}); }
});


// Public callback routes (no authentication required)
router.post('/stk-callback', acceptCallback('stk-callback'));
router.post('/b2c-callback', acceptCallback('b2c-callback'));
router.post('/b2b-callback', acceptCallback('b2b-callback'));
router.post('/queue-timeout', acceptCallback('queue-timeout'));
router.post('/callback', acceptCallback('callback'));

// User routes (strict authentication required)
router.post(['/deposit', '/withdraw', '/pay/paybill', '/pay/till'], authenticateToken, (_req, res) => {
  res.status(410).json({success: false, message: 'This payment flow has been replaced. Use Buy or Pay in the latest NexusPay app.'});
});
router.post('/buy-crypto', authenticateToken, validate(buyCryptoValidation), requireRamp('buy'), protectRampRequest, buyCrypto);
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
router.post('/test-webhook-logging', authenticateToken, isAdmin, testWebhookLogging);
router.post('/test-b2b-callback', authenticateToken, isAdmin, testB2BCallback);

// 🚀 NEW: Crypto Spending - Pay Paybills/Tills with Crypto (with comprehensive protection)
router.post('/pay-with-crypto', 
  ...cryptoSpendingProtection,
  authenticateTransaction,
  validate(validateCryptoSpending),
  requireRamp('bills'), protectRampRequest,
  payWithCrypto
);

// 🔄 Crypto to MPESA - Real endpoint for sending crypto to MPESA
router.post('/crypto-to-mpesa', authenticateTransaction, requireRamp('withdraw'), protectRampRequest, withdrawToMpesa);

export default router;