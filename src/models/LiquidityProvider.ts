import mongoose, { Schema, Document } from 'mongoose';
import { TokenSymbol } from '../config/tokens';

export interface ILiquidityProvision extends Document {
    userId: mongoose.Types.ObjectId;
    walletAddress: string;
    token: TokenSymbol;
    amount: number;
    yieldEarned: number;
    lastYieldCalculation: Date;
    isActive: boolean;
    utilizationRate: number; // Percentage of liquidity being used
    createdAt: Date;
    updatedAt: Date;
    transactionHash: string;
    chain: string;
    blockNumber: number;
    blockTimestamp: Date;
    transactionStatus: 'pending' | 'confirmed' | 'failed';
    // zkVerify integration
    zkVerifyProofs?: Array<{
        proofType: string;
        verificationId?: string;
        verificationStatus?: string;
        zkVerifyTxHash?: string;
        submittedAt?: Date;
    }>;
    tier?: 'bronze' | 'silver' | 'gold' | 'platinum';
    tierVerificationId?: string;
    tierLastVerified?: Date;
}

const LiquidityProviderSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    walletAddress: {
        type: String,
        required: true
    },
    token: {
        type: String,
        required: true,
        enum: ['USDC', 'USDT', 'DAI', 'WBTC', 'WETH', 'ARB']
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    yieldEarned: {
        type: Number,
        default: 0,
        min: 0
    },
    lastYieldCalculation: {
        type: Date,
        default: Date.now
    },
    isActive: {
        type: Boolean,
        default: true
    },
    utilizationRate: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    transactionHash: {
        type: String,
        required: true,
        unique: true
    },
    chain: {
        type: String,
        required: true,
        enum: ['arbitrum', 'polygon', 'base', 'optimism', 'celo', 'avalanche', 'bnb']
    },
    blockNumber: {
        type: Number,
        required: true
    },
    blockTimestamp: {
        type: Date,
        required: true
    },
    transactionStatus: {
        type: String,
        required: true,
        enum: ['pending', 'confirmed', 'failed'],
        default: 'pending'
    },
    // zkVerify integration
    zkVerifyProofs: [{
        proofType: String,
        verificationId: String,
        verificationStatus: String,
        zkVerifyTxHash: String,
        submittedAt: Date
    }],
    tier: {
        type: String,
        enum: ['bronze', 'silver', 'gold', 'platinum'],
        default: 'bronze'
    },
    tierVerificationId: String,
    tierLastVerified: Date
}, {
    timestamps: true
});

// Index for faster queries
LiquidityProviderSchema.index({ userId: 1, token: 1 });
LiquidityProviderSchema.index({ walletAddress: 1 });
LiquidityProviderSchema.index({ isActive: 1 });
LiquidityProviderSchema.index({ transactionHash: 1 }, { unique: true });
LiquidityProviderSchema.index({ chain: 1, blockNumber: 1 });
LiquidityProviderSchema.index({ tier: 1 });
LiquidityProviderSchema.index({ 'zkVerifyProofs.verificationId': 1 });

export default mongoose.model<ILiquidityProvision>('LiquidityProvider', LiquidityProviderSchema); 