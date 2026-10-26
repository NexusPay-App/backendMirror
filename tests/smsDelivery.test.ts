const mockSend = jest.fn();
jest.mock('africastalking', () => ({ __esModule: true, default: () => ({ SMS: { send: mockSend } }) }));
jest.mock('../src/config/env', () => ({ __esModule: true, default: { AFRICAS_TALKING_API_KEY: 'fixture-only' } }));
import { SMSService } from '../src/services/smsService';
test.each(['InsufficientBalance', 'Failed', 'Throttled'])('a resolved provider request with %s is not reported as code delivery', async status => {
  mockSend.mockResolvedValue({ SMSMessageData: { Recipients: [{ number: '+254700000000', status }] } });
  expect(await SMSService.sendOTP('+254700000000', '123456')).toBe(false);
});
test('accepts only successful delivery acceptance for the requested phone', async () => {
  mockSend.mockResolvedValueOnce({ SMSMessageData: { Recipients: [{ number: '+254700000000', status: 'Success' }] } }).mockResolvedValueOnce({ SMSMessageData: { Recipients: [] } });
  expect(await SMSService.sendOTP('+254700000000', '123456')).toBe(true);
  expect(await SMSService.sendOTP('+254700000000', '123456')).toBe(false);
});

const deposit = { phoneNumber: '+254700000000', amount: '2.5', tokenType: 'USDT', transactionHash: `0x${'a'.repeat(64)}`, transactionType: 'receive' as const, status: 'success' as const, networkName: 'BOT Chain' };
test('transaction notifications require a matching accepted recipient and provider message ID', async () => {
  mockSend.mockResolvedValueOnce({ SMSMessageData: { Recipients: [{ number: deposit.phoneNumber, status: 'InsufficientBalance', statusCode: 405 }] } });
  expect(await SMSService.submitTransactionNotification(deposit)).toEqual({ status: 'rejected', code: '405' });
  mockSend.mockResolvedValueOnce({ SMSMessageData: { Recipients: [{ number: deposit.phoneNumber, status: 'Success', messageId: 'AT-fixture' }] } });
  expect(await SMSService.submitTransactionNotification(deposit)).toEqual({ status: 'accepted', messageId: 'AT-fixture' });
  const message = mockSend.mock.calls.at(-1)[0].message;
  expect(message).toContain('Received 2.5 USDT on BOT Chain');
  expect(message).toMatch(/^[\x20-\x7E]+$/);
  expect(message.length).toBeLessThanOrEqual(160);
});
test('network timeouts are ambiguous; authentication failures are definite rejections', async () => {
  mockSend.mockRejectedValueOnce(new Error('timeout'));
  expect((await SMSService.submitTransactionNotification(deposit)).status).toBe('unknown');
  mockSend.mockRejectedValueOnce({ response: { status: 401 } });
  expect(await SMSService.submitTransactionNotification(deposit)).toEqual({ status: 'rejected', code: 'PROVIDER_HTTP_401' });
});
