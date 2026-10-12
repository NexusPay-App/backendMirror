import { Schema, model, models } from 'mongoose';
// Additive records: existing User/Business.walletAddress and signing keys are untouched.
const schema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, required: true },
  ownerType: { type: String, enum: ['user', 'business'], required: true },
  chainId: { type: Number, required: true },
  address: { type: String, required: true },
  ownerAddress: { type: String, required: true },
  factory: { type: String, required: true },
  entryPoint: { type: String, required: true },
  salt: { type: String, required: true },
  accountType: { type: String, default: 'bot-simple-account-v0.7', immutable: true },
}, { timestamps: true });
schema.index({ ownerId: 1, ownerType: 1, chainId: 1 }, { unique: true });
export const ChainAccount = models.ChainAccount || model('ChainAccount', schema);
