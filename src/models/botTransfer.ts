import { Schema, model, models } from 'mongoose';
const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true },
  idempotencyKey: { type: String, required: true },
  fingerprint: { type: String, required: true },
  network: { type: String, required: true },
  chainId: { type: Number, required: true },
  sender: { type: String, required: true },
  recipient: { type: String, required: true },
  token: { type: String, enum: ['BOT', 'WBOT', 'USDT'], required: true },
  amount: { type: String, required: true },
  amountUnits: { type: String, required: true },
  merchantId: String,
  // Outgoing debits default; the deposit indexer writes 'incoming' records into this
  // same collection so one ledger holds the whole BOT payment history.
  direction: { type: String, enum: ['outgoing', 'incoming'], default: 'outgoing' },
  userOpHash: String,
  transactionHash: String,
  blockNumber: String,
  status: { type: String, enum: ['preparing', 'submitted', 'pending', 'confirmed', 'failed', 'review'], default: 'preparing' },
  failureReason: String,
}, { timestamps: true });
schema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
// Nonce key 0 is sequential. Keep a durable single active debit per account,
// including ambiguous outcomes, until reconciliation releases it.
schema.index({ chainId: 1, sender: 1 }, { unique: true, partialFilterExpression: { status: { $in: ['preparing', 'submitted', 'pending', 'review'] } } });
schema.index({ userOpHash: 1 }, { unique: true, sparse: true });
schema.index({ userId: 1, createdAt: -1 });
// Deposit cursor recovery and direction-filtered history.
schema.index({ network: 1, direction: 1, createdAt: -1 });
export const BotTransfer = models.BotTransfer || model('BotTransfer', schema);
