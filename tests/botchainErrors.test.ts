import { botPaymentError, BotPaymentError } from '../src/services/botchainErrors';
test('known gas and validation failures have actionable messages', () => {
  expect(botPaymentError(new Error('AA21 did not pay prefund')).code).toBe('INSUFFICIENT_GAS');
  expect(botPaymentError(new Error('Recipient is not registered')).status).toBe(404);
  expect(botPaymentError(new Error('Another payment requires reconciliation')).status).toBe(409);
  expect(botPaymentError(new BotPaymentError('INSUFFICIENT_BALANCE', 'Not enough USDT')).message).toBe('Not enough USDT');
});
test('unexpected provider failures never leak their payload', () => {
  const error = botPaymentError(new Error('request failed: privateKey=secret; signature=secret'));
  expect(error.status).toBe(503);
  expect(error.message).not.toContain('secret');
});
