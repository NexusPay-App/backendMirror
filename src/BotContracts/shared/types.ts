// Types for the BotContracts folder.
// Standalone module: it does not import from src/services, src/config or src/types, and it is
// safe to read without the rest of the backend.

import type { Address, Hex } from 'viem'

// ---------------------------------------------------------------------------
// Chain and token constants
// Mirrors of backendMirror/src/config/botchain.ts. If these drift, this folder is wrong.
// ---------------------------------------------------------------------------

export const BOT_CHAIN_ID = 677n
export const BOT_TESTNET_CHAIN_ID = 968n

export const BOT_ENTRY_POINT: Address = '0x0000000071727De22E5E9d8BAf0edAc6f37da032'
export const BOT_FACTORY: Address = '0xBC88d6012b3bf8426C2851d3798cEB5257658332'
export const BOT_USDT: Address = '0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C'

/// Native BOT is represented as the zero address in quote token fields, the same convention
/// `BotSwapEscrow` uses for `tokenIn` / `tokenOut`.
export const NATIVE: Address = '0x0000000000000000000000000000000000000000'

/// Seconds after `expiresAt` during which the operator may still complete a BOT payout.
/// Must match the `settlementWindow` passed to the `BotBridgeHub` constructor.
export const DEFAULT_SETTLEMENT_WINDOW_SECONDS = 3_600n

// ---------------------------------------------------------------------------
// Quotes
// These interfaces mirror the Solidity structs field for field, in order. The EIP-712 type
// strings in shared/signing.ts are derived from this exact order.
// ---------------------------------------------------------------------------

export interface BridgeQuote {
  token: Address
  amountIn: bigint
  trader: Address
  destChainId: bigint
  destToken: Address
  destAccount: Address
  minOut: bigint
  feeBps: bigint
  expiresAt: bigint
  nonce: bigint
}

export interface SwapQuote {
  tokenIn: Address
  amountIn: bigint
  tokenOut: Address
  amountOut: bigint
  trader: Address
  recipient: Address
  minOut: bigint
  feeBps: bigint
  expiresAt: bigint
  nonce: bigint
}

// ---------------------------------------------------------------------------
// Operation tracking
// ---------------------------------------------------------------------------

export type BotOpKind = 'bridge' | 'swap'

/// `quoted` exists only in the backend record, never on chain.
export type BotOpStatus = 'quoted' | 'submitted' | 'pending' | 'review' | 'confirmed' | 'failed'

export interface BotOpRecord {
  quoteId: Hex
  kind: BotOpKind
  userId: string
  idempotencyKey: string
  fingerprint: Hex
  status: BotOpStatus
  /// Source-chain (Arbitrum for a bridge, BOT for a swap) transaction hash.
  sourceTxHash: Hex | null
  /// Destination-chain payout transaction hash, when there is one to track.
  destTxHash: Hex | null
  /// BOT payout anchor recorded by `BotBridgeHub.release`.
  botPayoutRef: Hex | null
  attempts: number
  createdAt: number
  updatedAt: number
  note: string | null
}

// ---------------------------------------------------------------------------
// Pre-flight
// Every reason a quote or execution could be wrong is surfaced as a code, not a thrown string.
// ---------------------------------------------------------------------------

export type BotPreflightCode =
  | 'expired'
  | 'belowMinOut'
  | 'destinationMismatch'
  | 'traderMismatch'
  | 'amountMismatch'
  | 'identicalTokens'
  | 'feeOutOfRange'
  | 'inventoryShort'
  | 'gasBlocked'

export interface BotPreflightIssue {
  code: BotPreflightCode
  message: string
  detail?: Record<string, string>
}

// ---------------------------------------------------------------------------
// Serialization
// Quotes hold `bigint`, which JSON cannot represent. Anything persisted or logged goes through
// these helpers so a quote never round-trips through a lossy number.
// ---------------------------------------------------------------------------

export function serializeQuote(quote: BridgeQuote | SwapQuote): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(quote)) {
    out[key] = typeof value === 'bigint' ? value.toString() : String(value)
  }
  return out
}

export function deserializeBridgeQuote(raw: Record<string, string>): BridgeQuote {
  return {
    token: raw.token as Address,
    amountIn: BigInt(raw.amountIn),
    trader: raw.trader as Address,
    destChainId: BigInt(raw.destChainId),
    destToken: raw.destToken as Address,
    destAccount: raw.destAccount as Address,
    minOut: BigInt(raw.minOut),
    feeBps: BigInt(raw.feeBps),
    expiresAt: BigInt(raw.expiresAt),
    nonce: BigInt(raw.nonce),
  }
}

export function deserializeSwapQuote(raw: Record<string, string>): SwapQuote {
  return {
    tokenIn: raw.tokenIn as Address,
    amountIn: BigInt(raw.amountIn),
    tokenOut: raw.tokenOut as Address,
    amountOut: BigInt(raw.amountOut),
    trader: raw.trader as Address,
    recipient: raw.recipient as Address,
    minOut: BigInt(raw.minOut),
    feeBps: BigInt(raw.feeBps),
    expiresAt: BigInt(raw.expiresAt),
    nonce: BigInt(raw.nonce),
  }
}
