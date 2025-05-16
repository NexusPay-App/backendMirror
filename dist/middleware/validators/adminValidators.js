"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletFundingValidation = exports.transactionLookupValidation = exports.promoteToAdminValidation = exports.getUserByIdValidation = exports.getUsersValidation = void 0;
const zod_1 = require("zod");
// User listing validation
exports.getUsersValidation = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.string().optional().transform(val => val ? parseInt(val) : 1),
        limit: zod_1.z.string().optional().transform(val => val ? parseInt(val) : 10),
        role: zod_1.z.enum(['user', 'admin', 'support']).optional(),
        search: zod_1.z.string().optional()
    })
});
// User lookup validation
exports.getUserByIdValidation = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(24).max(24)
    })
});
// Promote to admin validation
exports.promoteToAdminValidation = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(24).max(24)
    })
});
// Transaction lookup validation
exports.transactionLookupValidation = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1)
    })
});
// Wallet funding validation
exports.walletFundingValidation = zod_1.z.object({
    body: zod_1.z.object({
        userId: zod_1.z.string().min(24).max(24),
        amount: zod_1.z.number().positive(),
        chainName: zod_1.z.string().min(1).default('celo')
    })
});
