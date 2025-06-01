// // import mongoose from 'mongoose';

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


import mongoose, { Schema, Document } from 'mongoose';

export interface IVerification extends Document {
  providerId: string;
  providerName: string;
  phoneNumber: string;
  proof: Record<string, unknown>;
  verified: boolean;
  createdAt: Date;
}

const verificationSchema: Schema = new Schema({
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
    type: Schema.Types.Mixed,
  },
  verified: {
    type: Boolean,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Check if model already exists to prevent OverwriteModelError
export const Verification = mongoose.models.Verification || mongoose.model<IVerification>('Verification', verificationSchema);
