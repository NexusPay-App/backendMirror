import { Schema, model, models } from 'mongoose';

const schema = new Schema({
  _id: String,
  tickId: { type: String, required: true },
  previousTickId: String,
  leaseUntil: Date,
  lastSuccessAt: Date,
  lastFailureAt: Date,
  progress: { confirmedHead: String, tokenThrough: String, nativeThrough: String, remainingBlocks: String },
}, { timestamps: true });
export const BotMonitor = models.BotMonitor || model('BotMonitor', schema);
