import { protectWalletKey, revealWalletKey, redactAccount } from '../utils/walletKeys';
import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

// Migration mirror configuration
export const MIGRATION_URI = process.env.MONGODB_MIGRATION_URI;
// If not set, mirroring is disabled (best-effort only)

/**
 * True when MONGODB_MIGRATION_URI resolves to the primary database. A mirror
 * onto the same db is meaningless and harmful: the mirror insert lands first
 * and the real save then fails with a duplicate-key error.
 */
export function migrationTargetIsPrimary(): boolean {
  if (!MIGRATION_URI) return false;
  try {
    const db = new URL(MIGRATION_URI).pathname.replace(/^\//, '') || 'test';
    return db === mongoose.connection.name;
  } catch {
    return false;
  }
}

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
  walletAddress?: string;
  password?: string;
  privateKey?: string;
  walletStatus?: 'pending' | 'ready';
  walletRecreateRequired?: boolean;
  walletAddressHistory?: { address?: string; replacedAt?: Date; reason?: string }[];
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
  securityVersion: { type: Number, default: 0 },
  recoveryRestrictedUntil: Date,
  signerReference: String,
  ownerAddress: String,
  walletStatus: { type: String, enum: ['pending', 'ready'] },
  // Set when the stored wallet is unusable (key/address mismatch). Cleared
  // automatically when a fresh verified wallet is provisioned at authentication.
  walletRecreateRequired: { type: Boolean, default: false },
  walletAddressHistory: { type: [{ address: String, replacedAt: Date, reason: String }], default: undefined },
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
    required: false,
  },
  password: {
    type: String,
    required: false,
  },
  privateKey: {
    type: String,
    set: protectWalletKey,
    get: revealWalletKey,
    select: false,
    required: false,
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

// One reused mirror connection per process: no per-save TLS handshake, no leak.
let migrationUserConn: Promise<mongoose.Connection> | undefined;

// Auth services already hash passwords. Hash only new plaintext values so existing
// bcrypt credentials are never hashed twice when an additive wallet field is saved.
userSchema.pre('save', async function() {
  if (!this.googleId && !this.password) throw new Error('Password is required for non-Google authentication');
  if (this.isModified('password') && this.password && !/^\$2[aby]\$\d{2}\$/.test(String(this.password))) {
    this.password = await bcrypt.hash(String(this.password), 10);
  }
  // Mirror user to MONGODB_MIGRATION_URI on save (best-effort). Only mirror
  // saves from the primary connection: the mirror model compiles this same
  // schema, and without the guard its save hook would recurse forever.
  if (MIGRATION_URI && (this.constructor as any).db === mongoose.connection && !migrationTargetIsPrimary()) {
    try {
      if (!migrationUserConn) {
        migrationUserConn = mongoose.createConnection(MIGRATION_URI, { autoIndex: false }).asPromise();
      }
      const conn = await migrationUserConn;
      const migrationUserModel = conn.models.MirrorUser || conn.model('MirrorUser', userSchema, 'users');
      const payload = { ...this.toObject(), _id: this._id };
      const existing = await migrationUserModel.findOne({ _id: this._id });
      if (!existing) {
        await migrationUserModel.create(payload);
      } else {
        await migrationUserModel.updateOne({ _id: this._id }, { $set: payload });
      }
    } catch (e) {
      // Non-fatal: migration mirror is best-effort
    }
  }
});
userSchema.methods.comparePassword = async function(candidatePassword: string) {
  return this.password ? bcrypt.compare(candidatePassword, this.password) : false;
};
userSchema.set('toJSON', { transform: redactAccount });
export const User = mongoose.models.User || mongoose.model<IUser>('User', userSchema);
