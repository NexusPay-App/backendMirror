import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
/** Bind every debit to the authenticated account; client-supplied identity is not authority. */
export async function authorizePayment(req: Request, res: Response, next: NextFunction) {
  const user = req.user;
  if (!user || typeof req.body.senderAddress !== 'string' || req.body.senderAddress.toLowerCase() !== user.walletAddress?.toLowerCase()) return res.status(403).json({ success: false, error: { code: 'SENDER_MISMATCH', message: 'Sender must match your authenticated wallet' } });
  if (typeof req.body.password !== 'string' || !user.password || !await bcrypt.compare(req.body.password, user.password)) return res.status(401).json({ success: false, error: { code: 'PAYMENT_AUTH_REQUIRED', message: 'Enter your account password to authorize this payment. Authenticator codes are not configured.' } });
  next();
}
