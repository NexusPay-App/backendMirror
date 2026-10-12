import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth';
import { botCapabilities, isBotNetwork, getBotConfig } from '../config/botchain';
import { resolveBotAccount, getBotBalances } from '../services/botchainWallet';
import { submitBotTransfer, reconcileBotTransfer, publicBotTransfer } from '../services/botchainTransfers';
import { BotTransfer } from '../models/botTransfer';
const router = Router();
router.get('/networks', (_req, res) => res.json({ success: true, data: botCapabilities() }));
router.use(authenticate);
router.use('/:network', (req, res, next) => {
  const network = String(req.params.network);
  if (!isBotNetwork(network) || !getBotConfig(network).enabled) return res.status(503).json({ success: false, error: { code: 'NETWORK_UNAVAILABLE', message: 'This BOT network is not enabled' } });
  res.locals.network = network;
  next();
});
router.get('/:network/account', async (req, res) => res.json({ success: true, data: await resolveBotAccount(req.user, res.locals.network) }));
router.get('/:network/balances', async (req, res) => {
  const account = await resolveBotAccount(req.user, res.locals.network);
  res.json({ success: true, data: { ...account, balances: await getBotBalances(res.locals.network, account.address), lastUpdated: new Date().toISOString() } });
});
router.post('/:network/transfers', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 }), async (req, res) => {
  if (!req.user.password || typeof req.body.password !== 'string' || !await bcrypt.compare(req.body.password, req.user.password)) return res.status(401).json({ success: false, error: { code: 'PAYMENT_AUTH_REQUIRED', message: 'A verified account password is required to authorize this payment' } });
  try {
    const record = await submitBotTransfer(req.user, res.locals.network, req.body, req.get('Idempotency-Key') || '');
    res.status(record.status === 'confirmed' ? 200 : 202).json({ success: true, data: publicBotTransfer(record) });
  } catch (error) {
    res.status(400).json({ success: false, error: { code: 'BOT_PAYMENT_REJECTED', message: error instanceof Error ? error.message : 'Unable to prepare BOT payment' } });
  }
});
router.get('/:network/transfers', async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const direction = req.query.direction === 'incoming' || req.query.direction === 'outgoing' ? { direction: req.query.direction } : {};
  const records = await BotTransfer.find({ userId: req.user._id, network: res.locals.network, ...direction }).sort({ createdAt: -1 }).limit(limit);
  res.json({ success: true, data: records.map(publicBotTransfer) });
});
router.get('/:network/transfers/:id', async (req, res) => {
  if (!/^[a-f\d]{24}$/i.test(String(req.params.id))) return res.status(400).json({ success: false, message: 'Invalid payment ID' });
  const record = await BotTransfer.findOne({ _id: req.params.id, userId: req.user._id, network: res.locals.network });
  if (!record) return res.status(404).json({ success: false, message: 'Payment not found' });
  res.json({ success: true, data: publicBotTransfer(await reconcileBotTransfer(record)) });
});
export default router;
