import { z } from 'zod';

// User listing validation
export const getUsersValidation = z.object({
  query: z.object({
    page: z.string().optional().transform(val => val ? parseInt(val) : 1),
    limit: z.string().optional().transform(val => val ? parseInt(val) : 10),
    role: z.enum(['user', 'admin', 'support']).optional(),
    search: z.string().optional()
  })
});

// User lookup validation
export const getUserByIdValidation = z.object({
  params: z.object({
    id: z.string().min(24).max(24)
  })
});

// Promote to admin validation
export const promoteToAdminValidation = z.object({
  params: z.object({
    id: z.string().min(24).max(24)
  })
});

// Transaction lookup validation
export const transactionLookupValidation = z.object({
  params: z.object({
    id: z.string().min(1)
  })
});

// Wallet funding validation
export const walletFundingValidation = z.object({
  body: z.object({
    userId: z.string().min(24).max(24),
    amount: z.number().positive(),
    chainName: z.string().min(1).default('celo')
  })
}); 