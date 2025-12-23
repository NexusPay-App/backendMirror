import mongoose, { Schema, Document } from 'mongoose';

export interface IStellarPaymentChannel extends Document {
  id: string;
  userId: mongoose.Types.ObjectId;
  sourceAccount: string;
  destinationAccount: string;
  asset: string;
  assetIssuer?: string;
  totalAmount: string;
  usedAmount: string;
  sequence: string;
  status: 'active' | 'closed' | 'expired';
  expiresAt: Date;
  closedAt?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const stellarPaymentChannelSchema = new Schema<IStellarPaymentChannel>({
  id: {
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
  sourceAccount: {
    type: String,
    required: true,
    index: true
  },
  destinationAccount: {
    type: String,
    required: true,
    index: true
  },
  asset: {
    type: String,
    required: true
  },
  assetIssuer: {
    type: String
  },
  totalAmount: {
    type: String,
    required: true
  },
  usedAmount: {
    type: String,
    default: '0'
  },
  sequence: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'closed', 'expired'],
    default: 'active',
    index: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  closedAt: {
    type: Date
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Compound indexes
stellarPaymentChannelSchema.index({ userId: 1, status: 1, createdAt: -1 });
stellarPaymentChannelSchema.index({ status: 1, expiresAt: 1 }); // For cleanup jobs

export const StellarPaymentChannel = mongoose.models.StellarPaymentChannel || 
  mongoose.model<IStellarPaymentChannel>('StellarPaymentChannel', stellarPaymentChannelSchema);

