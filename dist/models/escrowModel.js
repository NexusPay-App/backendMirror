"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Escrow = void 0;
// src/models/escrowModel.ts
const mongoose_1 = __importStar(require("mongoose"));
const escrowSchema = new mongoose_1.Schema({
    transactionId: {
        type: String,
        required: true,
        unique: true
    },
    userId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    cryptoAmount: {
        type: mongoose_1.default.Schema.Types.Mixed,
        required: true
    },
    type: {
        type: String,
        enum: ['fiat_to_crypto', 'crypto_to_fiat', 'crypto_to_paybill', 'crypto_to_till'],
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'reserved', 'error'],
        default: 'pending'
    },
    mpesaTransactionId: String,
    mpesaReceiptNumber: String,
    cryptoTransactionHash: String,
    paybillNumber: String,
    accountNumber: String,
    tillNumber: String,
    retryCount: {
        type: Number,
        default: 0
    },
    lastRetryAt: Date,
    createdAt: {
        type: Date,
        default: Date.now
    },
    completedAt: Date,
    metadata: {
        type: Map,
        of: mongoose_1.default.Schema.Types.Mixed,
        default: {}
    }
});
// Create indexes for common queries
escrowSchema.index({ userId: 1, createdAt: -1 }); // User's transactions by date
escrowSchema.index({ status: 1, createdAt: 1 }); // Find pending transactions
escrowSchema.index({ mpesaTransactionId: 1 }, { sparse: true }); // Look up by MPESA ID
escrowSchema.index({ transactionId: 1 }, { unique: true }); // Fast lookup by our transaction ID
exports.Escrow = mongoose_1.default.model('Escrow', escrowSchema);
