jest.mock('../src/models/mpesaCallback', () => ({ MpesaCallback: { updateOne: jest.fn() } }));
import { acceptCallback, canonicalPayload } from '../src/services/paymentInbox';
import { MpesaCallback } from '../src/models/mpesaCallback';
afterEach(() => { delete process.env.MPESA_CALLBACK_SHARED_TOKEN; });
test('callback fingerprints ignore JSON property order', () => expect(canonicalPayload({b:2,a:{d:4,c:3}})).toBe(canonicalPayload({a:{c:3,d:4},b:2})));
test('acknowledges only after durable inbox persistence', async () => {
  process.env.MPESA_CALLBACK_SHARED_TOKEN = 'fixture-callback-secret';
  const response: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  (MpesaCallback.updateOne as jest.Mock).mockImplementation(async () => { expect(response.json).not.toHaveBeenCalled(); });
  await acceptCallback('stk-callback')({ body:{Body:{test:true}}, query:{}, get:()=> 'fixture-callback-secret' } as any, response, jest.fn());
  expect(MpesaCallback.updateOne).toHaveBeenCalledTimes(1); expect(response.status).toHaveBeenCalledWith(200);
});
test('rejects a forged callback before touching the inbox', async () => {
  process.env.MPESA_CALLBACK_SHARED_TOKEN = 'fixture-callback-secret';
  const response: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await acceptCallback('stk-callback')({ body:{}, query:{}, get:()=> 'forged' } as any, response, jest.fn());
  expect(response.status).toHaveBeenCalledWith(403); expect(MpesaCallback.updateOne).not.toHaveBeenCalled();
});
