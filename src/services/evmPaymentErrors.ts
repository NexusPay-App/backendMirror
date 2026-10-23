export class EvmPaymentError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

export function evmPaymentError(error: unknown, network: string) {
  if (error instanceof EvmPaymentError) return error;
  const message = error instanceof Error ? error.message : '';
  if (/mainnets not enabled|billing|unauthorized|invalid.*(?:key|client)|401|403/i.test(message)) {
    return new EvmPaymentError('PAYMENT_PROVIDER_UNAVAILABLE', 'Payments on this network are temporarily unavailable. The payment provider needs configuration.', 503);
  }
  if (/AA21|AA31|prefund|insufficient funds|insufficient.*gas/i.test(message)) {
    return new EvmPaymentError('INSUFFICIENT_GAS', `Your NexusPay wallet needs native ETH on ${network} for network fees. Fund the address shown on Receive on the same network.`);
  }
  if (/Insufficient token balance/i.test(message)) return new EvmPaymentError('INSUFFICIENT_TOKEN_BALANCE', 'Your token balance is too low for this payment.');
  if (/Signing account does not match/i.test(message)) return new EvmPaymentError('ACCOUNT_MISMATCH', 'This wallet needs an account configuration check before it can send payments.', 409);
  return new EvmPaymentError('PAYMENT_STATUS_UNCERTAIN', 'The payment could not be confirmed. Check your history and explorer before retrying.', 503);
}
