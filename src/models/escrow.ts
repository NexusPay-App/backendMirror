import mongoose, { Document, Schema } from 'mongoose';

export interface IEscrow {
  userId: mongoose.Types.ObjectId;
  transactionId: string;
  mpesaReceiptNumber?: string;
  mpesaTransactionId?: string;
  cryptoTransactionHash?: string;
  cryptoAmount: number;
  amount: number;
  tokenType: string;
  chain: string;
  type?: string;
  status: 'pending' | 'completed' | 'failed' | 'processing' | 'reserved' | 'error';
  completedAt?: Date;
  createdAt?: Date;
  retryCount?: number;
  lastRetryAt?: Date;
  metadata?: {
    mpesaPaymentReceived?: boolean;
    [key: string]: any;
  };
}

export interface IEscrowDocument extends IEscrow, Document {}

const escrowSchema = new Schema<IEscrowDocument>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  transactionId: {
    type: String,
    required: true,
    unique: true
  },
  mpesaReceiptNumber: {
    type: String,
    sparse: true
  },
  mpesaTransactionId: {
    type: String,
    sparse: true
  },
  cryptoTransactionHash: {
    type: String,
    sparse: true
  },
  cryptoAmount: {
    type: Number,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  tokenType: {
    type: String,
    required: true,
    default: 'USDC'
  },
  chain: {
    type: String,
    required: true,
    default: 'arbitrum'
  },
  type: {
    type: String
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'processing', 'reserved', 'error'],
    default: 'pending'
  },
  completedAt: {
    type: Date
  },
  retryCount: {
    type: Number,
    default: 0
  },
  lastRetryAt: {
    type: Date
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Check if model already exists to prevent OverwriteModelError
export const Escrow = mongoose.models.Escrow || mongoose.model<IEscrowDocument>('Escrow', escrowSchema); 