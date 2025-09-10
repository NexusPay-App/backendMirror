// export const User = mongoose.model('User', userSchema);
// import mongoose from 'mongoose';

// const userSchema = new mongoose.Schema({
//   phoneNumber: {
//     type: String,
//     required: true,
//     unique: true
//   },
//   walletAddress: {
//     type: String,
//     required: true,
//     unique: true
//   },
//   password: {
//     type: String,
//     required: true
//   },
//   privateKey: {
//     type: String,
//     required: true,
//     unique: true
//   }
// });

// export const User = mongoose.model('User', userSchema);

//################ Old Code #####################

// src/models/models.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
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
  // ENS subdomain information
  ensSubdomain?: string;
  ensSubdomainCreated?: boolean;
  ensSubdomainTxHash?: string;
  createdAt: Date;
  lastLoginAt?: Date;
}

const userSchema: Schema = new Schema({
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
  // ENS subdomain information
  ensSubdomain: {
    type: String,
    required: false,
    unique: true,
    sparse: true
  },
  ensSubdomainCreated: {
    type: Boolean,
    default: false
  },
  ensSubdomainTxHash: {
    type: String,
    required: false
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastLoginAt: {
    type: Date
  }
});

// Add validation for password field - only required for non-Google auth
userSchema.pre('save', function(next) {
  // For Google OAuth users, password is not required
  if (this.googleId && !this.password) {
    // Google OAuth user without password is allowed
    return next();
  }
  
  // For non-Google users, password is required
  if (!this.googleId && !this.password) {
    return next(new Error('Password is required for non-Google authentication'));
  }
  
  next();
});

// Check if model already exists to prevent OverwriteModelError
export const User = mongoose.models.User || mongoose.model<IUser>('User', userSchema);


//################ end new Code for Migrations #####################