jest.mock('../src/models/botTransfer', () => ({ BotTransfer: { findOneAndUpdate: jest.fn(), updateOne: jest.fn(), updateMany: jest.fn() } }));
jest.mock('../src/models/models', () => ({ User: { findById: jest.fn() } }));
jest.mock('../src/services/smsService', () => ({ SMSService: { submitTransactionNotification: jest.fn() } }));
import { BotTransfer } from '../src/models/botTransfer';
import { User } from '../src/models/models';
import { SMSService } from '../src/services/smsService';
import { deliverBotDepositNotifications } from '../src/services/botDepositNotifications';

let records: any[];
let owner: any;
beforeEach(() => {
  process.env.ENABLE_SMS = 'true';
  records = [{ _id: 'deposit-1', userId: 'user-1', network: 'botchain', direction: 'incoming', status: 'confirmed', token: 'USDT', amount: '2.5', transactionHash: `0x${'a'.repeat(64)}`, smsStatus: 'pending', smsAttempts: 0 }];
  owner = { phoneNumber: '+254700000000', isPhoneVerified: true, status: 'active' };
  (User.findById as jest.Mock).mockImplementation(() => ({ select: async () => owner }));
  (BotTransfer.findOneAndUpdate as jest.Mock).mockImplementation(async () => {
    const record = records.find(r => r.smsStatus === 'pending' && (!r.smsNextAttemptAt || r.smsNextAttemptAt <= new Date()));
    if (!record) return null;
    record.smsStatus = 'processing'; record.smsAttempts++;
    return record;
  });
  (BotTransfer.updateOne as jest.Mock).mockImplementation(async (query, update) => {
    const record = records.find(r => r._id === query._id && r.smsStatus === query.smsStatus);
    if (record) Object.assign(record, update.$set);
  });
  (BotTransfer.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 0 });
  (SMSService.submitTransactionNotification as jest.Mock).mockResolvedValue({ status: 'accepted', messageId: 'AT-test-id' });
});
afterEach(() => { delete process.env.ENABLE_SMS; });

test.each(['USDT', 'BOT'])('submits one confirmed %s deposit notification and stores provider acceptance', async symbol => {
  records[0].token = symbol;
  const result = await deliverBotDepositNotifications();
  expect(result.accepted).toBe(1);
  expect(SMSService.submitTransactionNotification).toHaveBeenCalledWith(expect.objectContaining({ tokenType: symbol, transactionType: 'receive', status: 'success', networkName: 'BOT Chain' }));
  expect(records[0]).toMatchObject({ smsStatus: 'accepted', smsMessageId: 'AT-test-id' });
  await deliverBotDepositNotifications();
  expect(SMSService.submitTransactionNotification).toHaveBeenCalledTimes(1);
});
test('concurrent workers cannot submit the same notification twice', async () => {
  await Promise.all([deliverBotDepositNotifications(), deliverBotDepositNotifications()]);
  expect(SMSService.submitTransactionNotification).toHaveBeenCalledTimes(1);
});
test('does not disclose deposit details to an unverified phone', async () => {
  owner.isPhoneVerified = false;
  expect((await deliverBotDepositNotifications()).skipped).toBe(1);
  expect(SMSService.submitTransactionNotification).not.toHaveBeenCalled();
});
test('definite provider rejection schedules a bounded retry, not success', async () => {
  (SMSService.submitTransactionNotification as jest.Mock).mockResolvedValue({ status: 'rejected', code: 'PROVIDER_HTTP_401' });
  expect((await deliverBotDepositNotifications()).rejected).toBe(1);
  expect(records[0]).toMatchObject({ smsStatus: 'pending', smsAttempts: 1 });
  await deliverBotDepositNotifications();
  expect(SMSService.submitTransactionNotification).toHaveBeenCalledTimes(1);
});
test('an ambiguous delivery outcome is preserved without automatic resending', async () => {
  (SMSService.submitTransactionNotification as jest.Mock).mockResolvedValue({ status: 'unknown', code: 'PROVIDER_OUTCOME_UNKNOWN' });
  expect((await deliverBotDepositNotifications()).unknown).toBe(1);
  await deliverBotDepositNotifications();
  expect(records[0].smsStatus).toBe('unknown');
  expect(SMSService.submitTransactionNotification).toHaveBeenCalledTimes(1);
});
test('disabled SMS preserves the queue without calling the provider', async () => {
  process.env.ENABLE_SMS = 'false';
  expect((await deliverBotDepositNotifications()).enabled).toBe(false);
  expect(records[0].smsStatus).toBe('pending');
  expect(SMSService.submitTransactionNotification).not.toHaveBeenCalled();
});

test('sends distinct sender and recipient notifications for the same confirmed transaction', async () => {
  records.push({ ...records[0], _id: 'outgoing-1', userId: 'sender-1', direction: 'outgoing' });
  const result = await deliverBotDepositNotifications(2, { transactionHash: records[0].transactionHash });
  expect(result.accepted).toBe(2);
  expect(SMSService.submitTransactionNotification).toHaveBeenCalledWith(expect.objectContaining({ transactionType: 'send' }));
  expect(SMSService.submitTransactionNotification).toHaveBeenCalledWith(expect.objectContaining({ transactionType: 'receive' }));
  expect(BotTransfer.findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({ transactionHash: records[0].transactionHash, status: 'confirmed' }), expect.anything(), expect.anything());
  await deliverBotDepositNotifications();
  expect(SMSService.submitTransactionNotification).toHaveBeenCalledTimes(2);
});
test('configuration rejection keeps notifications recoverable after six attempts', async () => {
  records[0].smsAttempts = 6;
  (SMSService.submitTransactionNotification as jest.Mock).mockResolvedValue({ status: 'rejected', code: 'PROVIDER_HTTP_401' });
  await deliverBotDepositNotifications();
  expect(records[0].smsStatus).toBe('pending');
});
