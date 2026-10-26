import express from 'express';
import rateLimit from 'express-rate-limit';
import { requestBusinessCreation, completeBusinessCreation, verifyBusinessPin, requestBusinessPin, setBusinessPin, requestBusinessPinReset, resetBusinessPin, updateBusinessPin } from '../controllers/businessSetupController';
import {
  getBusinessDetails,
  getMyBusinesses,
  verifyExternalTransfer,
  getBusinessByMerchantId,
  checkBusinessStatus,
  // New overdraft/loan endpoints
  requestBusinessOverdraft,
  repayBusinessOverdraft,
  getBusinessCreditAssessment,
  toggleBusinessOverdraft,
  getBusinessOverdraftHistory,
  // New optimization endpoints
  getUnifiedUserProfile,
  getBusinessesByPhone
} from '../controllers/enhancedBusinessController';
import { enforceStrictAuth } from '../middleware/strictAuthMiddleware';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// Listing businesses is a normal authenticated read; creation/management stay strict.
router.get('/my-businesses', authenticate, getMyBusinesses);
const setupLimit = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, keyGenerator: req => String(req.user._id), message: { success: false, message: 'Too many attempts. Try again in 15 minutes.' } });
router.post('/request-upgrade', authenticate, setupLimit, requestBusinessCreation);
router.post('/complete-upgrade', authenticate, setupLimit, completeBusinessCreation);
router.post('/pin/verify', authenticate, setupLimit, verifyBusinessPin);
router.post('/pin/request-otp', authenticate, setupLimit, requestBusinessPin);
router.post('/pin/set', authenticate, setupLimit, setBusinessPin);
router.post('/pin/forgot', authenticate, setupLimit, requestBusinessPinReset);
router.post('/pin/confirm-forgot', authenticate, setupLimit, resetBusinessPin);
router.post('/pin/update', authenticate, setupLimit, updateBusinessPin);
router.post('/verify-external-transfer', enforceStrictAuth, verifyExternalTransfer);
router.get('/details', enforceStrictAuth, getBusinessDetails);
router.get('/status', enforceStrictAuth, checkBusinessStatus);
router.get('/find/:merchantId', enforceStrictAuth, getBusinessByMerchantId);

// 🏦 Business Overdraft/Loan Endpoints
router.post('/overdraft/request', enforceStrictAuth, requestBusinessOverdraft);
router.post('/overdraft/repay', enforceStrictAuth, repayBusinessOverdraft);
router.get('/overdraft/assessment/:businessId', enforceStrictAuth, getBusinessCreditAssessment);
router.post('/overdraft/toggle', enforceStrictAuth, toggleBusinessOverdraft);
router.get('/overdraft/history/:businessId', enforceStrictAuth, getBusinessOverdraftHistory);

// 🔗 User Optimization Endpoints
router.get('/profile/:userId', enforceStrictAuth, getUnifiedUserProfile);
router.get('/phone/:phoneNumber', enforceStrictAuth, getBusinessesByPhone);

export default router;

