import { BotPaymentLimit, botPaymentLimiter } from '../src/middleware/botPaymentLimiter';
const response = () => { const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), set: jest.fn() }; return res; };
afterEach(() => jest.restoreAllMocks());
test('blocks attempts over the persisted account limit', async () => {
  const write = jest.spyOn(BotPaymentLimit, 'findOneAndUpdate').mockResolvedValue({ attempts: 21 });
  const res = response(), next = jest.fn();
  await botPaymentLimiter({ user: { _id: 'fixture' } } as any, res, next);
  expect(write).toHaveBeenCalledWith(expect.objectContaining({ _id: expect.stringContaining('fixture:') }), expect.objectContaining({ $inc: { attempts: 1 } }), { upsert: true, returnDocument: 'after' });
  expect(res.status).toHaveBeenCalledWith(429);
  expect(next).not.toHaveBeenCalled();
});
test('an unavailable rate-limit store never authorizes a payment', async () => {
  jest.spyOn(BotPaymentLimit, 'findOneAndUpdate').mockRejectedValue(new Error('database unavailable'));
  const res = response(), next = jest.fn();
  await botPaymentLimiter({ user: { _id: 'fixture' } } as any, res, next);
  expect(res.status).toHaveBeenCalledWith(503);
  expect(next).not.toHaveBeenCalled();
});
