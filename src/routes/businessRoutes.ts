// import express from 'express';
// import { registerBusiness } from '../controllers/businessController';

// const router = express.Router();

// router.post('/', registerBusiness);

// export default router;

// src/routes/businessRoutes.ts

import { Router } from 'express';
import {
  requestBusinessCreation,
  completeBusinessCreation,
  transferFundsToPersonal,
} from '../controllers/businessController';

const router: Router = Router();

// Define business-related routes
router.post('/request-upgrade', requestBusinessCreation);
router.post('/complete-upgrade', completeBusinessCreation);
router.post('/transfer-funds', transferFundsToPersonal);

export default router;

