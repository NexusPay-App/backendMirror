jest.mock('../src/models/botTransfer', () => ({ BotTransfer: { findOne: jest.fn(), create: jest.fn() } }));
jest.mock('../src/services/botchainWallet', () => ({ resolveBotAccount: jest.fn(), prepareBotTransfer: jest.fn() }));
import { BotTransfer } from '../src/models/botTransfer';
import { resolveBotAccount, prepareBotTransfer } from '../src/services/botchainWallet';
import { submitBotTransfer } from '../src/services/botchainTransfers';
const user = { _id: 'user-1', privateKey: 'fixture-not-a-key', walletAddress: '0x9999999999999999999999999999999999999999' };
const address = '0x1111111111111111111111111111111111111111';
const input = { recipientIdentifier: '0x2222222222222222222222222222222222222222', tokenSymbol: 'USDT' as const, amount: '1.234567' };
let records: any[];
let submit: jest.Mock;
beforeEach(() => {
  process.env.BOTCHAIN_TESTNET_ENABLED = 'true'; process.env.BOTCHAIN_TESTNET_TRANSFERS_ENABLED = 'true';
  records = []; submit = jest.fn().mockResolvedValue('0xabc');
  (resolveBotAccount as jest.Mock).mockResolvedValue({ address });
  (prepareBotTransfer as jest.Mock).mockResolvedValue({ userOpHash: '0xabc', submit });
  (BotTransfer.findOne as jest.Mock).mockImplementation(async (query: any) => records.find(r => r.userId === query.userId && r.idempotencyKey === query.idempotencyKey));
  (BotTransfer.create as jest.Mock).mockImplementation(async value => { const record = { ...value, _id: 'payment-1', status: 'preparing', save: jest.fn().mockResolvedValue(undefined) }; records.push(record); return record; });
});
afterEach(() => { delete process.env.BOTCHAIN_TESTNET_ENABLED; delete process.env.BOTCHAIN_TESTNET_TRANSFERS_ENABLED; });
test('an identical retry never submits a second operation or replaces the legacy wallet', async () => {
  const first = await submitBotTransfer(user, 'botchain-testnet', input, 'stable-request-key-1');
  const second = await submitBotTransfer(user, 'botchain-testnet', input, 'stable-request-key-1');
  expect(first).toBe(second); expect(submit).toHaveBeenCalledTimes(1); expect(first.amountUnits).toBe('1234567');
  expect(user.walletAddress).toBe('0x9999999999999999999999999999999999999999');
  await expect(submitBotTransfer(user, 'botchain-testnet', { ...input, amount: '2' }, 'stable-request-key-1')).rejects.toThrow('different payment');
});
test('a timeout after submission preserves the operation hash and blocks resubmission', async () => {
  submit.mockRejectedValue(Error('timeout'));
  const first = await submitBotTransfer(user, 'botchain-testnet', input, 'stable-request-key-2');
  expect(first.status).toBe('review'); expect(first.userOpHash).toBe('0xabc');
  await submitBotTransfer(user, 'botchain-testnet', input, 'stable-request-key-2');
  expect(submit).toHaveBeenCalledTimes(1);
});
test('wrong-network sender is rejected before any operation is prepared', async () => {
  await expect(submitBotTransfer(user, 'botchain-testnet', { ...input, senderAddress: user.walletAddress }, 'stable-request-key-3')).rejects.toThrow('Sender address');
  expect(BotTransfer.create).not.toHaveBeenCalled();
});
test('a competing request cannot release a live preparation lock', async () => {
  const active = { status: 'preparing', userOpHash: null, save: jest.fn() };
  (BotTransfer.create as jest.Mock).mockRejectedValue({ code: 11000 });
  (BotTransfer.findOne as jest.Mock).mockImplementation(async query => query.chainId ? active : undefined);
  await expect(submitBotTransfer(user, 'botchain-testnet', input, 'competing-request-key')).rejects.toThrow('requires reconciliation');
  expect(prepareBotTransfer).not.toHaveBeenCalled();
  expect(active.save).not.toHaveBeenCalled();
  expect(BotTransfer.create).toHaveBeenCalledTimes(1);
});
test('a preparation failure returns a safe reason without claiming submission', async () => {
  (prepareBotTransfer as jest.Mock).mockRejectedValue(new Error('AA21 did not pay prefund'));
  const record = await submitBotTransfer(user, 'botchain-testnet', input, 'underfunded-request-key');
  expect(record.status).toBe('failed');
  expect(record.failureCode).toBe('INSUFFICIENT_GAS');
  expect(record.failureReason).toContain('native BOT');
  expect(record.userOpHash).toBeUndefined();
  expect(submit).not.toHaveBeenCalled();
});
