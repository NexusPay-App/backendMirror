// src/models/escrowModel.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IEscrow extends Document {
  transactionId: string;
  userId: mongoose.Types.ObjectId;
  amount: number;
  cryptoAmount: any;
  type: 'fiat_to_crypto' | 'crypto_to_fiat' | 'crypto_to_paybill' | 'crypto_to_till';
  status: 'pending' | 'completed' | 'failed' | 'reserved' | 'error';
  mpesaTransactionId?: string;
  mpesaReceiptNumber?: string;
  cryptoTransactionHash?: string;
  paybillNumber?: string;
  accountNumber?: string;
  tillNumber?: string;
  retryCount: number;
  lastRetryAt?: Date;
  createdAt: Date;
  completedAt?: Date;
  metadata?: {
    successCode?: string;
    directBuy?: boolean;
    [key: string]: any;
  };
}

const escrowSchema: Schema = new Schema({
  transactionId: { 
    type: String, 
    required: true, 
    unique: true 
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  amount: { 
    type: Number, 
    required: true 
  },
  cryptoAmount: { 
    type: mongoose.Schema.Types.Mixed, 
    required: true 
  },
  type: { 
    type: String, 
    enum: ['fiat_to_crypto', 'crypto_to_fiat', 'crypto_to_paybill', 'crypto_to_till'],
    required: true 
  },
  status: { 
    type: String, 
    enum: ['pending', 'completed', 'failed', 'reserved', 'error'],
    default: 'pending'
  },
  mpesaTransactionId: String,
  mpesaReceiptNumber: String,
  cryptoTransactionHash: String,
  paybillNumber: String,
  accountNumber: String,
  tillNumber: String,
  retryCount: { 
    type: Number, 
    default: 0 
  },
  lastRetryAt: Date,
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  completedAt: Date,
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  }
});

// Create indexes for common queries
escrowSchema.index({ userId: 1, createdAt: -1 }); // User's transactions by date
escrowSchema.index({ status: 1, createdAt: 1 }); // Find pending transactions
escrowSchema.index({ mpesaTransactionId: 1 }, { sparse: true }); // Look up by MPESA ID
escrowSchema.index({ transactionId: 1 }, { unique: true }); // Fast lookup by our transaction ID

export const Escrow = mongoose.model<IEscrow>('Escrow', escrowSchema);