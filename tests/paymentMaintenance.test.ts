jest.mock('../src/models/botTransfer', () => ({ BotTransfer: { find: jest.fn(), countDocuments: jest.fn() } }));
jest.mock('../src/services/botchainTransfers', () => ({ reconcileBotTransfer: jest.fn() }));
import express from 'express';
import request from 'supertest';
import routes from '../src/routes/paymentMaintenance';
import { BotTransfer } from '../src/models/botTransfer';
import { reconcileBotTransfer } from '../src/services/botchainTransfers';
const app = express().use(routes);
beforeEach(() => { jest.clearAllMocks(); process.env.PAYMENT_MAINTENANCE_SECRET = 'fixture-maintenance-secret'; });
afterEach(() => { delete process.env.PAYMENT_MAINTENANCE_SECRET; });
test('rejects unauthenticated maintenance before accessing payments', async () => {
  expect((await request(app).post('/reconcile')).status).toBe(401);
  expect(BotTransfer.find).not.toHaveBeenCalled();
});
test('fails closed when the scheduler secret is not configured', async () => {
  delete process.env.PAYMENT_MAINTENANCE_SECRET;
  expect((await request(app).post('/reconcile')).status).toBe(503);
  expect(BotTransfer.find).not.toHaveBeenCalled();
});
test('reconciles a bounded batch and returns no wallet or transaction identities', async () => {
  const limit = jest.fn().mockResolvedValue([{ userOpHash: '0xoperation' }]);
  (BotTransfer.find as jest.Mock).mockReturnValue({ sort: jest.fn().mockReturnValue({ limit }) });
  (BotTransfer.countDocuments as jest.Mock).mockResolvedValue(0);
  const response = await request(app).post('/reconcile').set('Authorization', 'Bearer fixture-maintenance-secret');
  expect(response.body).toEqual({ success: true, data: { checked: 1, unresolved: 0 } });
  expect(limit).toHaveBeenCalledWith(5);
  expect(reconcileBotTransfer).toHaveBeenCalledTimes(1);
});
