import mongoose, { Schema, Document } from 'mongoose';

export interface IBusiness extends Document {
  businessName: string;
  ownerName: string;
  location: string;
  businessType: string;
  phoneNumber: string;
  merchantId: string;
  uniqueCode: string;
  walletAddress: string;
  privateKey: string;
  userId: mongoose.Types.ObjectId;
  
  // Enhanced Business Features
  creditLimit: number; // Maximum overdraft amount in USDC
  currentCredit: number; // Current amount borrowed
  availableCredit: number; // Remaining credit available
  creditScore: number; // 0-1000 credit score
  totalVolume: number; // Total transaction volume in USDC
  monthlyVolume: number; // Monthly transaction volume
  lastVolumeUpdate: Date;
  
  // Overdraft/Loan Management
  overdraftEnabled: boolean;
  overdraftHistory: Array<{
    transactionId: string;
    amount: number;
    type: 'borrow' | 'repay';
    timestamp: Date;
    status: 'pending' | 'completed' | 'failed';
    transactionHash?: string;
  }>;
  
  // Risk Management
  riskLevel: 'low' | 'medium' | 'high';
  lastRiskAssessment: Date;
  paymentHistory: Array<{
    transactionId: string;
    amount: number;
    timestamp: Date;
    status: 'completed' | 'failed';
    type: 'incoming' | 'outgoing';
  }>;
  
  // Business Verification
  isVerified: boolean;
  verificationDocuments: Array<{
    type: 'business_license' | 'id_card' | 'utility_bill' | 'bank_statement';
    url: string;
    verifiedAt?: Date;
    status: 'pending' | 'approved' | 'rejected';
  }>;
  
  // Settings
  autoRepayment: boolean; // Auto-repay overdraft from incoming payments
  notifications: {
    email: boolean;
    sms: boolean;
    push: boolean;
  };
  // PIN security
  pinHash?: string;
  pinSetAt?: Date;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const businessSchema: Schema = new Schema({
  businessName: {
    type: String,
    required: true,
    unique: true,
  },
  ownerName: {
    type: String,
    required: true,
  },
  location: {
    type: String,
    required: true,
  },
  businessType: {
    type: String,
    required: true,
  },
  phoneNumber: {
    type: String,
    required: true,
  },
  merchantId: {
    type: String,
    required: true,
    unique: true,
  },
  uniqueCode: {
    type: String,
    required: true,
    unique: true,
  },
  walletAddress: {
    type: String,
    required: true,
    unique: true,
  },
  privateKey: {
    type: String,
    required: true,
    unique: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  
  // Enhanced Business Features
  creditLimit: {
    type: Number,
    default: 0, // Start with no credit limit
    min: 0,
    max: 10000 // Maximum $10,000 credit limit for startup safety
  },
  currentCredit: {
    type: Number,
    default: 0,
    min: 0
  },
  availableCredit: {
    type: Number,
    default: 0,
    min: 0
  },
  creditScore: {
    type: Number,
    default: 300, // Start with low credit score
    min: 0,
    max: 1000
  },
  totalVolume: {
    type: Number,
    default: 0,
    min: 0
  },
  monthlyVolume: {
    type: Number,
    default: 0,
    min: 0
  },
  lastVolumeUpdate: {
    type: Date,
    default: Date.now
  },
  
  // Overdraft/Loan Management
  overdraftEnabled: {
    type: Boolean,
    default: false
  },
  overdraftHistory: [{
    transactionId: {
      type: String,
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    type: {
      type: String,
      enum: ['borrow', 'repay'],
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending'
    },
    transactionHash: String
  }],
  
  // Risk Management
  riskLevel: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'high' // Start with high risk for new businesses
  },
  lastRiskAssessment: {
    type: Date,
    default: Date.now
  },
  paymentHistory: [{
    transactionId: {
      type: String,
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['completed', 'failed'],
      required: true
    },
    type: {
      type: String,
      enum: ['incoming', 'outgoing'],
      required: true
    }
  }],
  
  // Business Verification
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationDocuments: [{
    type: {
      type: String,
      enum: ['business_license', 'id_card', 'utility_bill', 'bank_statement'],
      required: true
    },
    url: {
      type: String,
      required: true
    },
    verifiedAt: Date,
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    }
  }],
  
  // Settings
  autoRepayment: {
    type: Boolean,
    default: true // Enable auto-repayment by default
  },
  notifications: {
    email: {
      type: Boolean,
      default: true
    },
    sms: {
      type: Boolean,
      default: true
    },
    push: {
      type: Boolean,
      default: false
    }
  },
  // PIN security (hashed)
  pinHash: {
    type: String,
    required: false
  },
  pinSetAt: {
    type: Date,
    required: false
  }
}, { 
  timestamps: true,
  strict: true
});

// Create indexes
businessSchema.index({ merchantId: 1 }, { unique: true });
businessSchema.index({ walletAddress: 1 }, { unique: true });
businessSchema.index({ phoneNumber: 1 });
businessSchema.index({ userId: 1 });
businessSchema.index({ creditScore: 1 });
businessSchema.index({ riskLevel: 1 });

// Virtual for available credit calculation
businessSchema.virtual('calculatedAvailableCredit').get(function() {
  return Math.max(0, this.creditLimit - this.currentCredit);
});

// Pre-save middleware to update available credit
businessSchema.pre('save', function(next) {
  this.availableCredit = this.calculatedAvailableCredit;
  next();
});

// Method to calculate credit score based on payment history
businessSchema.methods.calculateCreditScore = function() {
  const completedPayments = this.paymentHistory.filter((p: any) => p.status === 'completed');
  const totalPayments = this.paymentHistory.length;
  
  if (totalPayments === 0) return 300; // Base score for new businesses
  
  const successRate = completedPayments.length / totalPayments;
  const volumeScore = Math.min(this.totalVolume / 1000, 400); // Max 400 points for volume
  const consistencyScore = Math.min(completedPayments.length * 10, 300); // Max 300 points for consistency
  
  return Math.round(300 + (successRate * 200) + volumeScore + consistencyScore);
};

// Method to assess risk level
businessSchema.methods.assessRiskLevel = function() {
  const creditScore = this.creditScore;
  const paymentSuccessRate = this.paymentHistory.length > 0 
    ? this.paymentHistory.filter((p: any) => p.status === 'completed').length / this.paymentHistory.length 
    : 0;
  
  if (creditScore >= 700 && paymentSuccessRate >= 0.95) return 'low';
  if (creditScore >= 500 && paymentSuccessRate >= 0.85) return 'medium';
  return 'high';
};

// Method to calculate credit limit based on volume and credit score
businessSchema.methods.calculateCreditLimit = function() {
  const baseLimit = 100; // Base $100 limit
  const volumeMultiplier = Math.min(this.totalVolume / 1000, 5); // Max 5x multiplier
  const scoreMultiplier = this.creditScore / 1000; // 0-1 multiplier based on credit score
  
  const calculatedLimit = baseLimit * (1 + volumeMultiplier) * (1 + scoreMultiplier);
  return Math.min(calculatedLimit, 10000); // Cap at $10,000
};

// Export the model
export const Business = mongoose.models.Business || mongoose.model<IBusiness>('Business', businessSchema);
