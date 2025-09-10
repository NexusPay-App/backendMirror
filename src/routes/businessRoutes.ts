// import express from 'express';
// import { registerBusiness } from '../controllers/businessController';

// const router = express.Router();

// router.post('/', registerBusiness);

// export default router;

// src/routes/businessRoutes.ts

import express from 'express';
import {
  requestBusinessCreation,
  completeBusinessCreation,
  getBusinessDetails,
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
  getBusinessesByPhone,
  // Business auth endpoints
  requestBusinessAuthOtp,
  verifyBusinessAuthOtp,
  getBusinessAuthSession,
  logoutBusinessAuth
} from '../controllers/enhancedBusinessController';
import { enforceStrictAuth } from '../middleware/strictAuthMiddleware';
import { authenticate } from '../middleware/auth';
import {
  requestBusinessV2Otp,
  createBusinessV2,
  resolveMerchantV2
} from '../controllers/enhancedBusinessController';
import {
  requestBusinessPasswordResetV2,
  resetBusinessPasswordV2
} from '../controllers/enhancedBusinessController';
import {
  setBusinessPin,
  setBusinessPinPublic,
  updateBusinessPin,
  verifyBusinessPin,
  verifyBusinessPinForTransaction,
  requestForgotBusinessPin,
  requestBusinessPinOtp,
  confirmForgotBusinessPin,
  getUserBusinesses,
  // New business balance and transaction endpoints
  getBusinessBalance,
  getBusinessChainBalance,
  getBusinessTransactionHistory,
  withdrawBusinessToPersonal,
  withdrawBusinessToMpesa,
  getBusinessCreditScore,
  applyBusinessLoan
} from '../controllers/enhancedBusinessController';

const router = express.Router();

// All business operations require strict authentication with OTP verification
router.post('/request-upgrade', enforceStrictAuth, requestBusinessCreation);
router.post('/complete-upgrade', enforceStrictAuth, completeBusinessCreation);
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

// 🔐 Business Authentication (OTP) Endpoints
router.post('/auth/request-otp', authenticate, requestBusinessAuthOtp);
router.post('/auth/verify-otp', authenticate, verifyBusinessAuthOtp);
router.get('/auth/session', authenticate, getBusinessAuthSession);
router.post('/auth/logout', authenticate, logoutBusinessAuth);

// Business v2 (independent)
router.post('/v2/request-otp', requestBusinessV2Otp);
router.post('/v2/create', createBusinessV2);
router.get('/v2/resolve/merchant/:merchantId', resolveMerchantV2);

// Business v2 - Forgot password (owner account reset via business lookup)
router.post('/v2/password-reset/request', requestBusinessPasswordResetV2);
router.post('/v2/password-reset/confirm', resetBusinessPasswordV2);

// Business PIN endpoints
// Public endpoints (no auth required)
router.post('/pin/request-otp', requestBusinessPinOtp);
router.post('/pin/set', setBusinessPinPublic);
router.post('/pin/forgot/request', requestForgotBusinessPin);
router.post('/pin/forgot/confirm', confirmForgotBusinessPin);

// Authenticated endpoints (require login)
router.post('/pin/set-authenticated', authenticate, setBusinessPin);
router.post('/pin/update', authenticate, updateBusinessPin);
router.post('/pin/verify', authenticate, verifyBusinessPin);
router.post('/pin/verify-transaction', authenticate, verifyBusinessPinForTransaction);

// List user's business accounts
router.get('/my-businesses', authenticate, getUserBusinesses);

// Business balance and transaction endpoints
router.get('/:businessId/balance', authenticate, getBusinessBalance);
router.get('/:businessId/balance/:chain', authenticate, getBusinessChainBalance);
router.get('/:businessId/transactions', authenticate, getBusinessTransactionHistory);
router.post('/withdraw-to-personal', authenticate, withdrawBusinessToPersonal);
router.post('/withdraw-to-mpesa', authenticate, withdrawBusinessToMpesa);
router.get('/:businessId/credit-score', authenticate, getBusinessCreditScore);
router.post('/apply-loan', authenticate, applyBusinessLoan);

export default router;

