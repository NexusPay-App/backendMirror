import { BotTransfer } from '../models/botTransfer';
import { MpesaCallback } from '../models/mpesaCallback';
import { reconcileBotTransfer } from './botchainTransfers';
import { scanBotDeposits } from './botchainDeposits';
import { deliverBotDepositNotifications } from './botDepositNotifications';
import { botCapabilities } from '../config/botchain';
import { processPaymentInbox } from './paymentInbox';
import { mpesaSTKPushWebhook, mpesaB2CWebhook, mpesaB2BWebhook, mpesaQueueWebhook, stkPushCallback } from '../controllers/mpesaController';
export function startBotDepositIndexing() {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return; running = true;
    try {
      for (const capability of botCapabilities()) {
        if (!capability.enabled || !capability.deposits) continue;
        await scanBotDeposits(capability.id as 'botchain' | 'botchain-testnet');
      }
      await deliverBotDepositNotifications();
    } catch (error) { console.error('BOT deposit indexing cycle failed; cursors retained', error instanceof Error ? error.message : error); } finally { running = false; }
  }, 30000);
  return timer;
}
export function startPaymentReconciliation() {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return; running = true;
    try {
      const records = await BotTransfer.find({ status: { $in: ['pending', 'submitted', 'review'] }, userOpHash: { $exists: true } }).sort({ updatedAt: 1 }).limit(50);
      for (const record of records) await reconcileBotTransfer(record);
      if (process.env.ENABLE_MPESA === 'true') {
        await MpesaCallback.updateMany({ status: 'processing', claimedAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) } }, { $set: { status: 'review' } });
        await processPaymentInbox({ 'stk-callback': mpesaSTKPushWebhook, 'b2c-callback': mpesaB2CWebhook, 'b2b-callback': mpesaB2BWebhook, 'queue-timeout': mpesaQueueWebhook, callback: stkPushCallback });
      }
    } catch { console.error('Payment reconciliation cycle failed; pending records retained'); } finally { running = false; }
  }, 5000);
  return timer;
}
