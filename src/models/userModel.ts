import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  phoneNumber: string;
  password: string;
  walletAddress: string;
  role: 'user' | 'admin';
  status: 'active' | 'inactive' | 'suspended';
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema: Schema = new Schema({
  name: { 
    type: String, 
    required: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true,
    trim: true
  },
  phoneNumber: { 
    type: String, 
    required: true,
    unique: true
  },
  password: { 
    type: String, 
    required: true 
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
  status: { 
    type: String, 
    enum: ['active', 'inactive', 'suspended'], 
    default: 'active' 
  },
  lastLogin: {
    type: Date
  }
}, { timestamps: true });

// Create indexes for common queries
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ phoneNumber: 1 }, { unique: true });
userSchema.index({ walletAddress: 1 }, { unique: true });
userSchema.index({ createdAt: 1 });

// Check if model already exists to prevent OverwriteModelError
export const User = mongoose.models.User || mongoose.model<IUser>('User', userSchema); 