import mongoose, { Schema, Document } from 'mongoose';

export interface IStellarTransaction extends Document {
  transactionId: string;
  userId: mongoose.Types.ObjectId;
  type: 'deposit' | 'withdrawal' | 'payment' | 'swap' | 'trustline';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  
  // Stellar details
  stellarTransactionHash?: string;
  fromAccountId?: string;
  toAccountId?: string;
  asset: string; // XLM, USDC, USDT, BTC
  assetIssuer?: string;
  amount: string; // Stellar amounts as strings for precision
  fee: string;
  memo?: string;
  
  // M-Pesa details (for deposits/withdrawals)
  mpesaCheckoutRequestId?: string;
  mpesaTransactionId?: string;
  mpesaReceiptNumber?: string;
  mpesaConversationId?: string;
  phoneNumber?: string;
  amountKES?: number;
  exchangeRate?: number;
  
  // Metadata
  metadata?: Record<string, any>;
  error?: string;
  retryCount: number;
  lastRetryAt?: Date;
  completedAt?: Date;
  
  createdAt: Date;
  updatedAt: Date;
}

const stellarTransactionSchema = new Schema<IStellarTransaction>({
  transactionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['deposit', 'withdrawal', 'payment', 'swap', 'trustline'],
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
    index: true
  },
  
  // Stellar details
  stellarTransactionHash: {
    type: String,
    index: true
  },
  fromAccountId: {
    type: String
  },
  toAccountId: {
    type: String
  },
  asset: {
    type: String,
    required: true,
    index: true
  },
  assetIssuer: {
    type: String
  },
  amount: {
    type: String,
    required: true
  },
  fee: {
    type: String,
    default: '0'
  },
  memo: {
    type: String,
    maxlength: 28
  },
  
  // M-Pesa details
  mpesaCheckoutRequestId: {
    type: String,
    index: true
  },
  mpesaTransactionId: {
    type: String,
    index: true
  },
  mpesaReceiptNumber: {
    type: String,
    index: true
  },
  mpesaConversationId: {
    type: String,
    index: true
  },
  phoneNumber: {
    type: String
  },
  amountKES: {
    type: Number
  },
  exchangeRate: {
    type: Number
  },
  
  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  error: {
    type: String
  },
  retryCount: {
    type: Number,
    default: 0
  },
  lastRetryAt: {
    type: Date
  },
  completedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Compound indexes for common queries
stellarTransactionSchema.index({ userId: 1, createdAt: -1 });
stellarTransactionSchema.index({ userId: 1, status: 1, createdAt: -1 });
stellarTransactionSchema.index({ userId: 1, type: 1, createdAt: -1 });
stellarTransactionSchema.index({ status: 1, createdAt: 1 }); // For retry jobs
stellarTransactionSchema.index({ mpesaCheckoutRequestId: 1 }, { sparse: true });
stellarTransactionSchema.index({ stellarTransactionHash: 1 }, { sparse: true });

// Check if model already exists
export const StellarTransaction = mongoose.models.StellarTransaction || 
  mongoose.model<IStellarTransaction>('StellarTransaction', stellarTransactionSchema);

