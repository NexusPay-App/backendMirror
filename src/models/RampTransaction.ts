import mongoose, { Schema, Document } from 'mongoose';
import { TokenSymbol } from '../config/tokens';

export enum RampType {
    ON_RAMP = 'ON_RAMP',
    OFF_RAMP = 'OFF_RAMP'
}

export enum RampStatus {
    PENDING = 'PENDING',
    PROCESSING = 'PROCESSING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED'
}

export enum PaymentMethod {
    BANK_TRANSFER = 'BANK_TRANSFER',
    CARD = 'CARD',
    MOBILE_MONEY = 'MOBILE_MONEY',
    MPESA = 'MPESA'
}

export interface IRampTransaction extends Document {
    userId: mongoose.Types.ObjectId;
    type: RampType;
    status: RampStatus;
    paymentMethod: PaymentMethod;
    fiatCurrency: string;
    fiatAmount: number;
    cryptoToken: TokenSymbol;
    cryptoAmount: number;
    feePercentage: number;
    feeAmount: number;
    totalAmount: number;
    paymentReference: string;
    processingTime: number; // in minutes
    createdAt: Date;
    updatedAt: Date;
}

const RampTransactionSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: Object.values(RampType),
        required: true
    },
    status: {
        type: String,
        enum: Object.values(RampStatus),
        default: RampStatus.PENDING
    },
    paymentMethod: {
        type: String,
        enum: Object.values(PaymentMethod),
        required: true
    },
    fiatCurrency: {
        type: String,
        required: true,
        uppercase: true
    },
    fiatAmount: {
        type: Number,
        required: true,
        min: 0
    },
    cryptoToken: {
        type: String,
        required: true,
        enum: ['USDC', 'USDT', 'DAI', 'WBTC', 'WETH', 'ARB']
    },
    cryptoAmount: {
        type: Number,
        required: true,
        min: 0
    },
    feePercentage: {
        type: Number,
        required: true,
        min: 0,
        max: 100
    },
    feeAmount: {
        type: Number,
        required: true,
        min: 0
    },
    totalAmount: {
        type: Number,
        required: true,
        min: 0
    },
    paymentReference: {
        type: String,
        required: true,
        unique: true
    },
    processingTime: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Indexes for faster queries
RampTransactionSchema.index({ userId: 1, type: 1 });
RampTransactionSchema.index({ status: 1 });
RampTransactionSchema.index({ paymentReference: 1 }, { unique: true });
RampTransactionSchema.index({ createdAt: 1 });

export default mongoose.model<IRampTransaction>('RampTransaction', RampTransactionSchema); 