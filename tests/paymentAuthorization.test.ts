import { authorizePayment } from '../src/middleware/paymentAuthorization';
import bcrypt from 'bcryptjs';
function response() { const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }; return res; }
test('rejects attempts to debit another authenticated user', async () => {
  const res = response(), next = jest.fn();
  await authorizePayment({ user: { walletAddress: '0xabc' }, body: { senderAddress: '0xdef', password: 'anything' } } as any, res, next);
  expect(res.status).toHaveBeenCalledWith(403); expect(next).not.toHaveBeenCalled();
});
test('an arbitrary authenticator code cannot authorize a payment', async () => {
  const res = response(), next = jest.fn();
  await authorizePayment({ user: { walletAddress: '0xabc', password: 'hashed' }, body: { senderAddress: '0xabc', googleAuthCode: '123456' } } as any, res, next);
  expect(res.status).toHaveBeenCalledWith(401); expect(next).not.toHaveBeenCalled();
});
test('accepts a matching authenticated wallet and existing bcrypt password', async () => {
  const res = response(), next = jest.fn();
  await authorizePayment({ user: { walletAddress: '0xabc', password: await bcrypt.hash('fixture-password', 4) }, body: { senderAddress: '0xABC', password: 'fixture-password' } } as any, res, next);
  expect(next).toHaveBeenCalledTimes(1);
});
