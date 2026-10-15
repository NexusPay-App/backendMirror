// Test-only MongoDB probe. No SMS/email is sent and no user accounts are changed.
import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const { VerificationChallenge, issueChallenge, consumeChallenge } = require('../dist/services/verificationChallenges');
const { VerifiedSession } = require('../dist/models/verifiedSession');
const { registerVerifiedSession, invalidateSession } = require('../dist/middleware/strictAuthMiddleware');
if (!process.argv.includes('--test-database') || !process.env.DEV_MONGO_URL || process.env.DEV_MONGO_URL === process.env.PROD_MONGO_URL) throw Error('Requires explicit test database selection');
const identifier = `readiness-${randomUUID()}@example.test`;
const key = purpose => createHmac('sha256', process.env.JWT_SECRET).update(JSON.stringify([identifier, purpose])).digest('hex');
const purposes = ['single-use', 'attempts', 'expiry', 'owner'];
const token = randomUUID();
try {
  await mongoose.connect(process.env.DEV_MONGO_URL);
  await Promise.all([VerificationChallenge.init(), VerifiedSession.init()]);
  await issueChallenge(identifier, 'single-use', '123456');
  await assert.rejects(issueChallenge(identifier, 'single-use', '123456'), { code: 'OTP_RESEND_TOO_SOON' });
  const results = await Promise.all(Array.from({ length: 3 }, () => consumeChallenge(identifier, 'single-use', '123456')));
  assert.equal(results.filter(Boolean).length, 1);
  await issueChallenge(identifier, 'attempts', '123456');
  for (let i = 0; i < 5; i++) assert.equal(await consumeChallenge(identifier, 'attempts', '654321'), null);
  assert.equal(await consumeChallenge(identifier, 'attempts', '123456'), null);
  await issueChallenge(identifier, 'expiry', '123456');
  await VerificationChallenge.updateOne({ _id: key('expiry') }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal(await consumeChallenge(identifier, 'expiry', '123456'), null);
  await issueChallenge(identifier, 'owner', '123456', { userId: 'qa-owner' });
  assert.equal(await consumeChallenge(identifier, 'owner', '123456', 'another-owner'), null);
  assert.equal(await consumeChallenge(identifier, 'wrong-purpose', '123456', 'qa-owner'), null);
  assert.deepEqual(await consumeChallenge(identifier, 'owner', '123456', 'qa-owner'), { userId: 'qa-owner' });
  await registerVerifiedSession(token, 'qa-owner');
  await mongoose.disconnect();
  await mongoose.connect(process.env.DEV_MONGO_URL);
  assert.equal((await VerifiedSession.findById(createHash('sha256').update(token).digest('hex'))).userId, 'qa-owner');
  await invalidateSession(token);
  assert.equal(await VerifiedSession.findById(createHash('sha256').update(token).digest('hex')), null);
  console.log(JSON.stringify({ passed: true, concurrentSingleUse: true, resendCooldown: true, attemptLimit: true, expiry: true, ownerAndPurposeBinding: true, sessionSurvivesReconnect: true, sessionInvalidation: true }));
} finally {
  if (mongoose.connection.readyState === 1) {
    await VerificationChallenge.deleteMany({ _id: { $in: purposes.map(key) } });
    await VerifiedSession.deleteOne({ _id: createHash('sha256').update(token).digest('hex') });
  }
  await mongoose.disconnect();
}
