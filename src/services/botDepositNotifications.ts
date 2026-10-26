import { BotTransfer } from '../models/botTransfer';
import { User } from '../models/models';
import { SMSService } from './smsService';
import { getBotConfig } from '../config/botchain';

export async function deliverBotDepositNotifications(limit = 10) {
  const counts = { accepted: 0, skipped: 0, rejected: 0, unknown: 0 };
  if (process.env.ENABLE_SMS !== 'true') return { enabled: false, ...counts };
  await BotTransfer.updateMany({ smsStatus: 'processing', smsClaimedAt: { $lt: new Date(Date.now() - 10 * 60_000) } }, { $set: { smsStatus: 'unknown', smsFailureCode: 'INTERRUPTED_DELIVERY' } });
  for (let index = 0; index < Math.min(limit, 25); index++) {
    const payment = await BotTransfer.findOneAndUpdate({ network: 'botchain', direction: 'incoming', status: 'confirmed', smsStatus: 'pending', $or: [{ smsNextAttemptAt: { $lte: new Date() } }, { smsNextAttemptAt: { $exists: false } }] },
      { $set: { smsStatus: 'processing', smsClaimedAt: new Date() }, $inc: { smsAttempts: 1 } }, { sort: { createdAt: 1 }, returnDocument: 'after' });
    if (!payment) break;
    let owner;
    try { owner = await User.findById(payment.userId).select('phoneNumber isPhoneVerified status'); }
    catch (error) {
      await BotTransfer.updateOne({ _id: payment._id, smsStatus: 'processing' }, { $set: { smsStatus: 'pending' }, $inc: { smsAttempts: -1 } });
      throw error;
    }
    if (!owner?.phoneNumber || !owner.isPhoneVerified || owner.status === 'suspended') {
      await BotTransfer.updateOne({ _id: payment._id, smsStatus: 'processing' }, { $set: { smsStatus: 'skipped', smsFailureCode: 'VERIFIED_PHONE_REQUIRED' } });
      counts.skipped++;
      continue;
    }
    const result = await SMSService.submitTransactionNotification({ phoneNumber: owner.phoneNumber, amount: payment.amount, tokenType: payment.token, transactionHash: payment.transactionHash, transactionType: 'receive', status: 'success', networkName: getBotConfig(payment.network).name });
    const smsStatus = result.status === 'rejected' ? payment.smsAttempts < 3 ? 'pending' : 'failed' : result.status;
    await BotTransfer.updateOne({ _id: payment._id, smsStatus: 'processing' }, { $set: { smsStatus, smsMessageId: result.messageId, smsFailureCode: result.code, smsNextAttemptAt: new Date(Date.now() + 5 * 60_000) } });
    counts[result.status]++;
    if (result.code === 'PROVIDER_HTTP_401' || result.code === 'PROVIDER_HTTP_403' || result.code === 'SMS_NOT_CONFIGURED') break;
  }
  return { enabled: true, ...counts };
}
