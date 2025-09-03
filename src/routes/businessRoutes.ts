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
  getBusinessesByPhone
} from '../controllers/enhancedBusinessController';
import { enforceStrictAuth } from '../middleware/strictAuthMiddleware';

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

export default router;

