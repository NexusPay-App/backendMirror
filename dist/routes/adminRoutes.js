"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/adminRoutes.ts
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const roleMiddleware_1 = require("../middleware/roleMiddleware");
const validation_1 = require("../middleware/validation");
const adminValidators_1 = require("../middleware/validators/adminValidators");
const adminController_1 = require("../controllers/adminController");
const router = (0, express_1.Router)();
// User management routes
router.get("/users", auth_1.authenticate, roleMiddleware_1.isAdmin, (0, validation_1.validate)(adminValidators_1.getUsersValidation), adminController_1.getUsers);
router.get("/users/:id", auth_1.authenticate, roleMiddleware_1.isAdmin, (0, validation_1.validate)(adminValidators_1.getUserByIdValidation), adminController_1.getUserById);
router.post("/users/promote/:id", auth_1.authenticate, roleMiddleware_1.isAdmin, (0, validation_1.validate)(adminValidators_1.promoteToAdminValidation), adminController_1.promoteToAdmin);
// Transaction management routes
router.get("/transactions", auth_1.authenticate, roleMiddleware_1.isAdmin, adminController_1.getTransactions);
router.get("/transactions/:id", auth_1.authenticate, roleMiddleware_1.isAdmin, (0, validation_1.validate)(adminValidators_1.transactionLookupValidation), adminController_1.getTransactionById);
router.put("/transactions/:id/status", auth_1.authenticate, roleMiddleware_1.isAdmin, adminController_1.updateTransactionStatus);
// Wallet management routes
router.get("/platform-wallets", auth_1.authenticate, roleMiddleware_1.isAdmin, adminController_1.getPlatformWallets);
router.post("/wallets/fund", auth_1.authenticate, roleMiddleware_1.isAdmin, (0, validation_1.validate)(adminValidators_1.walletFundingValidation), adminController_1.fundUserWallet);
router.post("/wallets/withdraw-fees", auth_1.authenticate, roleMiddleware_1.isAdmin, adminController_1.withdrawFeesToMainWallet);
exports.default = router;
