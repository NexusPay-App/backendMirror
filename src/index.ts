import { startPaymentReconciliation, startBotDepositIndexing } from './services/paymentWorkers';
import { MpesaCallback } from './models/mpesaCallback';
import app from './app';
import { validateEnvironment } from './config/env';
import { connect } from './services/database';
import { startSchedulers, stopSchedulers } from './services/scheduler';
import { startSessionCleanup } from './middleware/strictAuthMiddleware';
import { ChainAccount } from './models/chainAccount';
import { BotTransfer } from './models/botTransfer';
import { botCapabilities } from './config/botchain';
import { ReclaimSession } from './models/reclaimSession';
import { redis } from './config/redis';
import mongoose from 'mongoose';

export async function initializeServices() {
  validateEnvironment();
  await connect();
  if (process.env.ENABLE_MPESA === 'true') await MpesaCallback.createIndexes();
  if (process.env.RECLAIM_APP_SECRET) await ReclaimSession.createIndexes();
  // Only new BOT collections receive indexes automatically. No existing account indexes are rebuilt.
  if (botCapabilities().some(n => n.enabled)) await Promise.all([ChainAccount.createIndexes(), BotTransfer.createIndexes()]);
}
export async function startServer() {
  await initializeServices();
  const timer = startSessionCleanup();
  const paymentTimer = process.env.RUN_PAYMENT_WORKERS === 'true' ? startPaymentReconciliation() : undefined;
  const depositTimer = process.env.RUN_PAYMENT_WORKERS === 'true' ? startBotDepositIndexing() : undefined;
  const server = app.listen(Number(process.env.PORT) || 8000);
  if (process.env.RUN_PAYMENT_WORKERS === 'true' && process.env.ENABLE_MPESA === 'true') await startSchedulers();
  const stop = () => {
    clearInterval(timer);
    clearInterval(paymentTimer);
    clearInterval(depositTimer);
    stopSchedulers();
    server.close(async () => { redis.disconnect(); await mongoose.disconnect(); });
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  return server;
}
if (require.main === module) startServer().catch(error => { console.error(error.message); process.exitCode = 1; });
export default app;
