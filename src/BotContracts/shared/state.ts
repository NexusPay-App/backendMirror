// Operation tracking for BotContracts.
//
// The same discipline as `src/services/botchainTransfers.ts`, made explicit here:
//   - one record per signed quote, keyed by the quote id (the EIP-712 struct hash)
//   - one record per idempotency key, so a retried request cannot create a second operation
//   - a declared transition table, so a reconciler cannot resurrect a settled operation
//   - the source transaction hash is persisted before status moves forward
//
// The store is async so the in-memory implementation can be swapped for Mongo or Redis without
// touching the operators. The unique indexes the database must enforce are exactly
// `quoteId` and `idempotencyKey`.

import { keccak256, stringToHex } from 'viem'
import type { Hex } from 'viem'
import type { BotOpKind, BotOpRecord, BotOpStatus } from './types'

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface InsertResult {
  ok: boolean
  existing?: BotOpRecord
  conflict?: 'quoteId' | 'idempotencyKey'
}

export interface BotOpStore {
  insert(record: BotOpRecord): Promise<InsertResult>
  get(quoteId: Hex): Promise<BotOpRecord | null>
  getByIdempotencyKey(idempotencyKey: string): Promise<BotOpRecord | null>
  update(quoteId: Hex, patch: Partial<BotOpRecord>): Promise<BotOpRecord>
  listByStatus(status: BotOpStatus): Promise<BotOpRecord[]>
}

export class InMemoryBotOpStore implements BotOpStore {
  private readonly byQuoteId = new Map<string, BotOpRecord>()
  private readonly byIdempotencyKey = new Map<string, BotOpRecord>()

  async insert(record: BotOpRecord): Promise<InsertResult> {
    const byKey = this.byIdempotencyKey.get(record.idempotencyKey)
    if (byKey) {
      return { ok: false, conflict: 'idempotencyKey', existing: byKey }
    }
    const byQuote = this.byQuoteId.get(record.quoteId)
    if (byQuote) {
      return { ok: false, conflict: 'quoteId', existing: byQuote }
    }
    this.byQuoteId.set(record.quoteId, record)
    this.byIdempotencyKey.set(record.idempotencyKey, record)
    return { ok: true }
  }

  async get(quoteId: Hex): Promise<BotOpRecord | null> {
    return this.byQuoteId.get(quoteId) ?? null
  }

  async getByIdempotencyKey(idempotencyKey: string): Promise<BotOpRecord | null> {
    return this.byIdempotencyKey.get(idempotencyKey) ?? null
  }

  async update(quoteId: Hex, patch: Partial<BotOpRecord>): Promise<BotOpRecord> {
    const current = this.byQuoteId.get(quoteId)
    if (!current) throw new Error(`BotOpStore: unknown quoteId ${quoteId}`)
    if (patch.quoteId && patch.quoteId !== current.quoteId) {
      throw new Error('BotOpStore: quoteId is immutable')
    }
    if (patch.idempotencyKey && patch.idempotencyKey !== current.idempotencyKey) {
      throw new Error('BotOpStore: idempotencyKey is immutable')
    }
    const next: BotOpRecord = { ...current, ...patch, updatedAt: nowSeconds() }
    this.byQuoteId.set(quoteId, next)
    return next
  }

  async listByStatus(status: BotOpStatus): Promise<BotOpRecord[]> {
    return [...this.byQuoteId.values()].filter((record) => record.status === status)
  }
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

const TRANSITIONS: Record<BotOpStatus, readonly BotOpStatus[]> = {
  quoted: ['submitted', 'failed'],
  submitted: ['pending', 'review', 'confirmed', 'failed'],
  pending: ['review', 'confirmed', 'failed'],
  review: ['pending', 'confirmed', 'failed'],
  confirmed: [],
  failed: [],
}

export function assertTransition(from: BotOpStatus, to: BotOpStatus): void {
  if (from === to) return
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(`BotOpStore: illegal transition ${from} -> ${to}`)
  }
}

