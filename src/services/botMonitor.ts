import { randomUUID } from 'node:crypto';
import { BotMonitor } from '../models/botMonitor';
import { BotTransfer } from '../models/botTransfer';
import { reconcileBotTransfer } from './botchainTransfers';
import { scanBotDeposits } from './botchainDeposits';
import { deliverBotDepositNotifications } from './botDepositNotifications';

export async function startBotMonitor() {
  if (process.env.BOT_MONITOR_ENABLED !== 'true') return { tickId: null };
  const state = await BotMonitor.findOneAndUpdate({ _id: 'botchain' }, { $setOnInsert: { tickId: randomUUID() } }, { upsert: true, returnDocument: 'after' });
  return { tickId: state.tickId };
}

export async function runBotMonitorTick(tickId: string) {
  if (process.env.BOT_MONITOR_ENABLED !== 'true') return { nextTickId: null };
  const state = await BotMonitor.findById('botchain');
  if (!state) throw new Error('BOT monitor has not been initialized');
  if (state.previousTickId === tickId) return { nextTickId: state.tickId };
  if (state.tickId !== tickId) return { nextTickId: null };
  const lease = await BotMonitor.findOneAndUpdate({ _id: 'botchain', tickId, $or: [{ leaseUntil: { $lte: new Date() } }, { leaseUntil: { $exists: false } }] }, { $set: { leaseUntil: new Date(Date.now() + 180_000) } }, { returnDocument: 'after' });
  if (!lease) throw new Error('BOT monitor cycle is already running');
  try {
    const since = process.env.BOT_NOTIFICATION_START_AT;
    if (since && Number.isFinite(Date.parse(since))) {
      await BotTransfer.updateMany({ network: 'botchain', direction: 'outgoing', status: 'confirmed', smsStatus: { $exists: false }, transactionHash: { $exists: true }, createdAt: { $gte: new Date(since) } }, { $set: { smsStatus: 'pending' } });
    }
    const pending = await BotTransfer.find({ network: 'botchain', status: { $in: ['submitted', 'pending', 'review'] }, userOpHash: { $exists: true } }).sort({ updatedAt: 1 }).limit(5);
    await Promise.all(pending.map(record => reconcileBotTransfer(record)));
    const scan = await scanBotDeposits('botchain');
    const notifications = await deliverBotDepositNotifications(25);
    const nextTickId = randomUUID();
    const completed = await BotMonitor.updateOne({ _id: 'botchain', tickId }, { $set: { tickId: nextTickId, previousTickId: tickId, lastSuccessAt: new Date(), ...(scan?.progress ? { progress: scan.progress } : {}) }, $unset: { leaseUntil: 1 } });
    if (!completed.modifiedCount) throw new Error('BOT monitor state changed during processing');
    return { nextTickId, progress: scan?.progress, notifications };
  } catch (error) {
    await BotMonitor.updateOne({ _id: 'botchain', tickId }, { $set: { lastFailureAt: new Date() }, $unset: { leaseUntil: 1 } });
    throw error;
  }
}
