import type { RequestHandler } from 'express';
import { Schema, model, models } from 'mongoose';
const schema = new Schema({ _id: String, attempts: { type: Number, default: 0 }, expiresAt: Date });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const BotPaymentLimit = models.BotPaymentLimit || model('BotPaymentLimit', schema);

/** Password-attempt limits must survive cold starts and concurrent Vercel instances. */
export const botPaymentLimiter: RequestHandler = async (req, res, next) => {
  const windowMs = 15 * 60 * 1000;
  const window = Math.floor(Date.now() / windowMs);
  try {
    const bucket = await BotPaymentLimit.findOneAndUpdate(
      { _id: `${req.user._id}:${window}` },
      { $inc: { attempts: 1 }, $setOnInsert: { expiresAt: new Date((window + 2) * windowMs) } },
      { upsert: true, returnDocument: 'after' },
    );
    if (bucket.attempts > 20) {
      res.set('Retry-After', String(Math.ceil(((window + 1) * windowMs - Date.now()) / 1000)));
      return void res.status(429).json({ success: false, error: { code: 'PAYMENT_RATE_LIMITED', message: 'Too many payment attempts. Wait a few minutes before trying again.' } });
    }
    next();
  } catch {
    res.status(503).json({ success: false, error: { code: 'PAYMENT_AUTH_UNAVAILABLE', message: 'Payment authorization is temporarily unavailable. No payment was submitted.' } });
  }
};
