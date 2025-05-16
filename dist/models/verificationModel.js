"use strict";
// // import mongoose from 'mongoose';
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
exports.Verification = void 0;
// // const verificationSchema = new mongoose.Schema({
// //   providerId: String,
// //   providerName: String,
// //   proof: {},
// //   verified: Boolean,
// //   createdAt: {
// //     type: Date,
// //     default: Date.now
// //   }
// // });
// // export const Verification = mongoose.model('Verification', verificationSchema);
// // // module.exports = Verification;
// import mongoose from 'mongoose';
// const verificationSchema = new mongoose.Schema({
//   providerId: String,
//   providerName: String,
//   phoneNumber: String,  // Adding phoneNumber field
//   proof: {},
//   verified: Boolean,
//   createdAt: {
//     type: Date,
//     default: Date.now
//   }
// });
// export const Verification = mongoose.model('Verification', verificationSchema);
const mongoose_1 = __importStar(require("mongoose"));
const verificationSchema = new mongoose_1.Schema({
    providerId: {
        type: String,
    },
    providerName: {
        type: String,
    },
    phoneNumber: {
        type: String,
    },
    proof: {
        type: mongoose_1.Schema.Types.Mixed,
    },
    verified: {
        type: Boolean,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});
exports.Verification = mongoose_1.default.model('Verification', verificationSchema);
