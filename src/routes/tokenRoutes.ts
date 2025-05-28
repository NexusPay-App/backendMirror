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
  getWallet 
} from '../controllers/tokenController';
import { validate } from '../middleware/validation';
import {
  sendTokenValidation,
  payMerchantValidation,
  tokenTransferEventsValidation
} from '../middleware/validators/tokenValidators';
import { enforceStrictAuth } from '../middleware/strictAuthMiddleware';

const router = express.Router();

// Protected routes that require strict authentication with OTP verification
router.post('/sendToken', enforceStrictAuth, validate(sendTokenValidation), send);
router.post('/pay', enforceStrictAuth, validate(payMerchantValidation), pay);
router.get('/tokenTransferEvents', enforceStrictAuth, validate(tokenTransferEventsValidation), tokenTransferEvents);

// Account management routes - all require strict authentication
router.post('/unify', enforceStrictAuth, unify);
router.post('/migrate', enforceStrictAuth, migrate);
router.get('/wallet', enforceStrictAuth, getWallet);

export default router;

//################ end new Code for Migrations #####################