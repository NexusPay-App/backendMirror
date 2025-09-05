// import express from 'express';
// import { send, pay, tokenTransferEvents } from '../controllers/tokenController';

// const router = express.Router();

// router.post('/sendToken', send);
// router.post('/pay', pay);
// router.get('/token-transfer-events', tokenTransferEvents);

// export default router;


//################ new Code for Migrations #####################

import express from 'express';
import { 
  send, 
  pay, 
  tokenTransferEvents, 
  unify, 
  migrate, 
  getReceiveInfo,
  getUserBalance,
  getUserBalanceByChain
} from '../controllers/tokenController';
import { validate } from '../middleware/validation';
import {
  sendTokenValidation,
  payMerchantValidation,
  tokenTransferEventsValidation
} from '../middleware/validators/tokenValidators';
import { enforceStrictAuth } from '../middleware/strictAuthMiddleware';
import { authenticate } from '../middleware/auth';
import { balanceQueryLimiter } from '../middleware/rateLimiting';

const router = express.Router();

// Protected routes that require authentication with password + Google auth for security
router.post('/sendToken', authenticate, validate(sendTokenValidation), send);
router.post('/pay', authenticate, validate(payMerchantValidation), pay);
router.get('/tokenTransferEvents', authenticate, validate(tokenTransferEventsValidation), tokenTransferEvents);

// Account management routes - all require strict authentication
router.post('/unify', enforceStrictAuth, unify);
router.post('/migrate', enforceStrictAuth, migrate);

// User wallet endpoints - clean and sleek for UI (basic auth only)
router.get('/receive', authenticate, getReceiveInfo);
router.get('/balance', authenticate, balanceQueryLimiter, getUserBalance);
router.get('/balance/:chain', authenticate, balanceQueryLimiter, getUserBalanceByChain);

export default router;

//################ end new Code for Migrations #####################