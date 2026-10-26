import { Router } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { BotTransfer } from '../models/botTransfer';
import { reconcileBotTransfer } from '../services/botchainTransfers';
import { scanBotDeposits } from '../services/botchainDeposits';
import { deliverBotDepositNotifications } from '../services/botDepositNotifications';

const router = Router();
const digest = (value: string) => createHash('sha256').update(value).digest();

// Monitoring can record receipts and send notifications, never move funds.
router.use((req, res, next) => {
  const secret = process.env.PAYMENT_MAINTENANCE_SECRET;
  if (!secret) return res.status(503).json({ success: false, message: 'Payment maintenance is not configured' });
  if (!timingSafeEqual(digest(req.headers.authorization || ''), digest(`Bearer ${secret}`))) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  next();
});
router.post('/deposits', async (_req, res) => {
  const result = await scanBotDeposits('botchain');
  res.json({ success: true, data: result ? { ...result, from: result.from.toString(), to: result.to.toString() } : null });
});
router.post('/notifications', async (_req, res) => {
  res.json({ success: true, data: await deliverBotDepositNotifications() });
});
router.post('/reconcile', async (_req, res) => {
  const records = await BotTransfer.find({ status: { $in: ['pending', 'submitted', 'review'] }, userOpHash: { $exists: true } }).sort({ updatedAt: 1 }).limit(5);
  await Promise.all(records.map(record => reconcileBotTransfer(record)));
  const unresolved = await BotTransfer.countDocuments({ status: { $in: ['pending', 'submitted', 'review'] }, userOpHash: { $exists: true } });
  return res.json({ success: true, data: { checked: records.length, unresolved } });
});

export default router;
