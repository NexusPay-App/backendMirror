jest.mock('../src/models/botMonitor', () => ({ BotMonitor: { findById: jest.fn(), findOneAndUpdate: jest.fn(), updateOne: jest.fn() } }));
jest.mock('../src/models/botTransfer', () => ({ BotTransfer: { find: jest.fn(), updateMany: jest.fn() } }));
jest.mock('../src/services/botchainTransfers', () => ({ reconcileBotTransfer: jest.fn() }));
jest.mock('../src/services/botchainDeposits', () => ({ scanBotDeposits: jest.fn() }));
jest.mock('../src/services/botDepositNotifications', () => ({ deliverBotDepositNotifications: jest.fn() }));
import { BotMonitor } from '../src/models/botMonitor';
import { BotTransfer } from '../src/models/botTransfer';
import { scanBotDeposits } from '../src/services/botchainDeposits';
import { deliverBotDepositNotifications } from '../src/services/botDepositNotifications';
import { runBotMonitorTick, startBotMonitor } from '../src/services/botMonitor';
let state: any;
const tick = '11111111-1111-4111-8111-111111111111';
beforeEach(() => {
  process.env.BOT_MONITOR_ENABLED = 'true';
  state = { _id: 'botchain', tickId: tick };
  (BotMonitor.findById as jest.Mock).mockImplementation(async () => ({ ...state }));
  (BotMonitor.findOneAndUpdate as jest.Mock).mockImplementation(async (query, update) => {
    if (update.$setOnInsert) return { ...state };
    if (state.tickId !== query.tickId || state.leaseUntil > new Date()) return null;
    Object.assign(state, update.$set);
    return { ...state };
  });
  (BotMonitor.updateOne as jest.Mock).mockImplementation(async (query, update) => {
    if (state.tickId !== query.tickId) return {modifiedCount: 0};
    Object.assign(state, update.$set);
    for (const key of Object.keys(update.$unset || {})) delete state[key];
    return {modifiedCount: 1};
  });
  (BotTransfer.find as jest.Mock).mockReturnValue({sort: () => ({limit: async () => []})});
  (scanBotDeposits as jest.Mock).mockResolvedValue({progress: {remainingBlocks: '0'}});
  (deliverBotDepositNotifications as jest.Mock).mockResolvedValue({accepted: 0});
});
afterEach(() => { delete process.env.BOT_MONITOR_ENABLED; });
test('repeated bootstrap calls reuse the active cycle instead of spawning another loop', async () => {
  expect(await startBotMonitor()).toEqual({tickId: tick});
  expect(await startBotMonitor()).toEqual({tickId: tick});
});
test('a completed cycle can be replayed to recover its next message without rescanning', async () => {
  const result = await runBotMonitorTick(tick);
  expect(result.nextTickId).not.toBe(tick);
  expect(await runBotMonitorTick(tick)).toEqual({nextTickId: result.nextTickId});
  expect(scanBotDeposits).toHaveBeenCalledTimes(1);
  expect(deliverBotDepositNotifications).toHaveBeenCalledTimes(1);
});
test('concurrent delivery of the same cycle permits only one worker', async () => {
  const results = await Promise.allSettled([runBotMonitorTick(tick), runBotMonitorTick(tick)]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(scanBotDeposits).toHaveBeenCalledTimes(1);
});
test('a failed scan retains the cycle and releases its lease for retry', async () => {
  (scanBotDeposits as jest.Mock).mockRejectedValueOnce(new Error('RPC unavailable'));
  await expect(runBotMonitorTick(tick)).rejects.toThrow('RPC unavailable');
  expect(deliverBotDepositNotifications).toHaveBeenCalledTimes(1);
  expect(state.tickId).toBe(tick);
  expect(state.leaseUntil).toBeUndefined();
  await expect(runBotMonitorTick(tick)).resolves.toHaveProperty('nextTickId');
});
test('stale messages and a disabled monitor cannot restart a loop', async () => {
  expect(await runBotMonitorTick('stale')).toEqual({nextTickId: null});
  process.env.BOT_MONITOR_ENABLED = 'false';
  expect(await runBotMonitorTick(tick)).toEqual({nextTickId: null});
  expect(scanBotDeposits).not.toHaveBeenCalled();
});
