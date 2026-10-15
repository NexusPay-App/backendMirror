import { createHmac } from 'node:crypto';
import { VerificationChallenge, consumeChallenge, issueChallenge } from '../src/services/verificationChallenges';
const previousSecret = process.env.JWT_SECRET;
beforeEach(() => { process.env.JWT_SECRET = 'unit-test-only-key'; });
afterEach(() => { jest.restoreAllMocks(); if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; });
test('persisted codes are hashed, expire, and are scoped to their purpose', async () => {
  const write = jest.spyOn(VerificationChallenge, 'findOneAndUpdate').mockResolvedValue({});
  await issueChallenge('fixture@example.test', 'registration', '123456');
  await issueChallenge('fixture@example.test', 'reset', '123456');
  const first = write.mock.calls[0] as any[];
  expect(first[0]._id).not.toBe((write.mock.calls[1][0] as any)._id);
  expect(first[1].$set.digest).not.toContain('123456');
  expect(first[1].$set.expiresAt.getTime() - first[1].$set.issuedAt.getTime()).toBe(300000);
});
test('a successful code is consumed once and only for its bound account', async () => {
  const increment = jest.spyOn(VerificationChallenge, 'findOneAndUpdate').mockImplementation(async (query: any) => ({ digest: createHmac('sha256', process.env.JWT_SECRET!).update(`${query._id}:123456`).digest('hex') }) as any);
  const remove = jest.spyOn(VerificationChallenge, 'findOneAndDelete').mockResolvedValueOnce({ context: { userId: 'owner' } }).mockResolvedValueOnce(null);
  expect(await consumeChallenge('+254700000968', 'phone-setup', '123456', 'owner')).toEqual({ userId: 'owner' });
  expect(await consumeChallenge('+254700000968', 'phone-setup', '123456', 'owner')).toBeNull();
  expect(increment.mock.calls[0][0]).toEqual(expect.objectContaining({ 'context.userId': 'owner', attempts: { $lt: 5 }, expiresAt: { $gt: expect.any(Date) } }));
  expect(remove).toHaveBeenCalledTimes(2);
});
test('invalid or exhausted attempts cannot consume a challenge', async () => {
  const increment = jest.spyOn(VerificationChallenge, 'findOneAndUpdate').mockResolvedValue(null);
  const remove = jest.spyOn(VerificationChallenge, 'findOneAndDelete');
  expect(await consumeChallenge('fixture', 'phone-login', '123456')).toBeNull();
  expect(await consumeChallenge('fixture', 'phone-login', 'abc')).toBeNull();
  expect(increment).toHaveBeenCalledTimes(1);
  expect(remove).not.toHaveBeenCalled();
});
test('resend cooldown produces an actionable error without exposing database contents', async () => {
  jest.spyOn(VerificationChallenge, 'findOneAndUpdate').mockRejectedValue({ code: 11000 });
  await expect(issueChallenge('fixture', 'phone-login', '123456')).rejects.toMatchObject({ code: 'OTP_RESEND_TOO_SOON', statusCode: 429 });
});
