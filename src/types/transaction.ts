/**
 * Transaction type definitions
 */

/**
 * Supported transaction types in the system
 */
export type TransactionType = 
  | 'platform_to_user'   // Platform wallet sending tokens to user
  | 'user_to_platform'   // User sending tokens to platform 
  | 'user_to_external'   // User sending tokens to external address
  | 'external_to_user'   // External address sending tokens to user
  | 'mpesa_to_escrow'    // M-Pesa payment to escrow account
  | 'escrow_to_user';    // Escrow releasing funds to user

/**
 * Transaction priority levels
 */
export type TransactionPriority = 'high' | 'normal' | 'low';

/**
 * Transaction status values
 */
export type TransactionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'error';

/**
 * Queued transaction interface
 */
export interface QueuedTransaction {
  id: string;
  toAddress: string;
  amount: number;
  chainName: string;
  tokenType: string;
  timestamp: number;
  attempts: number;
  lastAttempt?: number;
  error?: string;
  priority?: TransactionPriority;
  batchId?: string;
  isProcessing?: boolean;
  userId?: string;
  escrowId?: string;
  metadata?: Record<string, any>;
}

/**
 * Transaction log entry structure
 */
export interface TransactionLog {
  txId?: string;
  txHash?: string;
  fromAddress?: string;
  toAddress?: string;
  amount?: number;
  tokenType?: string;
  chainName?: string;
  status: TransactionStatus;
  type: TransactionType;
  error?: string;
  executionTimeMs?: number;
  mpesaReceiptNumber?: string;
  escrowId?: string;
  userId?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt?: Date;
}

/**
 * Transaction metrics interface
 */
export interface TransactionMetrics {
  timeframe: number;
  totalCount: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  avgExecutionTimeMs: number;
  slowTransactionsCount: number;
  slowTransactionsRate: number;
  error?: string;
} 