import { createHash } from 'node:crypto';
import { isAddress } from 'viem';
import { BotTransfer } from '../models/botTransfer';
import { User } from '../models/models';
import { Business } from '../models/businessModel';
import { getBotConfig, type BotNetwork, type BotToken } from '../config/botchain';
import { resolveBotAccount, prepareBotTransfer } from './botchainWallet';
import { readBotTransferStatus } from './botchainReceipts';
import { parseAmount, formatAmount } from '../utils/amounts';
import { invalidateUserTransactionHistory } from '../utils/txHistoryCache';
import { botPaymentError } from './botchainErrors';
import { recordNativeBotReceipt } from './botchainDeposits';

/** Normalize phone-like identifiers to E.164 for recipient lookup. */
export function normalizeBotRecipientPhone(raw: string): string {
  const trimmed = raw.trim().replace(/[\s\-().]/g, '');
  if (!trimmed) return raw.trim();
  if (/^\+\d{8,15}$/.test(trimmed)) return trimmed;
  if (/^0[17]\d{8}$/.test(trimmed)) return `+254${trimmed.slice(1)}`;
  if (/^[17]\d{8}$/.test(trimmed)) return `+254${trimmed}`;
  if (/^254[17]\d{8}$/.test(trimmed)) return `+${trimmed}`;
  return trimmed;
}

