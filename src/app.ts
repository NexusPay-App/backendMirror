import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/authRoutes';
import tokenRoutes from './routes/tokenRoutes';
import businessRoutes from './routes/businessRoutes';
import mpesaRoutes from './routes/mpesaRoutes';
import adminRoutes from './routes/adminRoutes';
import transactionRoutes from './routes/transactionRoutes';
import usdcRoutes from './routes/usdcRoutes';
import liquidityRoutes from './routes/liquidityRoutes';
import rampRoutes from './routes/rampRoutes';
import platformWalletRoutes from './routes/platformWalletRoutes';
import botchainRoutes from './routes/botchainRoutes';
import verificationRoutes from './routes/verificationRoutes';
import { authenticate } from './middleware/auth';
import mongoose from 'mongoose';
import { isChallengeCooldown } from './services/verificationChallenges';
import { randomUUID } from 'node:crypto';
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  const proxyHops = Number(process.env.TRUST_PROXY_HOPS || (process.env.VERCEL ? 1 : 0));
  if (!Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 10) throw new Error('TRUST_PROXY_HOPS must be an integer between 0 and 10');
  app.set('trust proxy', proxyHops);
  app.use((_req, res, next) => { res.locals.requestId = randomUUID(); res.set('X-Request-ID', res.locals.requestId); next(); });
  const origins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(x => x.trim());
  app.use(helmet());
  app.use(cors({ origin: (origin, done) => done(origin && !origins.includes(origin) ? new Error('Origin not allowed') : null, true), credentials: true }));
  app.use(express.json({ limit: '256kb' }), express.urlencoded({ extended: false, limit: '64kb' }), compression());
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.get('/api/health', (_req, res) => res.json({ success: true, data: { status: 'healthy', timestamp: new Date().toISOString() } }));
  app.get('/api/health/ready', (_req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ success: ready, data: { status: ready ? 'ready' : 'unavailable', database: ready ? 'connected' : 'unavailable', timestamp: new Date().toISOString() } });
  });
  app.use('/api/auth', authRoutes);
  app.use('/api/token', tokenRoutes);
  app.use('/api/business', businessRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/transactions', transactionRoutes);
  app.use('/api/usdc', usdcRoutes);
  app.use('/api/botchain', botchainRoutes);
  app.use('/api/verifications', verificationRoutes);
  // Fiat routes need explicit enablement and their own configured treasury.
  const fiatGate: express.RequestHandler = (req, res, next) => {
    if (process.env.ENABLE_MPESA !== 'true') return void res.status(503).json({ success: false, message: 'M-Pesa is not enabled for this environment' });
    if ([req.body?.chain, req.body?.chainName, req.query.chain].some(x => typeof x === 'string' && x.startsWith('botchain'))) return void res.status(503).json({ success: false, message: 'BOT Chain M-Pesa settlement is not enabled' });
    next();
  };
  app.use('/api/mpesa', fiatGate, mpesaRoutes);
  app.use('/api/ramp', fiatGate, rampRoutes);
  app.use('/api/liquidity', liquidityRoutes);
  app.use('/api/platform-wallet', platformWalletRoutes);
  // Stellar is not provisioned on this backend. Return a stable envelope so the
  // shared wallet context does not spam AxiosError 404s on every auth load.
  app.get('/api/stellar/wallet', authenticate, (_req, res) => res.json({ success: false, message: 'Stellar is not enabled on this deployment' }));
  app.get('/api/stellar/secret-key', authenticate, (_req, res) => res.status(403).json({ success: false, message: 'Stellar is not enabled on this deployment' }));
  app.use((_req, res) => res.status(404).json({ success: false, error: { code: 'ROUTE_NOT_FOUND', message: 'Endpoint not found' } }));
  const errors: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (isChallengeCooldown(error)) return void res.status(429).json({ success: false, message: error.message, error: { code: error.code, message: error.message } });
    const status = error.message === 'Origin not allowed' ? 403 : error.type === 'entity.parse.failed' ? 400 : 500;
    if (status === 500) console.error('Request failed', { requestId: res.locals.requestId, errorType: error.name || 'Error' });
    res.status(status).json({ success: false, error: { code: 'REQUEST_FAILED', message: status === 500 ? 'Request could not be completed' : error.message, requestId: res.locals.requestId } });
  };
  app.use(errors);
  return app;
}
export default createApp();
