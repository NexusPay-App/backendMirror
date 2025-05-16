"use strict";
// import { Router } from "express"
// import {cryptoToFiat, mpesaDeposit, mpesaWithdraw, mpesaB2CWebhook, mpesaQueueWebhook, mpesaSTKPushWebhook } from "../controllers/mpesaController"
// import { authenticateToken } from "../middleware/authMiddleware"
// //import { mpesaDeposit, mpesaWithdraw, mpesaB2CWebhook, mpesaQueueWebhook, mpesaSTKPushWebhook } from "../controllers/mpesaController"
Object.defineProperty(exports, "__esModule", { value: true });
// const router = Router()
// router.post("/deposit", authenticateToken, mpesaDeposit)
// router.post("/withdraw", authenticateToken, mpesaWithdraw)
// router.post("/b2c/result", mpesaB2CWebhook)
// router.post("/stk-push/result", mpesaSTKPushWebhook)
// router.post("/queue", mpesaQueueWebhook)
// router.post("/crypto-to-fiat", authenticateToken, cryptoToFiat);
// export default router
// src/routes/mpesaRoutes.ts
// src/routes/mpesaRoutes.ts
// src/routes/mpesaRoutes.ts
const express_1 = require("express");
const mpesaController_1 = require("../controllers/mpesaController");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../middleware/validation");
const mpesaValidators_1 = require("../middleware/validators/mpesaValidators");
const router = (0, express_1.Router)();
// Protected routes (require authentication)
router.post("/deposit", auth_1.authenticate, (0, validation_1.validate)(mpesaValidators_1.depositValidation), mpesaController_1.mpesaDeposit);
router.post("/withdraw", auth_1.authenticate, (0, validation_1.validate)(mpesaValidators_1.withdrawValidation), mpesaController_1.withdrawToMpesa);
router.post("/paybill", auth_1.authenticate, (0, validation_1.validate)(mpesaValidators_1.paybillValidation), mpesaController_1.payToPaybill);
router.post("/till", auth_1.authenticate, (0, validation_1.validate)(mpesaValidators_1.tillValidation), mpesaController_1.payToTill);
router.post("/buy-crypto", auth_1.authenticate, (0, validation_1.validate)(mpesaValidators_1.buyCryptoValidation), mpesaController_1.buyCrypto);
router.get("/transaction/:transactionId", auth_1.authenticate, (0, validation_1.validate)(mpesaValidators_1.transactionStatusValidation), mpesaController_1.getTransactionStatus);
// Platform wallet management (admin endpoints)
router.get("/platform-wallets", auth_1.authenticate, mpesaController_1.getPlatformWalletStatus);
router.post("/withdraw-fees", auth_1.authenticate, mpesaController_1.withdrawFeesToMainWallet);
// Webhook routes (no authentication needed)
router.post("/b2c/result", mpesaController_1.mpesaB2CWebhook);
router.post("/stk-push/result", mpesaController_1.mpesaSTKPushWebhook);
router.post("/queue", mpesaController_1.mpesaQueueWebhook);
router.post("/paybill/result", mpesaController_1.mpesaSTKPushWebhook);
router.post("/till/result", mpesaController_1.mpesaSTKPushWebhook);
exports.default = router;
