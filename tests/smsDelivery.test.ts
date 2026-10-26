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
