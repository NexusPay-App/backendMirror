// Swap operator for BOT Chain OTC swaps.
//
// OTC is the model: a broker quotes a price against platform inventory and signs it, the user
// settles atomically against `BotSwapEscrow`, and the spread stays as inventory. There is no pool,
// no AMM and no external venue on BOT Chain today, so no route is assumed. If a venue appears, the
// swap becomes a router call and this escrow is retired, not extended.

import { encodeFunctionData } from 'viem'
import type { Address, Hex, LocalAccount } from 'viem'
import {
  recoverSwapQuoteSigner,
  signSwapQuote,
  swapDomain,
  swapQuoteDigest,
  swapQuoteId,
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
  NATIVE,
  type BotOpRecord,
  type BotPreflightIssue,
  type SwapQuote,
} from '../shared/types'
import { randomNonce } from '../bridge/operator'

// ---------------------------------------------------------------------------
// Contract ABI (must match swap/BotSwapEscrow.sol)
// ---------------------------------------------------------------------------

const SWAP_QUOTE_COMPONENTS = [
  { name: 'tokenIn', type: 'address' },
  { name: 'amountIn', type: 'uint256' },
  { name: 'tokenOut', type: 'address' },
  { name: 'amountOut', type: 'uint256' },
  { name: 'trader', type: 'address' },
  { name: 'recipient', type: 'address' },
  { name: 'minOut', type: 'uint256' },
  { name: 'feeBps', type: 'uint256' },
  { name: 'expiresAt', type: 'uint256' },
  { name: 'nonce', type: 'uint256' },
] as const

