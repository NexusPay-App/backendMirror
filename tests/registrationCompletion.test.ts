jest.mock('../src/services/sessions', () => ({ issueSession: jest.fn().mockResolvedValue('internal-fixture-token'), revokeUserSessions: jest.fn(), requestToken: jest.fn(), clearSessionCookie: jest.fn() }));
jest.mock('../src/services/verificationChallenges', () => ({ consumeChallenge: jest.fn(), issueChallenge: jest.fn(), isChallengeCooldown: () => false }));
jest.mock('../src/services/auth', () => ({ createAccount: jest.fn().mockResolvedValue({ walletAddress: '0x1111111111111111111111111111111111111111', pk: 'fixture-not-a-key' }), SALT_ROUNDS: 4 }));
jest.mock('../src/middleware/strictAuthMiddleware', () => ({ registerVerifiedSession: jest.fn(), invalidateSession: jest.fn() }));
jest.mock('../src/services/email', () => ({ verifyOTP: jest.fn() }));
jest.mock('../src/services/googleAuth', () => ({ verifyGoogleToken: jest.fn() }));
jest.mock('../src/services/smsService', () => ({}));
jest.mock('../src/services/userOptimizationService', () => ({ UserOptimizationService: { findOrCreateUserByGoogle: jest.fn(), createPersonalAccount: jest.fn() } }));
jest.mock('../src/config/env', () => ({ __esModule: true, default: { JWT_SECRET: 'test-only-key' } }));
const save = jest.fn().mockResolvedValue(undefined);
jest.mock('../src/models/models', () => ({ User: Object.assign(jest.fn().mockImplementation(input => ({ ...input, _id: 'fixture-user', save })), { findOne: jest.fn().mockResolvedValue(null) }) }));
import { registerUser, googleAuth } from '../src/controllers/authController';
import { consumeChallenge } from '../src/services/verificationChallenges';
import { registerVerifiedSession } from '../src/middleware/strictAuthMiddleware';
import { User } from '../src/models/models';
import { createAccount } from '../src/services/auth';
beforeEach(() => jest.clearAllMocks());
function response() { const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }; return res; }
test('a verified phone creates an authenticated account without claiming an unverified email', async () => {
  (consumeChallenge as jest.Mock).mockResolvedValue({});
  const res = response();
  await registerUser({ body: { phoneNumber: '+254700000968', email: 'unverified@example.test', password: 'fixture-only', otp: '123456', verifyWith: 'phone' } } as any, res);
  expect(save).toHaveBeenCalledTimes(1);
  expect(User).toHaveBeenCalledWith(expect.objectContaining({ isPhoneVerified: true, isEmailVerified: false, email: undefined }));
  expect(User).toHaveBeenCalledWith(expect.objectContaining({ walletStatus: 'pending' }));
  expect(createAccount).not.toHaveBeenCalled();
  expect((User as unknown as jest.Mock).mock.calls[0][0].privateKey).toBeUndefined();
  expect(res.status).toHaveBeenCalledWith(201);
  expect(res.json.mock.calls[0][0].data.sessionActive).toBe(true);
  expect(registerVerifiedSession).toHaveBeenCalledWith(expect.any(String), 'fixture-user');
});
test('an invalid code cannot create an account or verified session', async () => {
  (consumeChallenge as jest.Mock).mockResolvedValue(null);
  const res = response();
  await registerUser({ body: { phoneNumber: '+254700000968', password: 'fixture-only', otp: '123456', verifyWith: 'phone' } } as any, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(save).not.toHaveBeenCalled();
  expect(registerVerifiedSession).not.toHaveBeenCalled();
});

import { verifyGoogleToken } from '../src/services/googleAuth';
import { UserOptimizationService } from '../src/services/userOptimizationService';
import { issueSession } from '../src/services/sessions';
test.each([undefined, 'different-google-subject'])('a matching email cannot link a different Google identity during login (%s)', async googleId => {
  (verifyGoogleToken as jest.Mock).mockResolvedValue({ id: 'verified-google-subject', email: 'same@example.test', verified_email: true });
  (UserOptimizationService.findOrCreateUserByGoogle as jest.Mock).mockResolvedValue({ found: true, user: { googleId, save } });
  const res = response();
  await googleAuth({ body: { idToken: 'test-token' } } as any, res);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(issueSession).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});
test('an existing linked Google identity can sign in', async () => {
  (verifyGoogleToken as jest.Mock).mockResolvedValue({ id: 'verified-google-subject', email: 'same@example.test', verified_email: true });
  const user = { _id: 'fixture-user', googleId: 'verified-google-subject', save };
  (UserOptimizationService.findOrCreateUserByGoogle as jest.Mock).mockResolvedValue({ found: true, user });
  const res = response();
  await googleAuth({ body: { idToken: 'test-token' } } as any, res);
  expect(issueSession).toHaveBeenCalledWith(expect.anything(), res, user, 'google');
  expect(res.json.mock.calls[0][0].data.sessionActive).toBe(true);
});
test('an invalid Google token cannot establish a session or create an identity', async () => {
  (verifyGoogleToken as jest.Mock).mockRejectedValue(new Error('invalid token'));
  const res = response();
  await googleAuth({ body: { idToken: 'invalid-token' } } as any, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(issueSession).not.toHaveBeenCalled();
  expect(UserOptimizationService.findOrCreateUserByGoogle).not.toHaveBeenCalled();
});
