import { Schema, model, models } from 'mongoose';
const schema = new Schema({
  sessionId: { type: String, required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, required: true },
  providerId: { type: String, required: true },
  providerVersion: { type: Schema.Types.Mixed, required: true },
  contextMessage: { type: String, required: true },
  contextAddress: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  consumedAt: Date,
  verifiedData: Schema.Types.Mixed,
}, { timestamps: true });
export const ReclaimSession = models.ReclaimSession || model('ReclaimSession', schema);
