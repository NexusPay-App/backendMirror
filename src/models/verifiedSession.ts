import { Schema, model, models } from 'mongoose';
const schema = new Schema({ _id: String, userId: String, verified: Boolean, verifiedAt: Date, expiresAt: Date });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const VerifiedSession = models.VerifiedSession || model('VerifiedSession', schema);
