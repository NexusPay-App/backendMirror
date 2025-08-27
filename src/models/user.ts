import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser {
  phoneNumber?: string;
  email?: string;
  password?: string;
  walletAddress: string;
  role: 'user' | 'admin';
  isVerified: boolean;
  isPhoneVerified: boolean;
  isEmailVerified: boolean;
  googleId?: string;
  authMethods: ('phone' | 'email' | 'google')[];
  lastLogin?: Date;
}

export interface IUserDocument extends IUser, Document {
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUserDocument>({
  phoneNumber: {
    type: String,
    sparse: true,
    unique: true
  },
  email: {
    type: String,
    sparse: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: false
  },
  walletAddress: {
    type: String,
    required: true,
    unique: true
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  isPhoneVerified: {
    type: Boolean,
    default: false
  },
  isEmailVerified: {
    type: Boolean,
    default: false
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
  lastLogin: {
    type: Date
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  try {
    if (!this.password) return false;
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw error;
  }
};

// Add validation for at least one auth method
userSchema.pre('save', function(next) {
  if (this.authMethods.length === 0) {
    return next(new Error('User must have at least one authentication method'));
  }
  
  // Password is required for phone/email auth methods, but not for Google OAuth
  if ((this.authMethods.includes('phone') || this.authMethods.includes('email')) && !this.password) {
    // Only require password if user doesn't have Google auth
    if (!this.authMethods.includes('google')) {
      return next(new Error('Password is required for phone or email authentication'));
    }
  }
  
  // Update isVerified based on auth methods
  if (this.authMethods.includes('google') && this.googleId) {
    this.isEmailVerified = true;
    this.isVerified = true;
  }
  
  if (this.authMethods.includes('phone') && this.isPhoneVerified) {
    this.isVerified = true;
  }
  
  if (this.authMethods.includes('email') && this.isEmailVerified) {
    this.isVerified = true;
  }
  
  next();
});

// Check if model already exists to prevent OverwriteModelError
export const User = mongoose.models.User || mongoose.model<IUserDocument>('User', userSchema); 