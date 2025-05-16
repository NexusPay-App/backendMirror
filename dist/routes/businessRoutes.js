"use strict";
// import express from 'express';
// import { registerBusiness } from '../controllers/businessController';
Object.defineProperty(exports, "__esModule", { value: true });
// const router = express.Router();
// router.post('/', registerBusiness);
// export default router;
// src/routes/businessRoutes.ts
const express_1 = require("express");
const businessController_1 = require("../controllers/businessController");
const router = (0, express_1.Router)();
// Define business-related routes
router.post('/request-upgrade', businessController_1.requestBusinessCreation);
router.post('/complete-upgrade', businessController_1.completeBusinessCreation);
router.post('/transfer-funds', businessController_1.transferFundsToPersonal);
exports.default = router;