async function transition(
  store: BotOpStore,
  quoteId: Hex,
  patch: Partial<BotOpRecord> & { status: BotOpStatus },
): Promise<BotOpRecord> {
  const current = await store.get(quoteId)
  if (!current) throw new Error(`BotOpStore: unknown quoteId ${quoteId}`)
  assertTransition(current.status, patch.status)
  return store.update(quoteId, patch)
}

// ---------------------------------------------------------------------------
// Lifecycle helpers
// ---------------------------------------------------------------------------

export interface CreateOpInput {
  quoteId: Hex
  kind: BotOpKind
  userId: string
  idempotencyKey: string
  fingerprint: Hex
  note?: string | null
}

export async function createOp(store: BotOpStore, input: CreateOpInput): Promise<BotOpRecord> {
  const existing = await store.getByIdempotencyKey(input.idempotencyKey)
  if (existing) return existing

  const now = nowSeconds()
  const record: BotOpRecord = {
    quoteId: input.quoteId,
    kind: input.kind,
    userId: input.userId,
    idempotencyKey: input.idempotencyKey,
    fingerprint: input.fingerprint,
    status: 'quoted',
    sourceTxHash: null,
    destTxHash: null,
    botPayoutRef: null,
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    note: input.note ?? null,
  }

  const result = await store.insert(record)
  if (!result.ok && result.existing) return result.existing
  if (!result.ok) throw new Error(`BotOpStore: insert failed (${result.conflict ?? 'unknown'})`)
  return record
}

/// Persist the transaction hash and move to `submitted`. A retry with the same hash is a no-op.
export async function markSubmitted(
  store: BotOpStore,
  quoteId: Hex,
  sourceTxHash: Hex,
): Promise<BotOpRecord> {
  const current = await store.get(quoteId)
  if (!current) throw new Error(`BotOpStore: unknown quoteId ${quoteId}`)
  if (current.sourceTxHash && current.sourceTxHash !== sourceTxHash) {
    throw new Error('BotOpStore: sourceTxHash already set to a different transaction')
  }
  if (current.sourceTxHash === sourceTxHash && current.status !== 'quoted') return current
  return transition(store, quoteId, {
    status: 'submitted',
    sourceTxHash,
    attempts: current.attempts + 1,
  })
}

export async function markPending(store: BotOpStore, quoteId: Hex, note?: string): Promise<BotOpRecord> {
  return transition(store, quoteId, { status: 'pending', note: note ?? null })
}

/// Ambiguous outcome: the operation was broadcast but the result is not known.
export async function markReview(store: BotOpStore, quoteId: Hex, note: string): Promise<BotOpRecord> {
  return transition(store, quoteId, { status: 'review', note })
}

export async function markConfirmed(
  store: BotOpStore,
  quoteId: Hex,
  settlement: { destTxHash?: Hex | null; botPayoutRef?: Hex | null; note?: string } = {},
): Promise<BotOpRecord> {
  return transition(store, quoteId, {
    status: 'confirmed',
    destTxHash: settlement.destTxHash ?? null,
    botPayoutRef: settlement.botPayoutRef ?? null,
    note: settlement.note ?? null,
  })
}

export async function markFailed(store: BotOpStore, quoteId: Hex, note: string): Promise<BotOpRecord> {
  return transition(store, quoteId, { status: 'failed', note })
}

// ---------------------------------------------------------------------------
// Fingerprint
// ---------------------------------------------------------------------------

/// Stable hash of the economic terms of an operation.
/// Two requests that differ in amount, token, destination or deadline produce different
/// fingerprints, so a client cannot reuse an idempotency key to settle different terms.
export function fingerprintOf(kind: BotOpKind, terms: Record<string, string | bigint>): Hex {
  const canonical = Object.keys(terms)
    .sort()
    .map((key) => {
      const value = terms[key]
      return `${key}=${typeof value === 'bigint' ? value.toString() : value}`
    })
    .join('&')
  return keccak256(stringToHex(`${kind}|${canonical}`))
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}
