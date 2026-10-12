import { protectWalletKey, revealWalletKey, redactAccount } from '../utils/walletKeys';
import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  name?: string;
  status?: 'active' | 'inactive' | 'suspended';
  isVerified?: boolean;
  lastLogin?: Date;
  updatedAt?: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
  phoneNumber?: string;
  email?: string;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  walletAddress: string;
  password?: string;
  privateKey: string;
  tempOtp?: string;
  otpExpires?: number;
  failedPasswordAttempts: number;
  lockoutUntil?: number;
  isUnified: boolean;
  role?: string;
  googleId?: string;
  authMethods: ('phone' | 'email' | 'google')[];
  createdAt: Date;
  lastLoginAt?: Date;
}

const userSchema: Schema = new Schema({
  name: String,
  status: { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' },
  isVerified: { type: Boolean, default: false },
  lastLogin: Date,
  updatedAt: Date,
  phoneNumber: {
    type: String,
    required: false,
    unique: true,
    sparse: true, // This allows null values to be excluded from uniqueness constraint
    default: undefined // Change from null to undefined to avoid the duplicate key issue
  },
  email: {
    type: String,
    required: false,
    unique: true,
    lowercase: true,
    trim: true,
    sparse: true, // Allows null values to not count toward uniqueness constraint
    default: undefined // Change from null to undefined to avoid the duplicate key issue
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  isPhoneVerified: {
    type: Boolean,
    default: false
  },
  walletAddress: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: false,
  },
  privateKey: {
    type: String,
    set: protectWalletKey,
    get: revealWalletKey,
    required: true,
  },
  tempOtp: {
    type: String,
    required: false,
  },
  otpExpires: {
    type: Number,
    required: false,
  },
  failedPasswordAttempts: {
    type: Number,
    required: true,
    default: 0,
  },
  lockoutUntil: {
    type: Number,
    required: false,
  },
  isUnified: {
    type: Boolean,
    required: true,
    default: false,
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'support'],
    default: 'user'
  },
  googleId: {
    type: String,
    sparse: true,
    unique: true
  },
  authMethods: [{
    type: String,
    enum: ['phone', 'email', 'google']
  }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastLoginAt: {
    type: Date
  }
});

// Auth services already hash passwords. Hash only new plaintext values so existing
// bcrypt credentials are never hashed twice when an additive wallet field is saved.
userSchema.pre('save', async function() {
  if (!this.googleId && !this.password) throw new Error('Password is required for non-Google authentication');
  if (this.isModified('password') && this.password && !/^\$2[aby]\$\d{2}\$/.test(String(this.password))) {
    this.password = await bcrypt.hash(String(this.password), 10);
  }
});
userSchema.methods.comparePassword = async function(candidatePassword: string) {
  return this.password ? bcrypt.compare(candidatePassword, this.password) : false;
};
userSchema.set('toJSON', { transform: redactAccount });
export const User = mongoose.models.User || mongoose.model<IUser>('User', userSchema);
