"use strict";
// export const User = mongoose.model('User', userSchema);
// import mongoose from 'mongoose';
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
exports.User = void 0;
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
const mongoose_1 = __importStar(require("mongoose"));
const userSchema = new mongoose_1.Schema({
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
        required: true,
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
    createdAt: {
        type: Date,
        default: Date.now,
    },
    lastLoginAt: {
        type: Date
    }
});
exports.User = mongoose_1.default.model('User', userSchema);
//################ end new Code for Migrations #####################
