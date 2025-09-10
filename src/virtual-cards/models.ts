import mongoose, { Document, Schema } from 'mongoose';
import { VirtualCard, CardTransaction, SpendingLimits } from './types';

export interface IVirtualCard extends Omit<VirtualCard, 'id'>, Document {
  id: string;
}

export interface ICardTransaction extends Omit<CardTransaction, 'id'>, Document {
  id: string;
}

const SpendingLimitsSchema = new Schema<SpendingLimits>({
  daily: { type: Number, default: 1000, min: 0 },
  monthly: { type: Number, default: 10000, min: 0 },
  perTransaction: { type: Number, default: 500, min: 0 }
}, { _id: false });

const VirtualCardSchema = new Schema<IVirtualCard>({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  walletAddress: { type: String, required: true, index: true },
  cardNumber: { type: String, required: true },
  expiryDate: { type: String, required: true },
  cvv: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['ACTIVE', 'FROZEN', 'CANCELLED', 'PENDING'],
    default: 'PENDING'
  },
  spendingLimits: { type: SpendingLimitsSchema, required: true },
  balance: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: 'USD' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const CardTransactionSchema = new Schema<ICardTransaction>({
  id: { type: String, required: true, unique: true },
  cardId: { type: String, required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true },
  merchant: { type: String, required: true },
  description: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'],
    default: 'PENDING'
  },
  createdAt: { type: Date, default: Date.now }
});

// Indexes for performance
VirtualCardSchema.index({ userId: 1, status: 1 });
VirtualCardSchema.index({ walletAddress: 1 });
CardTransactionSchema.index({ cardId: 1, createdAt: -1 });

export const VirtualCardModel = mongoose.model<IVirtualCard>('VirtualCard', VirtualCardSchema);
export const CardTransactionModel = mongoose.model<ICardTransaction>('CardTransaction', CardTransactionSchema);