export function transferFingerprint(value: { network: string; recipient: string; symbol: string; amountUnits: string; merchantId?: string }) {
  return createHash('sha256').update(JSON.stringify([value.network, value.recipient.toLowerCase(), value.symbol, value.amountUnits, value.merchantId || ''])).digest('hex');
}
export async function submitBotTransfer(user: any, network: BotNetwork, input: { recipientIdentifier?: string; merchantId?: string; tokenSymbol: BotToken; amount: string; senderAddress?: string }, idempotencyKey: string) {
  const n = getBotConfig(network);
  if (!n.transfersEnabled) throw new Error('BOT transfers are not enabled');
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey)) throw new Error('A stable Idempotency-Key of 16–100 characters is required');
  const token = n.tokens[input.tokenSymbol];
  if (!token || typeof input.amount !== 'string') throw new Error('Supply a supported asset and a decimal-string amount');
  if (input.merchantId && input.tokenSymbol !== 'USDT') throw new Error('BOT merchant payments support USDT only');
  const amountUnits = parseAmount(input.amount, token.decimals).toString();
  const account = await resolveBotAccount(user, network);
  if (input.senderAddress && input.senderAddress.toLowerCase() !== account.address.toLowerCase()) throw new Error('Sender address does not belong to authenticated user on this network');
  let recipient: string;
  if (input.merchantId) {
    const business = await Business.findOne({ merchantId: input.merchantId });
    if (!business) throw new Error('Merchant not found');
    recipient = (await resolveBotAccount(business, network, 'business')).address;
  } else if (input.recipientIdentifier && isAddress(input.recipientIdentifier)) {
    recipient = input.recipientIdentifier;
  } else {
    const identifier = input.recipientIdentifier?.trim();
    if (!identifier) throw new Error('Recipient is required');
    const phoneOrEmail = identifier.includes('@') ? identifier.toLowerCase() : normalizeBotRecipientPhone(identifier);
    const recipientUser = await User.findOne(identifier.includes('@') ? { email: phoneOrEmail } : { phoneNumber: phoneOrEmail.startsWith('+') ? phoneOrEmail : `+${phoneOrEmail}` });
    if (!recipientUser) throw new Error('Recipient is not registered');
    recipient = (await resolveBotAccount(recipientUser, network)).address;
  }
  const fingerprint = transferFingerprint({ network, recipient, symbol: input.tokenSymbol, amountUnits, merchantId: input.merchantId });
  const existing = await BotTransfer.findOne({ userId: user._id, idempotencyKey });
  if (existing) {
    if (existing.fingerprint !== fingerprint) throw new Error('Idempotency-Key already belongs to a different payment');
    return existing;
  }
  let record;
  try {
    record = await BotTransfer.create({ userId: user._id, idempotencyKey, fingerprint, network, chainId: n.id, sender: account.address.toLowerCase(), recipient, token: input.tokenSymbol, amount: formatAmount(BigInt(amountUnits), token.decimals), amountUnits, merchantId: input.merchantId });
  } catch (error: any) {
    if (error.code !== 11000) throw error;
    const retry = await BotTransfer.findOne({ userId: user._id, idempotencyKey, fingerprint });
    if (retry) return retry;
    // A record without a hash may still be preparing in another live request.
    // Never release its lock or resubmit an uncertain operation automatically.
    throw new Error('Another payment from this BOT account requires reconciliation');
  }
  try {
    const prepared = await prepareBotTransfer(network, user.privateKey, account.address, recipient, input.tokenSymbol, record.amount);
    // Persist the deterministic operation hash BEFORE submission. A timeout never
    // creates a replacement payment or switches the signing account.
    record.userOpHash = prepared.userOpHash;
    record.status = 'submitted';
    try {
      await record.save();
    } catch (saveError: any) {
      if (saveError?.code !== 11000 || !saveError?.keyPattern?.userOpHash) throw saveError;
      // The unique-index rejection guarantees this record did not persist the
      // hash. Keep the original record intact; it may already be on-chain.
      record.userOpHash = undefined;
      throw new Error('Another payment from this BOT account requires reconciliation');
    }
    const hash = await prepared.submit();
    if (hash.toLowerCase() !== prepared.userOpHash.toLowerCase()) throw new Error('Bundler returned an unexpected operation hash');
    record.status = 'pending';
    await record.save();
  } catch (error) {
    // Log the underlying cause; the payment stays locked until reconciliation decides.
    const failure = botPaymentError(error);
    console.warn('BOT payment preparation/submission failed', { paymentId: String(record._id), network, code: failure.code });
    record.status = record.userOpHash ? 'review' : 'failed';
    record.failureCode = record.userOpHash ? 'SUBMISSION_UNCERTAIN' : failure.code;
    record.failureReason = record.userOpHash ? 'Submission outcome requires reconciliation; do not retry with a new payment key.' : failure.message;
    try { await record.save(); } catch (saveError) {
      // A colliding userOpHash must not mask the original failure; keep the reason visible.
      console.warn('BOT payment state could not be persisted', { paymentId: String(record._id) });
    }
  }
  // New or updated BOT payments must appear in history immediately, not after the TTL.
  await invalidateUserTransactionHistory(user._id);
  return record;
}
export async function reconcileBotTransfer(record: any) {
  if (!record.userOpHash || ['confirmed', 'failed'].includes(record.status)) return record;
  const previousStatus = record.status;
  try {
    const result = await readBotTransferStatus(record);
    if (result.status === 'confirmed' && record.token === 'BOT') await recordNativeBotReceipt({ ...record.toObject(), ...result });
    Object.assign(record, result);
    await record.save();
    if (record.status !== previousStatus) {
      await invalidateUserTransactionHistory(record.userId);
    }
  } catch (error) {
    // Preserve ambiguous records and account locks for the next poll/operator review.
    // Log unexpected errors so a stuck pending state is diagnosable.
    console.warn(`BOT reconcile ${record.userOpHash}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return record;
}
export function publicBotTransfer(record: any) {
  const n = getBotConfig(record.network);
  return { id: String(record._id), network: record.network, chainId: record.chainId, direction: record.direction || 'outgoing', sender: record.sender, recipient: record.recipient, amount: record.amount, amountUnits: record.amountUnits, tokenSymbol: record.token, status: record.status, userOpHash: record.userOpHash, transactionHash: record.transactionHash, explorerUrl: record.transactionHash ? `${n.explorer}/tx/${record.transactionHash}` : undefined, failureReason: record.failureReason, failureCode: record.failureCode, createdAt: record.createdAt };
}
