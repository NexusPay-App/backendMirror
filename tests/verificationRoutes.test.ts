jest.mock('../src/middleware/auth', () => ({ authenticate: (req: any, _res: any, next: any) => { req.user = { _id: 'user-1', walletAddress: '0x1111111111111111111111111111111111111111' }; next(); } }));
jest.mock('@reclaimprotocol/js-sdk', () => ({ verifyProof: jest.fn(), ReclaimProofRequest: {} }));
jest.mock('../src/models/reclaimSession', () => ({ ReclaimSession: { findOne: jest.fn(), findOneAndUpdate: jest.fn() } }));
import express from 'express';
import request from 'supertest';
import { verifyProof } from '@reclaimprotocol/js-sdk';
import { ReclaimSession } from '../src/models/reclaimSession';
import router from '../src/routes/verificationRoutes';
const app = express().use(express.json()).use('/verifications', router);
const context = { reclaimSessionId: 'session-1', contextMessage: 'single-use-nonce', contextAddress: '0x1111111111111111111111111111111111111111' };
beforeEach(() => {
  process.env.ENABLE_RECLAIM = 'true'; process.env.RECLAIM_APP_SECRET = 'fixture-server-secret';
  (ReclaimSession.findOne as jest.Mock).mockResolvedValue({ _id: 'record-1', sessionId: 'session-1', providerId: 'provider-1', providerVersion: { providerId: 'provider-1', providerVersion: '1.0.0' }, contextMessage: context.contextMessage, contextAddress: context.contextAddress });
  (ReclaimSession.findOneAndUpdate as jest.Mock).mockResolvedValue({ _id: 'record-1' });
  (verifyProof as jest.Mock).mockResolvedValue({ isVerified: true, data: {} });
});
afterEach(() => { delete process.env.ENABLE_RECLAIM; delete process.env.RECLAIM_APP_SECRET; });
test('binds successful proof verification to the signed-in session and server-only attestation secret', async () => {
  await request(app).post('/verifications').send({ sessionId: 'session-1', proof: { claimData: { context: JSON.stringify(context) } } }).expect(200);
  expect(verifyProof).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ providerId: 'provider-1', teeAttestation: { appSecret: 'fixture-server-secret' } }));
  expect(ReclaimSession.findOne).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', consumedAt: null }));
});
test('rejects a valid proof from a different user context', async () => {
  await request(app).post('/verifications').send({ sessionId: 'session-1', proof: { claimData: { context: JSON.stringify({ ...context, contextMessage: 'another-user' }) } } }).expect(400);
  expect(ReclaimSession.findOneAndUpdate).not.toHaveBeenCalled();
});
test('a client verified flag does not bypass proof verification', async () => {
  (verifyProof as jest.Mock).mockResolvedValue({ isVerified: false });
  await request(app).post('/verifications').send({ sessionId: 'session-1', verified: true, proof: { claimData: { context: JSON.stringify(context) } } }).expect(400);
  expect(ReclaimSession.findOneAndUpdate).not.toHaveBeenCalled();
});
test('racing reuse of a proof cannot consume its session twice', async () => {
  (ReclaimSession.findOneAndUpdate as jest.Mock).mockResolvedValue(null);
  await request(app).post('/verifications').send({ sessionId: 'session-1', proof: { claimData: { context: JSON.stringify(context) } } }).expect(409);
});
test('disabled verification never calls the external verifier', async () => {
  delete process.env.ENABLE_RECLAIM;
  await request(app).post('/verifications').send({}).expect(503);
  expect(verifyProof).not.toHaveBeenCalled();
});
