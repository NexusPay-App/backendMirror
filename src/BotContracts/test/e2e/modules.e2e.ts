// Tests for the shared TypeScript modules that sit beside the contracts: gas-drip planning, quote
// construction, preflight validation, the operation state machine and quote serialization.
//
//   npx tsx test/e2e/modules.e2e.ts

import {
  bridgePreflight,
  buildBridgeQuote,
  planArrivalGas,
  randomNonce,
} from '../../bridge/operator'
import { buildSwapQuote, swapPreflight } from '../../swap/operator'
import { DEFAULT_GAS_DRIP_POLICY, planGasDrip } from '../../shared/gasDrip'
import {
  InMemoryBotOpStore,
  createOp,
  fingerprintOf,
  markConfirmed,
  markFailed,
  markPending,
  markReview,
  markSubmitted,
} from '../../shared/state'
import type { Hex } from 'viem'
import {
  BOT_CHAIN_ID,
  NATIVE,
  deserializeBridgeQuote,
  deserializeSwapQuote,
  serializeQuote,
  type BridgeQuote,
  type SwapQuote,
} from '../../shared/types'

let checks = 0
const failures: string[] = []

function check(name: string, condition: boolean, detail?: unknown): void {
  checks += 1
  if (condition) {
    console.log(`  ok   ${name}`)
  } else {
    failures.push(name)
    console.log(
      `  FAIL ${name}${
        detail === undefined
          ? ''
          : ` -> ${JSON.stringify(detail, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))}`
      }`,
    )
  }
}

async function checkThrows(
  name: string,
  action: () => Promise<unknown>,
  expected: string,
): Promise<void> {
  try {
    await action()
    check(name, false, 'did not throw')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    check(name, message.includes(expected), { expected, got: message })
  }
}

const NOW = 1_800_000_000

/// 32-byte hex constant from a repeated byte, typed the way viem expects.
const h32 = (byte: string): Hex => `0x${byte.repeat(32)}` as Hex
const TRADER = '0x00000000000000000000000000000000000000A1' as const
const USDC = '0x00000000000000000000000000000000000000B2' as const
const BOT_USDT = '0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C' as const

// --------------------------------------------------------------------------- quotes

const bridgeQuote = buildBridgeQuote(
  { token: USDC, amountIn: 25_000_000n, trader: TRADER, destToken: BOT_USDT, destAccount: TRADER },
  NOW,
)
check('bridge quote targets BOT Chain', bridgeQuote.destChainId === BOT_CHAIN_ID, bridgeQuote.destChainId)
check('bridge quote defaults to a 15 minute ttl', bridgeQuote.expiresAt === BigInt(NOW + 900), bridgeQuote.expiresAt)
check('bridge quote defaults minOut to zero', bridgeQuote.minOut === 0n)
check('bridge quotes get distinct nonces', randomNonce() !== randomNonce())

const cleanIssues = bridgePreflight({ quote: bridgeQuote, now: NOW })
check('clean bridge quote passes preflight', cleanIssues.length === 0, cleanIssues)

check(
  'expired bridge quote is flagged',
  bridgePreflight({ quote: bridgeQuote, now: Number(bridgeQuote.expiresAt) }).some((i) => i.code === 'expired'),
)
check(
  'non-BOT destination is flagged',
  bridgePreflight({ quote: { ...bridgeQuote, destChainId: 42161n }, now: NOW }).some(
    (i) => i.code === 'destinationMismatch',
  ),
)
check(
  'zero destination account is flagged',
  bridgePreflight({ quote: { ...bridgeQuote, destAccount: NATIVE }, now: NOW }).some(
    (i) => i.code === 'destinationMismatch',
  ),
)
check(
  'fee above 10000 bps is flagged',
  bridgePreflight({ quote: { ...bridgeQuote, feeBps: 10_001n }, now: NOW }).some(
    (i) => i.code === 'feeOutOfRange',
  ),
)
check(
  'zero amount is flagged',
  bridgePreflight({ quote: { ...bridgeQuote, amountIn: 0n }, now: NOW }).some(
    (i) => i.code === 'amountMismatch',
  ),
)
check(
  'wrong trader is flagged',
  bridgePreflight({ quote: bridgeQuote, now: NOW, expectedTrader: '0x00000000000000000000000000000000000000F9' }).some(
    (i) => i.code === 'traderMismatch',
  ),
)
check(
  'arrival without gas and no drip is flagged',
  bridgePreflight({
    quote: bridgeQuote,
    now: NOW,
    arrivalGas: { balanceWei: 0n, drippedTodayWei: 20_000_000_000_000_000n, policy: DEFAULT_GAS_DRIP_POLICY },
  }).some((i) => i.code === 'gasBlocked'),
)

