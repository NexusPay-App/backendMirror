import mongoose, { Schema, Document } from 'mongoose';

export interface IStellarMultiSigWallet extends Document {
  id: string;
  userId: mongoose.Types.ObjectId;
  accountId: string;
  signers: Array<{
    publicKey: string;
    weight: number;
  }>;
  threshold: {
    low: number;
    medium: number;
    high: number;
  };
  isActive: boolean;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const stellarMultiSigWalletSchema = new Schema<IStellarMultiSigWallet>({
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
  accountId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  signers: [{
    publicKey: {
      type: String,
      required: true
    },
    weight: {
      type: Number,
      required: true,
      min: 0,
      max: 255
    }
  }],
  threshold: {
    low: {
      type: Number,
      required: true,
      min: 0,
      max: 255
    },
    medium: {
      type: Number,
      required: true,
      min: 0,
      max: 255
    },
    high: {
      type: Number,
      required: true,
      min: 0,
      max: 255
    }
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Compound indexes
stellarMultiSigWalletSchema.index({ userId: 1, isActive: 1, createdAt: -1 });

export const StellarMultiSigWallet = mongoose.models.StellarMultiSigWallet || 
  mongoose.model<IStellarMultiSigWallet>('StellarMultiSigWallet', stellarMultiSigWalletSchema);

