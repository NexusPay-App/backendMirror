export class BotPaymentError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
    this.name = 'BotPaymentError';
  }
}

/** Never expose provider payloads, signed operations, or key material to clients. */
export function botPaymentError(error: unknown): BotPaymentError {
  if (error instanceof BotPaymentError) return error;
  const message = error instanceof Error ? error.message : '';
  if (/AA21|AA31|prefund|insufficient funds|insufficient.*gas/i.test(message)) {
    return new BotPaymentError('INSUFFICIENT_GAS', 'Your BOT wallet needs more native BOT to pay the network fee. Fund the BOT address shown on Receive and try again.');
  }
  if (/Another payment|Idempotency-Key already/i.test(message)) {
    return new BotPaymentError('PAYMENT_IN_PROGRESS', 'An earlier payment needs confirmation. Check its status in transaction history before starting another payment.', 409);
  }
  if (/Recipient is not registered|Merchant not found/i.test(message)) {
    return new BotPaymentError('RECIPIENT_NOT_FOUND', 'This recipient is not registered with NexusPay. Check their phone number or use their BOT wallet address.', 404);
  }
  if (/Idempotency-Key|decimal|amount|supported asset|Recipient is required|merchant payments support/i.test(message)) {
    return new BotPaymentError('INVALID_PAYMENT', 'Check the recipient, asset, and amount. Enter a positive amount within the asset’s decimal precision.');
  }
  return new BotPaymentError('BOT_NETWORK_UNAVAILABLE', 'The BOT network could not prepare this payment. No new payment was submitted. Check your balance and try again shortly.', 503);
}
