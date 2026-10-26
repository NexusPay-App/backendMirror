import { BotMonitor } from '../models/botMonitor';
import { startBotMonitor, runBotMonitorTick } from '../services/botMonitor';
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
  const secrets = [process.env.PAYMENT_MAINTENANCE_SECRET, process.env.BOT_MONITOR_SECRET].filter((value): value is string => !!value);
  if (!secrets.length) return res.status(503).json({ success: false, message: 'Payment maintenance is not configured' });
  if (!secrets.some(secret => timingSafeEqual(digest(req.headers.authorization || ''), digest(`Bearer ${secret}`)))) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  next();
});
router.post('/monitor/start', async (_req, res) => res.json({ success: true, data: await startBotMonitor() }));
router.post('/monitor/tick', async (req, res) => {
  if (typeof req.body.tickId !== 'string' || !/^[a-f0-9-]{36}$/.test(req.body.tickId)) return res.status(400).json({ success: false });
  res.json({ success: true, data: await runBotMonitorTick(req.body.tickId) });
});
router.get('/monitor/status', async (_req, res) => {
  const state = await BotMonitor.findById('botchain').select('lastSuccessAt lastFailureAt progress');
  const notifications = await BotTransfer.aggregate([{ $match: { network: 'botchain', smsStatus: { $exists: true } } }, { $group: { _id: { direction: '$direction', status: '$smsStatus', reason: '$smsFailureCode' }, count: { $sum: 1 } } }]);
  res.json({ success: true, data: { enabled: process.env.BOT_MONITOR_ENABLED === 'true', lastSuccessAt: state?.lastSuccessAt, lastFailureAt: state?.lastFailureAt, progress: state?.progress, notifications } });
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
