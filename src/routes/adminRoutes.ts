// src/routes/adminRoutes.ts
import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { isAdmin } from "../middleware/roleMiddleware";
import { validate } from "../middleware/validation";
import { 
    getUsersValidation,
    getUserByIdValidation,
    promoteToAdminValidation,
    transactionLookupValidation,
    walletFundingValidation
} from "../middleware/validators/adminValidators";

import {
    getUsers,
    getUserById,
    promoteToAdmin,
    getTransactions,
    getTransactionById,
    updateTransactionStatus,
    getPlatformWallets,
    fundUserWallet,
    withdrawFeesToMainWallet,
    triggerTransactionStatusCorrection
} from "../controllers/adminController";

const router = Router();

// User management routes
router.get("/users", authenticate, isAdmin, validate(getUsersValidation), getUsers);
router.get("/users/:id", authenticate, isAdmin, validate(getUserByIdValidation), getUserById);
router.post("/users/promote/:id", authenticate, isAdmin, validate(promoteToAdminValidation), promoteToAdmin);

// Transaction management routes
router.get("/transactions", authenticate, isAdmin, getTransactions);
router.get("/transactions/:id", authenticate, isAdmin, validate(transactionLookupValidation), getTransactionById);
router.put("/transactions/:id/status", authenticate, isAdmin, updateTransactionStatus);
router.post("/transactions/fix-statuses", authenticate, isAdmin, triggerTransactionStatusCorrection);

// Wallet management routes
router.get("/platform-wallets", authenticate, isAdmin, getPlatformWallets);
router.post("/wallets/fund", authenticate, isAdmin, validate(walletFundingValidation), fundUserWallet);
router.post("/wallets/withdraw-fees", authenticate, isAdmin, withdrawFeesToMainWallet);

export default router; 