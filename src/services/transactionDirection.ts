/**
 * Money flow of a record as stored: which way value moved for the account that owns it.
 *
 * Shared by the authenticated history mapper and the public tx-dashboard feed so both
 * screens label the same row the same way. Legacy escrows are created by the owner's
 * own send/buy flow, so the type is the direction; BOT transfers carry an explicit
 * `direction` written by the transfer/deposit writers.
 *
 * Returns null when the record does not say (platform operations), so callers keep a
 * neutral label instead of guessing.
 */
export function getTransactionDirection(transactionType: string, botDirection?: string): 'incoming' | 'outgoing' | null {
  // The stored field always wins: an incoming BOT deposit is still type token_transfer.
  if (botDirection) return botDirection === 'incoming' ? 'incoming' : 'outgoing';
  if (transactionType === 'token_transfer' || transactionType === 'crypto_to_fiat' ||
      transactionType === 'crypto_to_paybill' || transactionType === 'crypto_to_till') return 'outgoing';
  if (transactionType === 'fiat_to_crypto') return 'incoming';
  return null;
}
