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
  transferFundsToPersonal,
} from '../controllers/businessController';
import { enforceStrictAuth } from '../middleware/strictAuthMiddleware';

const router = express.Router();

// All business operations require strict authentication with OTP verification
router.post('/request-upgrade', enforceStrictAuth, requestBusinessCreation);
router.post('/complete-upgrade', enforceStrictAuth, completeBusinessCreation);
router.post('/transfer-funds', enforceStrictAuth, transferFundsToPersonal);

export default router;

