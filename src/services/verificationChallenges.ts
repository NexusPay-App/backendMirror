import { createHmac, timingSafeEqual } from 'node:crypto';
import { Schema, model, models } from 'mongoose';
const schema = new Schema({ _id: String, digest: String, attempts: Number, expiresAt: Date, issuedAt: Date, context: Schema.Types.Mixed });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const VerificationChallenge = models.VerificationChallenge || model('VerificationChallenge', schema);
function hash(value: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('Verification service is not configured');
  return createHmac('sha256', secret).update(value).digest('hex');
}
const identity = (identifier: string, purpose: string) => hash(JSON.stringify([identifier.trim().toLowerCase(), purpose]));
export async function issueChallenge(identifier: string, purpose: string, code: string, context: Record<string, string> = {}) {
  const _id = identity(identifier, purpose);
  const now = new Date();
  // A unique key plus the issuedAt predicate makes concurrent resends fail closed.
  try { await VerificationChallenge.findOneAndUpdate(
    { _id, issuedAt: { $lt: new Date(now.getTime() - 60_000) } },
    { $set: { digest: hash(`${_id}:${code}`), attempts: 0, expiresAt: new Date(now.getTime() + 5 * 60_000), issuedAt: now, context } },
    { upsert: true, returnDocument: 'after' },
  ); } catch (error: any) {
    if (error.code === 11000) throw Object.assign(new Error('Wait one minute before requesting another verification code.'), { code: 'OTP_RESEND_TOO_SOON', statusCode: 429 });
    throw error;
  }
}
export async function consumeChallenge(identifier: string, purpose: string, code: string, ownerId?: string): Promise<Record<string, string> | null> {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
  const _id = identity(identifier, purpose);
  const filter = { _id, expiresAt: { $gt: new Date() }, attempts: { $lt: 5 }, ...(ownerId ? { 'context.userId': ownerId } : {}) };
  const challenge = await VerificationChallenge.findOneAndUpdate(filter, { $inc: { attempts: 1 } }, { returnDocument: 'after' });
  if (!challenge) return null;
  const candidate = Buffer.from(hash(`${_id}:${code}`), 'hex');
  const expected = Buffer.from(challenge.digest, 'hex');
  if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) return null;
  // Only one concurrent verifier can consume a code; expiry is enforced even
  // before Mongo's TTL cleanup runs. A newer resend cannot be deleted here.
  const consumed = await VerificationChallenge.findOneAndDelete({ _id, digest: challenge.digest, issuedAt: challenge.issuedAt, expiresAt: { $gt: new Date() }, attempts: { $lte: 5 } });
  return consumed ? consumed.context || {} : null;
}

export function isChallengeCooldown(error: unknown): error is Error & { code: string; statusCode: number } {
  return error instanceof Error && (error as any).code === "OTP_RESEND_TOO_SOON";
}
