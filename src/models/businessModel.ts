// import mongoose from 'mongoose';

// const businessSchema = new mongoose.Schema({
//     businessName: {
//       type: String,
//       required: true,
//       unique: true
//     },
//     ownerName: {
//       type: String,
//       required: true
//     },
//     location: {
//       type: String,
//       required: true
//     },
//     uniqueCode: {
//       type: String,
//       required: true,
//       unique: true
//     },
//     phoneNumber: {
//         type: String,
//         required: true,
//       },
//     walletAddress: {
//       type: String,
//       required: true
//     },
//     privateKey: {
//       type: String,
//       required: true,
//       unique: true
//     }
//   });
  
//   export const Business = mongoose.model('Business', businessSchema);
  


import mongoose, { Schema, Document } from 'mongoose';

export interface IBusiness extends Document {
  businessName: string;
  ownerName: string;
  location: string;
  businessType: string;
  phoneNumber: string;
  merchantId: string;
  walletAddress: string;
  privateKey: string;
  userId: mongoose.Types.ObjectId; // Reference to the User
}

const businessSchema: Schema = new Schema({
  businessName: {
    type: String,
    required: true,
    unique: true,
  },
  ownerName: {
    type: String,
    required: true,
  },
  location: {
    type: String,
    required: true,
  },
  businessType: {
    type: String,
    required: true,
  },
  phoneNumber: {
    type: String,
    required: true,
  },
  merchantId: {
    type: String,
    required: true,
    unique: true,
  },
  walletAddress: {
    type: String,
    required: true,
  },
  privateKey: {
    type: String,
    required: true,
    unique: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
});

// Check if model already exists to prevent OverwriteModelError
export const Business = mongoose.models.Business || mongoose.model<IBusiness>('Business', businessSchema);
