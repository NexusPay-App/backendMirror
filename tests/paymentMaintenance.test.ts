jest.mock('../src/services/botMonitor', () => ({ startBotMonitor: jest.fn(), runBotMonitorTick: jest.fn() }));
jest.mock('../src/services/botchainDeposits', () => ({ scanBotDeposits: jest.fn() }));
jest.mock('../src/services/botDepositNotifications', () => ({ deliverBotDepositNotifications: jest.fn() }));
jest.mock('../src/models/botTransfer', () => ({ BotTransfer: { find: jest.fn(), countDocuments: jest.fn() } }));
jest.mock('../src/services/botchainTransfers', () => ({ reconcileBotTransfer: jest.fn() }));
import { startBotMonitor, runBotMonitorTick } from '../src/services/botMonitor';
import express from 'express';
import request from 'supertest';
import routes from '../src/routes/paymentMaintenance';
import { BotTransfer } from '../src/models/botTransfer';
import { scanBotDeposits } from '../src/services/botchainDeposits';
import { deliverBotDepositNotifications } from '../src/services/botDepositNotifications';
import { reconcileBotTransfer } from '../src/services/botchainTransfers';
const app = express().use(express.json()).use(routes);
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

test.each(['/deposits', '/notifications'])('rejects unauthenticated monitoring at %s', async path => {
  expect((await request(app).post(path)).status).toBe(401);
  expect(scanBotDeposits).not.toHaveBeenCalled();
  expect(deliverBotDepositNotifications).not.toHaveBeenCalled();
});
test('returns a JSON-safe scan summary without wallet identities', async () => {
  (scanBotDeposits as jest.Mock).mockResolvedValue({ from: 100n, to: 110n, tokens: 1, native: 1 });
  const response = await request(app).post('/deposits').set('Authorization', 'Bearer fixture-maintenance-secret');
  expect(response.status).toBe(200);
  expect(response.body.data).toEqual({ from: '100', to: '110', tokens: 1, native: 1 });
});

test('continuous monitor requires its shared secret and validates cycle identity', async () => {
  process.env.BOT_MONITOR_SECRET = 'fixture-monitor-secret';
  try {
    (startBotMonitor as jest.Mock).mockResolvedValue({ tickId: 'fixture' });
    expect((await request(app).post('/monitor/start')).status).toBe(401);
    expect((await request(app).post('/monitor/start').set('Authorization', 'Bearer fixture-monitor-secret')).status).toBe(200);
    expect((await request(app).post('/monitor/tick').set('Authorization', 'Bearer fixture-monitor-secret').send({tickId: 'bad'})).status).toBe(400);
    expect(runBotMonitorTick).not.toHaveBeenCalled();
  } finally { delete process.env.BOT_MONITOR_SECRET; }
});