const swapQuote = buildSwapQuote(
  { tokenIn: NATIVE, amountIn: 1_000_000_000_000_000n, tokenOut: BOT_USDT, amountOut: 24_000_000n, trader: TRADER },
  NOW,
)
check('swap recipient defaults to trader', swapQuote.recipient === TRADER)
check('swap minOut defaults to amountOut', swapQuote.minOut === swapQuote.amountOut)
check('clean swap quote passes preflight', swapPreflight({ quote: swapQuote, now: NOW }).length === 0)
check(
  'identical tokens are flagged',
  swapPreflight({ quote: { ...swapQuote, tokenOut: NATIVE }, now: NOW }).some((i) => i.code === 'identicalTokens'),
)
check(
  'short inventory is flagged',
  swapPreflight({ quote: swapQuote, now: NOW, availableOut: 1n }).some((i) => i.code === 'inventoryShort'),
)
check(
  'amountOut below minOut is flagged',
  swapPreflight({ quote: { ...swapQuote, minOut: 25_000_000n }, now: NOW }).some((i) => i.code === 'belowMinOut'),
)
check(
  'recipient different from trader is flagged',
  swapPreflight({ quote: { ...swapQuote, recipient: '0x00000000000000000000000000000000000000F9' }, now: NOW }).some(
    (i) => i.code === 'traderMismatch',
  ),
)

// --------------------------------------------------------------------------- gas drip

check(
  'gas drip skips a funded account',
  JSON.stringify(planGasDrip(DEFAULT_GAS_DRIP_POLICY, { balanceWei: 5_000_000_000_000_000n, drippedTodayWei: 0n })) ===
    JSON.stringify({ kind: 'skip', reason: 'sufficient' }),
)
const partial = planGasDrip(DEFAULT_GAS_DRIP_POLICY, { balanceWei: 1_000_000_000_000_000n, drippedTodayWei: 0n })
check(
  'gas drip tops up to target',
  partial.kind === 'drip' && partial.amountWei === 4_000_000_000_000_000n,
  partial,
)
const capped = planGasDrip(DEFAULT_GAS_DRIP_POLICY, {
  balanceWei: 0n,
  drippedTodayWei: 19_000_000_000_000_000n,
})
check('gas drip respects the daily cap', capped.kind === 'drip' && capped.amountWei === 1_000_000_000_000_000n, capped)
const exhausted = planGasDrip(DEFAULT_GAS_DRIP_POLICY, {
  balanceWei: 0n,
  drippedTodayWei: 20_000_000_000_000_000n,
})
check('gas drip stops at the daily cap', exhausted.kind === 'skip' && exhausted.reason === 'dailyCapReached', exhausted)
const dust = planGasDrip(DEFAULT_GAS_DRIP_POLICY, { balanceWei: 4_999_000_000_000_000n, drippedTodayWei: 0n })
check('gas drip refuses dust', dust.kind === 'skip' && dust.reason === 'belowMinimum', dust)
const disabled = planGasDrip({ ...DEFAULT_GAS_DRIP_POLICY, dailyCapWei: 0n }, { balanceWei: 0n, drippedTodayWei: 0n })
check('gas drip disabled by zero policy', disabled.kind === 'skip' && disabled.reason === 'policyDisabled', disabled)
const arrival = planArrivalGas({ policy: DEFAULT_GAS_DRIP_POLICY, balanceWei: 0n, drippedTodayWei: 0n })
check(
  'arrival gas helper matches planner',
  arrival.kind === 'drip' && arrival.amountWei === 5_000_000_000_000_000n,
  arrival,
)