export const BOT_SWAP_ESCROW_ABI = [
  {
    type: 'function',
    name: 'swap',
    stateMutability: 'payable',
    inputs: [
      { name: 'quote', type: 'tuple', components: SWAP_QUOTE_COMPONENTS },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [{ name: 'quoteId', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'withdrawInventory',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'inventory',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

// ---------------------------------------------------------------------------
// Quote construction
// ---------------------------------------------------------------------------

export interface SwapQuoteInput {
  /** `NATIVE` for BOT, otherwise the ERC-20 the user pays with. */
  tokenIn: Address
  amountIn: bigint
  /** `NATIVE` for BOT, otherwise the ERC-20 the user receives. */
  tokenOut: Address
  /** Exact amount the user must receive, already net of the spread. */
  amountOut: bigint
  trader: Address
  /** Defaults to `trader`. The contract requires both to be the caller. */
  recipient?: Address
  /** Floor the user is willing to accept. Defaults to `amountOut`. */
  minOut?: bigint
  feeBps?: number
  ttlSeconds?: number
  nonce?: bigint
}

export function buildSwapQuote(input: SwapQuoteInput, now: number = nowSeconds()): SwapQuote {
  const minOut = input.minOut ?? input.amountOut
  return {
    tokenIn: input.tokenIn,
    amountIn: input.amountIn,
    tokenOut: input.tokenOut,
    amountOut: input.amountOut,
    trader: input.trader,
    recipient: input.recipient ?? input.trader,
    minOut,
    feeBps: BigInt(input.feeBps ?? 0),
    expiresAt: BigInt(now + (input.ttlSeconds ?? 120)),
    nonce: input.nonce ?? randomNonce(),
  }
}

// ---------------------------------------------------------------------------
// Pre-flight
// ---------------------------------------------------------------------------

export interface SwapPreflightInput {
  quote: SwapQuote
  now: number
  expectedTrader?: Address
  /** Inventory currently available for `quote.tokenOut`, when the caller has read it. */
  availableOut?: bigint
}

export function swapPreflight(input: SwapPreflightInput): BotPreflightIssue[] {
  const issues: BotPreflightIssue[] = []
  const { quote } = input

  if (quote.tokenIn === quote.tokenOut) {
    issues.push({ code: 'identicalTokens', message: 'tokenIn and tokenOut are the same' })
  }

  if (quote.amountIn <= 0n || quote.amountOut <= 0n) {
    issues.push({ code: 'amountMismatch', message: 'amountIn and amountOut must be greater than zero' })
  }

  if (quote.amountOut < quote.minOut) {
    issues.push({
      code: 'belowMinOut',
      message: 'amountOut is below the quote floor',
      detail: { amountOut: quote.amountOut.toString(), minOut: quote.minOut.toString() },
    })
  }

  if (quote.feeBps < 0n || quote.feeBps > 10_000n) {
    issues.push({ code: 'feeOutOfRange', message: 'feeBps must be between 0 and 10000' })
  }

  if (quote.recipient.toLowerCase() !== quote.trader.toLowerCase()) {
    issues.push({
      code: 'traderMismatch',
      message: 'recipient must equal trader for an OTC settlement',
      detail: { trader: quote.trader, recipient: quote.recipient },
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

  if (input.availableOut !== undefined && input.availableOut < quote.amountOut) {
    issues.push({
      code: 'inventoryShort',
      message: 'inventory cannot cover the quoted output',
      detail: {
        available: input.availableOut.toString(),
        required: quote.amountOut.toString(),
      },
    })
  }

  return issues
}

export function swapPreflightPasses(input: SwapPreflightInput): boolean {
  return swapPreflight(input).length === 0
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

export interface SignedSwapQuote {
  quote: SwapQuote
  quoteId: Hex
  digest: Hex
  signature: Hex
  context: Eip712Context
}

export async function signSwap(
  broker: LocalAccount,
  quote: SwapQuote,
  context: Eip712Context,
): Promise<SignedSwapQuote> {
  const domain = swapDomain(context)
  const signature = await signSwapQuote(broker, quote, domain)
  return {
    quote,
    quoteId: swapQuoteId(quote),
    digest: swapQuoteDigest(quote, domain),
    signature,
    context,
  }
}

export async function verifySwap(
  signed: SignedSwapQuote,
  expectedBroker: Address,
): Promise<boolean> {
  const recovered = await recoverSwapQuoteSigner(
    signed.quote,
    signed.signature,
    swapDomain(signed.context),
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

/// Native input is sent as `msg.value`; ERC-20 input needs an approval to the escrow first.
export function swapCall(escrow: Address, signed: SignedSwapQuote): ContractCall {
  const { quote } = signed
  return {
    to: escrow,
    data: encodeFunctionData({
      abi: BOT_SWAP_ESCROW_ABI,
      functionName: 'swap',
      args: [quote, signed.signature],
    }),
    value: quote.tokenIn === NATIVE ? quote.amountIn : 0n,
  }
}

/// Owner-only inventory move, including native BOT inventory with `token = NATIVE`.
export function withdrawInventoryCall(
  escrow: Address,
  token: Address,
  to: Address,
  amount: bigint,
): ContractCall {
  return {
    to: escrow,
    data: encodeFunctionData({
      abi: BOT_SWAP_ESCROW_ABI,
      functionName: 'withdrawInventory',
      args: [token, to, amount],
    }),
    value: 0n,
  }
}

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------

export function swapFingerprint(quote: SwapQuote): Hex {
  return fingerprintOf('swap', {
    tokenIn: quote.tokenIn,
    amountIn: quote.amountIn,
    tokenOut: quote.tokenOut,
    amountOut: quote.amountOut,
    trader: quote.trader,
    recipient: quote.recipient,
    minOut: quote.minOut,
    expiresAt: quote.expiresAt,
  })
}

export async function recordSwap(
  store: BotOpStore,
  args: { signed: SignedSwapQuote; userId: string; idempotencyKey: string },
): Promise<BotOpRecord> {
  return createOp(store, {
    quoteId: args.signed.quoteId,
    kind: 'swap',
    userId: args.userId,
    idempotencyKey: args.idempotencyKey,
    fingerprint: swapFingerprint(args.signed.quote),
  })
}

export async function markSwapSubmitted(
  store: BotOpStore,
  quoteId: Hex,
  sourceTxHash: Hex,
): Promise<BotOpRecord> {
  return markSubmitted(store, quoteId, sourceTxHash)
}

export async function markSwapReview(
  store: BotOpStore,
  quoteId: Hex,
  note: string,
): Promise<BotOpRecord> {
  return markReview(store, quoteId, note)
}

/// A swap settles in one transaction, so confirmation needs no destination hash.
export async function markSwapConfirmed(
  store: BotOpStore,
  quoteId: Hex,
  sourceTxHash: Hex,
): Promise<BotOpRecord> {
  return markConfirmed(store, quoteId, { destTxHash: sourceTxHash })
}

export async function markSwapFailed(
  store: BotOpStore,
  quoteId: Hex,
  note: string,
): Promise<BotOpRecord> {
  return markFailed(store, quoteId, note)
}
