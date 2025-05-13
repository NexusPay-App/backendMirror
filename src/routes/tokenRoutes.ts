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
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import {
  sendTokenValidation,
  payMerchantValidation,
  tokenTransferEventsValidation
} from '../middleware/validators/tokenValidators';

const router = express.Router();

// Protected routes that require authentication
router.post('/sendToken', authenticate, validate(sendTokenValidation), send);
router.post('/pay', authenticate, validate(payMerchantValidation), pay);
router.get('/tokenTransferEvents', authenticate, validate(tokenTransferEventsValidation), tokenTransferEvents);

// Account management routes
router.post('/unify', authenticate, unify);
router.post('/migrate', authenticate, migrate);
router.get('/wallet', authenticate, getWallet);

export default router;

//################ end new Code for Migrations #####################