// src/models/escrowModel.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IEscrow extends Document {
  transactionId: string;
  userId: mongoose.Types.ObjectId;
  businessId?: mongoose.Types.ObjectId;
  amount: number;
  cryptoAmount: number;
  type: 'fiat_to_crypto' | 'crypto_to_fiat' | 'crypto_to_paybill' | 'crypto_to_till' | 'token_transfer' | 'platform_operation' | 'business_to_personal' | 'business_crypto_to_fiat';
  status: 'pending' | 'reserved' | 'processing' | 'completed' | 'failed' | 'error';
  cryptoTransactionHash?: string;
  mpesaTransactionId?: string;
  mpesaReceiptNumber?: string;
  paybillNumber?: string;
  accountNumber?: string;
  tillNumber?: string;
  fromAddress?: string;
  toAddress?: string;
  tokenType?: string;
  chain?: string;
  phoneNumber?: string;
  completedAt?: Date;
  retryCount?: number;
  lastRetryAt?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
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
  businessId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Business' 
  },
  amount: { 
    type: Number, 
    required: true 
  },
  cryptoAmount: { 
    type: Number, 
    required: true 
  },
  type: { 
    type: String, 
    enum: ['fiat_to_crypto', 'crypto_to_fiat', 'crypto_to_paybill', 'crypto_to_till', 'token_transfer', 'platform_operation', 'business_to_personal', 'business_crypto_to_fiat'],
    required: true 
  },
  status: { 
    type: String, 
    enum: ['pending', 'reserved', 'processing', 'completed', 'failed', 'error'],
    default: 'pending'
  },
  cryptoTransactionHash: {
    type: String
  },
  mpesaTransactionId: {
    type: String
  },
  mpesaReceiptNumber: {
    type: String
  },
  paybillNumber: {
    type: String
  },
  accountNumber: {
    type: String
  },
  tillNumber: {
    type: String
  },
  fromAddress: {
    type: String
  },
  toAddress: {
    type: String
  },
  tokenType: {
    type: String
  },
  chain: {
    type: String
  },
  phoneNumber: {
    type: String
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
    type: mongoose.Schema.Types.Mixed
  }
}, { timestamps: true });

// Create indexes for common queries
escrowSchema.index({ transactionId: 1 }, { unique: true });
escrowSchema.index({ userId: 1 });
escrowSchema.index({ status: 1 });
escrowSchema.index({ mpesaTransactionId: 1 });
escrowSchema.index({ mpesaReceiptNumber: 1 });
escrowSchema.index({ 'metadata.queuedTxId': 1 });
escrowSchema.index({ createdAt: 1 });
escrowSchema.index({ userId: 1, createdAt: -1 });
escrowSchema.index({ status: 1, createdAt: -1 });
escrowSchema.index({ 
  status: 1, 
  type: 1, 
  createdAt: -1 
}, { 
  name: 'status_type_created' 
});

// Check if model already exists to prevent OverwriteModelError
export const Escrow = mongoose.models.Escrow || mongoose.model<IEscrow>('Escrow', escrowSchema);