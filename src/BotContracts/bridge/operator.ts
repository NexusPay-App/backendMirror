// Bridge operator: quote, sign, verify, encode, track, reconcile.
//
// Nothing here holds a key beyond the broker account passed in, and nothing broadcasts. The
// operator composes a signed quote and the exact calldata; the caller's signer/submitter sends it.
// That split is deliberate: it keeps this folder testable and keeps key handling where the rest of
// the backend already manages it.

import { randomBytes } from 'node:crypto'
import { encodeFunctionData } from 'viem'
import type { Address, Hex, LocalAccount } from 'viem'
import { planGasDrip, type GasDripDecision, type GasDripPolicy } from '../shared/gasDrip'
import {
  bridgeDomain,
  bridgeQuoteDigest,
  bridgeQuoteId,
  recoverBridgeQuoteSigner,
  signBridgeQuote,
  type Eip712Context,
} from '../shared/signing'
import {
  createOp,
  fingerprintOf,
  markConfirmed,
  markFailed,
  markReview,
  markSubmitted,
  nowSeconds,
  type BotOpStore,
} from '../shared/state'
import {
  BOT_CHAIN_ID,
  NATIVE,
  type BridgeQuote,
  type BotOpRecord,
  type BotPreflightIssue,
} from '../shared/types'

// ---------------------------------------------------------------------------
// Contract ABI (must match bridge/BotBridgeHub.sol)
// ---------------------------------------------------------------------------

const BRIDGE_QUOTE_COMPONENTS = [
  { name: 'token', type: 'address' },
  { name: 'amountIn', type: 'uint256' },
  { name: 'trader', type: 'address' },
  { name: 'destChainId', type: 'uint256' },
  { name: 'destToken', type: 'address' },
  { name: 'destAccount', type: 'address' },
  { name: 'minOut', type: 'uint256' },
  { name: 'feeBps', type: 'uint256' },
  { name: 'expiresAt', type: 'uint256' },
  { name: 'nonce', type: 'uint256' },
] as const

export const BOT_BRIDGE_HUB_ABI = [
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'quote', type: 'tuple', components: BRIDGE_QUOTE_COMPONENTS },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [{ name: 'quoteId', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'release',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'quoteId', type: 'bytes32' },
      { name: 'botPayoutRef', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'refund',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'quoteId', type: 'bytes32' }],
    outputs: [],
  },
] as const

// ---------------------------------------------------------------------------
// Quote construction
// ---------------------------------------------------------------------------

export interface BridgeQuoteInput {
  token: Address
  amountIn: bigint
  trader: Address
  destToken: Address
  /** The BOT smart account that must receive the payout. Always passed explicitly, never derived. */
  destAccount: Address
  minOut?: bigint
  feeBps?: number
  ttlSeconds?: number
  nonce?: bigint
  /** BOT chain id inside the quote. Defaults to mainnet; a testnet hub passes 968. */
  destChainId?: bigint
}

export function buildBridgeQuote(
  input: BridgeQuoteInput,
  now: number = nowSeconds(),
): BridgeQuote {
  return {
    token: input.token,
    amountIn: input.amountIn,
    trader: input.trader,
    destChainId: input.destChainId ?? BOT_CHAIN_ID,
    destToken: input.destToken,
    destAccount: input.destAccount,
    minOut: input.minOut ?? 0n,
    feeBps: BigInt(input.feeBps ?? 0),
    expiresAt: BigInt(now + (input.ttlSeconds ?? 900)),
    nonce: input.nonce ?? randomNonce(),
  }
}

/// Random nonce so two quotes with identical terms are still distinct, single-use quotes.
export function randomNonce(): bigint {
  return BigInt(`0x${randomBytes(16).toString('hex')}`)
}

// ---------------------------------------------------------------------------
// Pre-flight
// ---------------------------------------------------------------------------

