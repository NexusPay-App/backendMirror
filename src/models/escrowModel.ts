// src/models/escrowModel.ts
import mongoose from 'mongoose';

const escrowSchema = new mongoose.Schema({
    transactionId: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    cryptoAmount: { type: mongoose.Schema.Types.Mixed, required: true }, // Can be Number or String due to precision
    type: { 
        type: String, 
        enum: ['fiat_to_crypto', 'crypto_to_fiat', 'crypto_to_paybill', 'crypto_to_till'],
        required: true 
    },
    status: { 
        type: String, 
        enum: ['pending', 'completed', 'failed'],
        default: 'pending'
    },
    mpesaTransactionId: String,
    cryptoTransactionHash: String,
    paybillNumber: String,
    accountNumber: String,
    tillNumber: String,
    retryCount: { type: Number, default: 0 },
    lastRetryAt: Date,
    createdAt: { type: Date, default: Date.now },
    completedAt: Date
});

// Create indexes for common queries
escrowSchema.index({ userId: 1, createdAt: -1 }); // User's transactions by date
escrowSchema.index({ status: 1, createdAt: 1 }); // Find pending transactions
escrowSchema.index({ mpesaTransactionId: 1 }, { sparse: true }); // Look up by MPESA ID
escrowSchema.index({ transactionId: 1 }, { unique: true }); // Fast lookup by our transaction ID

export const Escrow = mongoose.model('Escrow', escrowSchema);