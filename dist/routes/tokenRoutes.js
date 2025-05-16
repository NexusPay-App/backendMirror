"use strict";
// import express from 'express';
// import { send, pay, tokenTransferEvents } from '../controllers/tokenController';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// const router = express.Router();
// router.post('/sendToken', send);
// router.post('/pay', pay);
// router.get('/token-transfer-events', tokenTransferEvents);
// export default router;
//################ new Code for Migrations #####################
const express_1 = __importDefault(require("express"));
const tokenController_1 = require("../controllers/tokenController");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../middleware/validation");
const tokenValidators_1 = require("../middleware/validators/tokenValidators");
const router = express_1.default.Router();
// Protected routes that require authentication
router.post('/sendToken', auth_1.authenticate, (0, validation_1.validate)(tokenValidators_1.sendTokenValidation), tokenController_1.send);
router.post('/pay', auth_1.authenticate, (0, validation_1.validate)(tokenValidators_1.payMerchantValidation), tokenController_1.pay);
router.get('/tokenTransferEvents', auth_1.authenticate, (0, validation_1.validate)(tokenValidators_1.tokenTransferEventsValidation), tokenController_1.tokenTransferEvents);
// Account management routes
router.post('/unify', auth_1.authenticate, tokenController_1.unify);
router.post('/migrate', auth_1.authenticate, tokenController_1.migrate);
router.get('/wallet', auth_1.authenticate, tokenController_1.getWallet);
exports.default = router;
//################ end new Code for Migrations #####################