// --------------------------------------------------------------------------- state machine

async function stateChecks(): Promise<void> {
  const store = new InMemoryBotOpStore()
  const quoteId = h32('11')
  const idempotencyKey = 'user-1:bridge:1'

  const created = await createOp(store, {
    quoteId,
    kind: 'bridge',
    userId: 'user-1',
    idempotencyKey,
    fingerprint: fingerprintOf('bridge', { amountIn: 1n, token: 'a' }),
  })
  check('operation starts quoted', created.status === 'quoted' && created.attempts === 0)

  const replay = await createOp(store, {
    quoteId: h32('22'),
    kind: 'bridge',
    userId: 'user-1',
    idempotencyKey,
    fingerprint: fingerprintOf('bridge', { amountIn: 2n, token: 'b' }),
  })
  check('idempotency key returns the original operation', replay.quoteId === created.quoteId)

  const otherTerms = fingerprintOf('bridge', { amountIn: 99n, token: 'a' })
  check('fingerprints differ when terms differ', otherTerms !== created.fingerprint)

  await checkThrows(
    'confirming a quoted operation is rejected',
    () => markConfirmed(store, quoteId),
    'illegal transition',
  )

  const txHash = h32('33')
  const submitted = await markSubmitted(store, quoteId, txHash)
  check('submitted records the source hash', submitted.status === 'submitted' && submitted.sourceTxHash === txHash)

  const again = await markSubmitted(store, quoteId, txHash)
  check('re-marking the same hash is a no-op', again.attempts === submitted.attempts)

  await checkThrows(
    'a different source hash is rejected',
    () => markSubmitted(store, quoteId, h32('44')),
    'already set',
  )

  await markPending(store, quoteId, 'broadcast seen')
  await markReview(store, quoteId, 'ambiguous receipt')
  const confirmed = await markConfirmed(store, quoteId, { botPayoutRef: h32('55') })
  check('confirmed is terminal and records the payout', confirmed.status === 'confirmed' && confirmed.botPayoutRef !== null)
  await checkThrows('confirmed cannot regress', () => markPending(store, quoteId), 'illegal transition')

  const failedId = h32('66')
  await createOp(store, {
    quoteId: failedId,
    kind: 'swap',
    userId: 'user-2',
    idempotencyKey: 'user-2:swap:1',
    fingerprint: fingerprintOf('swap', { amountIn: 1n }),
  })
  const failed = await markFailed(store, failedId, 'quote expired')
  check('failed operations are recorded', failed.status === 'failed' && failed.note === 'quote expired')

  check('listByStatus filters', (await store.listByStatus('confirmed')).length === 1)
  await checkThrows(
    'unknown quote ids are rejected',
    () => store.update(h32('77'), { attempts: 1 }),
    'unknown',
  )
}

// --------------------------------------------------------------------------- serialization

function serializationChecks(): void {
  const rawBridge = serializeQuote(bridgeQuote as BridgeQuote)
  const roundTripped = deserializeBridgeQuote(rawBridge)
  check('bridge quote round-trips without losing bigints', JSON.stringify(roundTripped, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)) === JSON.stringify(bridgeQuote, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))
  check('serialized values are strings', Object.values(rawBridge).every((value) => typeof value === 'string'))

  const rawSwap = serializeQuote(swapQuote as SwapQuote)
  const swapRoundTrip = deserializeSwapQuote(rawSwap)
  check('swap quote round-trips', swapRoundTrip.amountOut === swapQuote.amountOut && swapRoundTrip.tokenIn === NATIVE)
}

async function main(): Promise<void> {
  serializationChecks()
  await stateChecks()

  console.log(`\n${checks - failures.length}/${checks} module checks passed`)
  if (failures.length > 0) {
    console.error(`FAILED: ${failures.join(', ')}`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
