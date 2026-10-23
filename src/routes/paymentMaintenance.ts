import { Router } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { BotTransfer } from '../models/botTransfer';
import { reconcileBotTransfer } from '../services/botchainTransfers';

const router = Router();
const digest = (value: string) => createHash('sha256').update(value).digest();

// Called by the scheduled operator workflow. It only checks already-submitted
// operations; it cannot sign, replace, or broadcast a payment.
router.post('/reconcile', async (req, res) => {
  const secret = process.env.PAYMENT_MAINTENANCE_SECRET;
  if (!secret) return res.status(503).json({ success: false, message: 'Payment maintenance is not configured' });
  if (!timingSafeEqual(digest(req.headers.authorization || ''), digest(`Bearer ${secret}`))) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const records = await BotTransfer.find({ status: { $in: ['pending', 'submitted', 'review'] }, userOpHash: { $exists: true } }).sort({ updatedAt: 1 }).limit(5);
  await Promise.all(records.map(record => reconcileBotTransfer(record)));
  const unresolved = await BotTransfer.countDocuments({ status: { $in: ['pending', 'submitted', 'review'] }, userOpHash: { $exists: true } });
  return res.json({ success: true, data: { checked: records.length, unresolved } });
});

export default router;
