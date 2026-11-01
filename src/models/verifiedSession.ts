import { Schema, model, models } from "mongoose";
const schema = new Schema({
  _id: String,
  userId: { type: String, index: true },
  verified: Boolean,
  verifiedAt: Date,
  expiresAt: Date,
  createdAt: Date,
  revokedAt: Date,
  authenticatedAt: Date,
  authenticationMethod: {
    type: String,
    enum: ["password", "google", "registration"],
  },
  securityVersion: Number,
  userAgent: String,
  credentialId: String,
  passkeyVerifiedAt: Date,
  reauthenticatedAt: Date,
  reauthGoogleNonce: String,
  reauthGoogleExpiresAt: Date,
});
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const VerifiedSession =
  models.VerifiedSession || model("VerifiedSession", schema);
