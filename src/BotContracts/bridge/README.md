# BotBridgeHub

Bridge from Arbitrum to BOT Chain: the asset is escrowed on Arbitrum, an operator releases the BOT
payout from inventory, and the BOT transaction hash is anchored on chain.

There is no native Arbitrum ↔ BOT Chain bridge to call. This is a trusted operator model — no light
client, no message passing, no BOT state verification on Arbitrum.

## Lifecycle

1. Backend derives the user's BOT smart account with `walletProvisioning` and calls
   `buildBridgeQuote`. `destAccount` is that derived account, never a client-supplied value.
2. `bridgePreflight` checks expiry, fee range, destination chain, destination account, trader and
   arrival gas. A quote with any issue is not shown to the user.
3. Broker signs with `signBridge` — EIP-712, domain name `NexusPay BotBridge`, version `1`,
   `chainId` of the chain the hub lives on, `verifyingContract` = hub address. `quoteId` is the
   struct hash, so the quote can be indexed before it is signed.
4. User's Arbitrum smart account approves the hub and calls `deposit(quote, signature)`.
5. Operator sends the BOT payout from inventory to `quote.destAccount`, then calls
   `release(quoteId, botPayoutRef)` with the BOT transaction hash.
6. If the window closes without a release, the depositor calls `refund(quoteId)` and gets the asset
   back. After release, the owner sweeps the released asset to treasury with `sweepReleased`.

## Contract API

| Function | Caller | Purpose |
| --- | --- | --- |
| `deposit(quote, signature)` | trader | Lock the asset against a signed quote |
| `release(quoteId, botPayoutRef)` | operator | Anchor the BOT payout, mark the escrow settled |
| `refund(quoteId)` | depositor | Reclaim the asset after `releaseDeadline` |
| `sweepReleased(quoteId, to)` | owner | Move settled inventory to treasury |
| `quoteIdOf(quote)` | anyone | EIP-712 struct hash, also the replay key |
| `quoteDigest(quote)` | anyone | Digest the broker signs |
| `setBroker` / `setOperator` | owner | Rotate the quote signer / release key |
| `pause()` / `unpause()` | owner | Block deposits and releases; refunds keep working |
| `botChainId` | anyone | Destination chain the hub is bound to |

## Guarantees

- **The hub cannot keep a deposit.** After `releaseDeadline`, `refund` always succeeds unless the
  escrow was already released.
- **No replay.** `quoteId` is the struct hash and each id is single use.
- **No third-party settlement.** `deposit` requires `msg.sender == quote.trader`.
- **Exact amounts.** The asset amount comes from the quote, never from a balance difference.
- **Release and refund are mutually exclusive.** `release` is impossible after `releaseDeadline`.
- **Pause cannot trap funds.** Pausing blocks deposits and releases; `refund` is unaffected.
- **One payout, one escrow.** `release` rejects a zero `botPayoutRef` or one already used by another
  quote, so two deposits cannot hide behind one BOT transaction.
- **Stored terms cannot truncate.** Expiries beyond the packed `uint64` window and `feeBps` above
  10000 are rejected at deposit.
- **Bound to one destination.** `botChainId` is fixed in the constructor and checked on every
  deposit, so a testnet hub cannot settle mainnet quotes.

## Trust model

The BOT payout is an operator action from platform inventory. The contract makes the operator
accountable — a release is only possible inside the settlement window, every payout leaves a
reference on chain, and the user always has an exit — but it does not make the operator trustless.

## Arrival gas

BOT is self-funded for gas, so an account arriving with zero BOT cannot transact. `planArrivalGas`
returns either a cap-bounded drip decision or an explicit `gasBlocked` pre-flight issue. A bridge
quote must not be issued while that issue is unresolved.

## Tests

`test/BotBridgeHub.t.sol` covers 37 cases, fuzz included: signature binding to chain, contract and
terms; replay; expiry; deposit/release/refund boundaries; sweep isolation; high-s and malformed
signatures; fuzzed amounts.