export interface BridgePreflightInput {
  quote: BridgeQuote
  now: number
  /** The BOT account the user is supposed to be paid on. Compared case-insensitively. */
  expectedDestAccount?: Address
  /** Chain id the deposit contract is bound to. Defaults to BOT mainnet. */
  expectedDestChainId?: bigint
  expectedTrader?: Address
  /** Arrival gas state, when the BOT side is already known to be empty. */
  arrivalGas?: { balanceWei: bigint; drippedTodayWei: bigint; policy: GasDripPolicy }
}

export function bridgePreflight(input: BridgePreflightInput): BotPreflightIssue[] {
  const issues: BotPreflightIssue[] = []
  const { quote } = input

  if (quote.amountIn <= 0n) {
    issues.push({ code: 'amountMismatch', message: 'amountIn must be greater than zero' })
  }

  if (quote.feeBps < 0n || quote.feeBps > 10_000n) {
    issues.push({ code: 'feeOutOfRange', message: 'feeBps must be between 0 and 10000' })
  }

  const expectedDestChainId = input.expectedDestChainId ?? BOT_CHAIN_ID
  if (quote.destChainId !== expectedDestChainId) {
    issues.push({
      code: 'destinationMismatch',
      message: 'destination chain is not the BOT chain this deployment settles to',
      detail: { expected: expectedDestChainId.toString(), got: quote.destChainId.toString() },
    })
  }

  if (quote.destAccount === NATIVE) {
    issues.push({ code: 'destinationMismatch', message: 'destination account is the zero address' })
  }

  if (
    input.expectedDestAccount &&
    quote.destAccount.toLowerCase() !== input.expectedDestAccount.toLowerCase()
  ) {
    issues.push({
      code: 'destinationMismatch',
      message: 'destination account does not match the account derived for this user',
      detail: { expected: input.expectedDestAccount, got: quote.destAccount },
    })
  }

  if (
    input.expectedTrader &&
    quote.trader.toLowerCase() !== input.expectedTrader.toLowerCase()
  ) {
    issues.push({
      code: 'traderMismatch',
      message: 'quote was not issued to this trader',
      detail: { expected: input.expectedTrader, got: quote.trader },
    })
  }

  if (quote.expiresAt <= BigInt(input.now)) {
    issues.push({
      code: 'expired',
      message: 'quote has expired',
      detail: { expiresAt: quote.expiresAt.toString(), now: String(input.now) },
    })
  }

  if (input.arrivalGas) {
    const decision = planGasDrip(input.arrivalGas.policy, {
      balanceWei: input.arrivalGas.balanceWei,
      drippedTodayWei: input.arrivalGas.drippedTodayWei,
    })
    if (decision.kind === 'skip' && decision.reason !== 'sufficient') {
      issues.push({
        code: 'gasBlocked',
        message:
          'the BOT account cannot pay gas and no drip is available, the bridged user could not transact',
        detail: { reason: decision.reason, balanceWei: input.arrivalGas.balanceWei.toString() },
      })
    }
  }

  return issues
}

