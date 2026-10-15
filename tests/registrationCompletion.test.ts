jest.mock('../src/services/verificationChallenges', () => ({ consumeChallenge: jest.fn(), issueChallenge: jest.fn(), isChallengeCooldown: () => false }));
jest.mock('../src/services/auth', () => ({ createAccount: jest.fn().mockResolvedValue({ walletAddress: '0x1111111111111111111111111111111111111111', pk: 'fixture-not-a-key' }), SALT_ROUNDS: 4 }));
jest.mock('../src/middleware/strictAuthMiddleware', () => ({ registerVerifiedSession: jest.fn(), invalidateSession: jest.fn() }));
jest.mock('../src/services/email', () => ({ verifyOTP: jest.fn() }));
jest.mock('../src/services/googleAuth', () => ({}));
jest.mock('../src/services/smsService', () => ({}));
jest.mock('../src/services/userOptimizationService', () => ({}));
jest.mock('../src/config/env', () => ({ __esModule: true, default: { JWT_SECRET: 'test-only-key' } }));
const save = jest.fn().mockResolvedValue(undefined);
jest.mock('../src/models/models', () => ({ User: Object.assign(jest.fn().mockImplementation(input => ({ ...input, _id: 'fixture-user', save })), { findOne: jest.fn().mockResolvedValue(null) }) }));
import { registerUser } from '../src/controllers/authController';
import { consumeChallenge } from '../src/services/verificationChallenges';
import { registerVerifiedSession } from '../src/middleware/strictAuthMiddleware';
import { User } from '../src/models/models';
beforeEach(() => jest.clearAllMocks());
function response() { const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }; return res; }
test('a verified phone creates an authenticated account without claiming an unverified email', async () => {
  (consumeChallenge as jest.Mock).mockResolvedValue({});
  const res = response();
  await registerUser({ body: { phoneNumber: '+254700000968', email: 'unverified@example.test', password: 'fixture-only', otp: '123456', verifyWith: 'phone' } } as any, res);
  expect(save).toHaveBeenCalledTimes(1);
  expect(User).toHaveBeenCalledWith(expect.objectContaining({ isPhoneVerified: true, isEmailVerified: false, email: undefined }));
  expect(res.status).toHaveBeenCalledWith(201);
  expect(res.json.mock.calls[0][0].data.token).toEqual(expect.any(String));
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
