import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { ReclaimProofRequest, verifyProof } from '@reclaimprotocol/js-sdk';
import { authenticate } from '../middleware/auth';
import { ReclaimSession } from '../models/reclaimSession';
const router = Router();
router.use(authenticate);
router.use((_req, res, next) => {
  if (process.env.ENABLE_RECLAIM !== 'true') return void res.status(503).json({ success: false, message: 'Verification service is not enabled' });
  next();
});
router.post('/request', async (req, res) => {
  const appId = process.env.RECLAIM_APP_ID;
  const secret = process.env.RECLAIM_APP_SECRET;
  const allowed = (process.env.RECLAIM_PROVIDER_IDS || '').split(',').filter(Boolean);
  if (!appId || !secret) return res.status(503).json({ success: false, message: 'Verification service is not configured' });
  if (typeof req.body.providerId !== 'string' || !allowed.includes(req.body.providerId)) return res.status(400).json({ success: false, message: 'Provider is not enabled' });
  const request = await ReclaimProofRequest.init(appId, secret, req.body.providerId);
  const message = randomUUID();
  request.addContext(req.user.walletAddress, message);
  await ReclaimSession.create({ sessionId: request.getSessionId(), userId: req.user._id, providerId: req.body.providerId, providerVersion: request.getProviderVersion(), contextAddress: req.user.walletAddress.toLowerCase(), contextMessage: message, expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
  res.json({ success: true, data: { requestConfig: request.toJsonString(), sessionId: request.getSessionId() } });
});
router.post('/', async (req, res) => {
  const session = await ReclaimSession.findOne({ sessionId: req.body.sessionId, userId: req.user._id, consumedAt: null, expiresAt: { $gt: new Date() } });
  if (!session) return res.status(400).json({ success: false, message: 'Verification session expired or already used' });
  const proof = req.body.proof;
  const proofs = Array.isArray(proof) ? proof : [proof];
  if (!proofs.length || proofs.length > 10) return res.status(400).json({ success: false, message: 'Invalid proof count' });
  try {
    const result = await verifyProof(proofs, { ...session.providerVersion, teeAttestation: { appSecret: process.env.RECLAIM_APP_SECRET! } });
    const matchesSession = proofs.every(p => {
      const context = JSON.parse(p.claimData.context);
      return context.reclaimSessionId === session.sessionId && context.contextMessage === session.contextMessage && context.contextAddress?.toLowerCase() === session.contextAddress;
    });
    if (!result.isVerified || !matchesSession) return res.status(400).json({ success: false, message: 'Proof verification failed' });
    const consumed = await ReclaimSession.findOneAndUpdate({ _id: session._id, consumedAt: null, expiresAt: { $gt: new Date() } }, { $set: { consumedAt: new Date(), verifiedData: result.data } }, { returnDocument: 'after' });
    if (!consumed) return res.status(409).json({ success: false, message: 'Proof already consumed' });
    res.json({ success: true, data: { sessionId: session.sessionId, providerId: session.providerId, verified: true } });
  } catch { res.status(400).json({ success: false, message: 'Proof verification failed' }); }
});
router.get('/', async (req, res) => {
  const records = await ReclaimSession.find({ userId: req.user._id, consumedAt: { $ne: null } }).select('sessionId providerId consumedAt').lean();
  res.json({ success: true, data: records });
});
export default router;
