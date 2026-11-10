// Native-BOT gas planning for wallets arriving from another chain.
//
// Why this exists: BOT Chain is self-funded for gas. A user bridged into BOT arrives with a BOT
// balance of zero unless the bridge also ships native BOT, and `botchainWallet` throws
// INSUFFICIENT_GAS for a zero balance, so their first transaction fails. This module decides a
// drip amount and nothing else: no keys, no RPC, no broadcast.
//
// Every bound is a hard cap:
//   - `targetWei`: top up to this balance, never above it
//   - `maxDripWei`: the most a single drip may send
//   - `dailyCapWei`: the most all drips for one account may send in a UTC day
//   - `minDripWei`: do not send dust; a below-minimum need is reported, not executed

export interface GasDripPolicy {
  targetWei: bigint
  minDripWei: bigint
  maxDripWei: bigint
  dailyCapWei: bigint
}

export interface GasDripState {
  balanceWei: bigint
  drippedTodayWei: bigint
}

export type GasDripSkipReason =
  | 'sufficient'
  | 'belowMinimum'
  | 'dailyCapReached'
  | 'policyDisabled'

export type GasDripDecision =
  | { kind: 'skip'; reason: GasDripSkipReason }
  | { kind: 'drip'; amountWei: bigint }

export function planGasDrip(policy: GasDripPolicy, state: GasDripState): GasDripDecision {
  if (policy.targetWei <= 0n || policy.maxDripWei <= 0n || policy.dailyCapWei <= 0n) {
    return { kind: 'skip', reason: 'policyDisabled' }
  }

  if (state.balanceWei >= policy.targetWei) {
    return { kind: 'skip', reason: 'sufficient' }
  }

  const remainingDaily = policy.dailyCapWei - state.drippedTodayWei
  if (remainingDaily <= 0n) {
    return { kind: 'skip', reason: 'dailyCapReached' }
  }

  const need = policy.targetWei - state.balanceWei
  const amountWei = minBigInt(need, minBigInt(policy.maxDripWei, remainingDaily))

  if (amountWei < policy.minDripWei) {
    return { kind: 'skip', reason: 'belowMinimum' }
  }

  return { kind: 'drip', amountWei }
}

function minBigInt(a: bigint, b: bigint): bigint {
  return a < b ? a : b
}

/// Defaults sized for a handful of BOT user operations, not for holding value.
/// These are starting points for beta and are meant to be set from config in production.
export const DEFAULT_GAS_DRIP_POLICY: GasDripPolicy = {
  targetWei: 5_000_000_000_000_000n, // 0.005 BOT
  minDripWei: 100_000_000_000_000n, // 0.0001 BOT
  maxDripWei: 5_000_000_000_000_000n, // 0.005 BOT
  dailyCapWei: 20_000_000_000_000_000n, // 0.02 BOT
}
