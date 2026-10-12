import { Schema, model, models } from 'mongoose';
const schema = new Schema({
  fingerprint: { type: String, required: true, unique: true },
  endpoint: { type: String, required: true },
  payload: { type: Schema.Types.Mixed, required: true, select: false },
  status: { type: String, enum: ['pending', 'processing', 'completed', 'review'], default: 'pending' },
  claimedAt: Date,
  completedAt: Date,
}, { timestamps: true });
export const MpesaCallback = models.MpesaCallback || model('MpesaCallback', schema);