/// Convenience: a bridge quote is safe to hand to a user only when pre-flight is clean.
export function bridgePreflightPasses(input: BridgePreflightInput): boolean {
  return bridgePreflight(input).length === 0
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

export interface SignedBridgeQuote {
  quote: BridgeQuote
  quoteId: Hex
  digest: Hex
  signature: Hex
  context: Eip712Context
}

export async function signBridge(
  broker: LocalAccount,
  quote: BridgeQuote,
  context: Eip712Context,
): Promise<SignedBridgeQuote> {
  const domain = bridgeDomain(context)
  const signature = await signBridgeQuote(broker, quote, domain)
  return {
    quote,
    quoteId: bridgeQuoteId(quote),
    digest: bridgeQuoteDigest(quote, domain),
    signature,
    context,
  }
}

/// Recover the signer and compare with the broker the hub was deployed with.
export async function verifyBridge(
  signed: SignedBridgeQuote,
  expectedBroker: Address,
): Promise<boolean> {
  const recovered = await recoverBridgeQuoteSigner(
    signed.quote,
    signed.signature,
    bridgeDomain(signed.context),
  )
  return recovered.toLowerCase() === expectedBroker.toLowerCase()
}

// ---------------------------------------------------------------------------
// Calldata
// ---------------------------------------------------------------------------

export interface ContractCall {
  to: Address
  data: Hex
  value: bigint
}

/// The user's smart account calls this after approving `quote.amountIn` to the hub.
export function bridgeDepositCall(hub: Address, signed: SignedBridgeQuote): ContractCall {
  return {
    to: hub,
    data: encodeFunctionData({
      abi: BOT_BRIDGE_HUB_ABI,
      functionName: 'deposit',
      args: [signed.quote, signed.signature],
    }),
    value: 0n,
  }
}

/// Operator-only: anchor the BOT payout reference on Arbitrum.
export function bridgeReleaseCall(hub: Address, quoteId: Hex, botPayoutRef: Hex): ContractCall {
  return {
    to: hub,
    data: encodeFunctionData({
      abi: BOT_BRIDGE_HUB_ABI,
      functionName: 'release',
      args: [quoteId, botPayoutRef],
    }),
    value: 0n,
  }
}

/// Depositor-only: reclaim the locked asset once the release window has closed.
export function bridgeRefundCall(hub: Address, quoteId: Hex): ContractCall {
  return {
    to: hub,
    data: encodeFunctionData({
      abi: BOT_BRIDGE_HUB_ABI,
      functionName: 'refund',
      args: [quoteId],
    }),
    value: 0n,
  }
}

// ---------------------------------------------------------------------------
// Gas on arrival
// ---------------------------------------------------------------------------

export function planArrivalGas(args: {
  policy: GasDripPolicy
  balanceWei: bigint
  drippedTodayWei: bigint
}): GasDripDecision {
  return planGasDrip(args.policy, {
    balanceWei: args.balanceWei,
    drippedTodayWei: args.drippedTodayWei,
  })
}

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------

export function bridgeFingerprint(quote: BridgeQuote): Hex {
  return fingerprintOf('bridge', {
    token: quote.token,
    amountIn: quote.amountIn,
    trader: quote.trader,
    destChainId: quote.destChainId,
    destToken: quote.destToken,
    destAccount: quote.destAccount,
    minOut: quote.minOut,
    expiresAt: quote.expiresAt,
  })
}

export async function recordBridgeDeposit(
  store: BotOpStore,
  args: { signed: SignedBridgeQuote; userId: string; idempotencyKey: string },
): Promise<BotOpRecord> {
  return createOp(store, {
    quoteId: args.signed.quoteId,
    kind: 'bridge',
    userId: args.userId,
    idempotencyKey: args.idempotencyKey,
    fingerprint: bridgeFingerprint(args.signed.quote),
  })
}

export async function markBridgeSubmitted(
  store: BotOpStore,
  quoteId: Hex,
  sourceTxHash: Hex,
): Promise<BotOpRecord> {
  return markSubmitted(store, quoteId, sourceTxHash)
}

export async function markBridgeReview(
  store: BotOpStore,
  quoteId: Hex,
  note: string,
): Promise<BotOpRecord> {
  return markReview(store, quoteId, note)
}

/// Settle: the BOT payout hash is recorded against the escrow as well as the operation.
export async function markBridgeReleased(
  store: BotOpStore,
  quoteId: Hex,
  botPayoutRef: Hex,
): Promise<BotOpRecord> {
  return markConfirmed(store, quoteId, { botPayoutRef, destTxHash: botPayoutRef })
}

export async function markBridgeRefunded(
  store: BotOpStore,
  quoteId: Hex,
  note: string,
): Promise<BotOpRecord> {
  return markFailed(store, quoteId, note)
}
