// import { Router } from "express"
// import {cryptoToFiat, mpesaDeposit, mpesaWithdraw, mpesaB2CWebhook, mpesaQueueWebhook, mpesaSTKPushWebhook } from "../controllers/mpesaController"
// import { authenticateToken } from "../middleware/authMiddleware"
// //import { mpesaDeposit, mpesaWithdraw, mpesaB2CWebhook, mpesaQueueWebhook, mpesaSTKPushWebhook } from "../controllers/mpesaController"


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
import { Router } from "express";
import { 
    mpesaDeposit, 
    withdrawToMpesa,
    payToPaybill,
    payToTill,
    mpesaB2CWebhook, 
    mpesaQueueWebhook, 
    mpesaSTKPushWebhook,
    getTransactionStatus
} from "../controllers/mpesaController";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validation";
import {
    depositValidation,
    withdrawValidation,
    paybillValidation,
    tillValidation,
    transactionStatusValidation
} from "../middleware/validators/mpesaValidators";

const router = Router();

// Protected routes (require authentication)
router.post("/deposit", authenticate, validate(depositValidation), mpesaDeposit);
router.post("/withdraw", authenticate, validate(withdrawValidation), withdrawToMpesa);
router.post("/paybill", authenticate, validate(paybillValidation), payToPaybill);
router.post("/till", authenticate, validate(tillValidation), payToTill);
router.get("/transaction/:transactionId", authenticate, validate(transactionStatusValidation), getTransactionStatus);

// Webhook routes (no authentication needed)
router.post("/b2c/result", mpesaB2CWebhook);
router.post("/stk-push/result", mpesaSTKPushWebhook);
router.post("/queue", mpesaQueueWebhook);
router.post("/paybill/result", mpesaSTKPushWebhook);
router.post("/till/result", mpesaSTKPushWebhook);

export default router;