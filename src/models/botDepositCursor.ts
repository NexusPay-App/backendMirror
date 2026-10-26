import { Schema, model, models } from 'mongoose';

const schema = new Schema({
  _id: String,
  block: Number,
  lease: String,
  leaseUntil: Date,
}, { timestamps: true });

export const BotDepositCursor = models.BotDepositCursor || model('BotDepositCursor', schema);
