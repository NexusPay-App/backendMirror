# BotSwapEscrow

OTC swap settlement on BOT Chain. The platform quotes a price against its own inventory, the user
settles atomically against the escrow, and the spread stays in inventory.

There is no pool and no AMM: no swap venue on BOT Chain is confirmed, so no routing is assumed. If a
venue appears, this contract is replaced by a router call rather than extended.

## Supported directions

| Direction | `tokenIn` | `tokenOut` |
| --- | --- | --- |
| Sell USDT for BOT | USDT (ERC-20) | `NATIVE` (`0x0`) |
| Sell BOT for USDT | `NATIVE` (`0x0`) | USDT (ERC-20) |

Native BOT is represented by the zero address in both quote fields.

## Lifecycle

1. Backend prices against inventory and calls `buildSwapQuote`. `amountOut` is already net of the
   spread, and `minOut` defaults to `amountOut`.
2. `swapPreflight` checks identical tokens, zero amounts, the floor, the fee range, expiry,
   trader/recipient binding, and inventory when `availableOut` is supplied. Any issue blocks the
   quote from being shown.
3. Broker signs with `signSwap` — EIP-712, domain name `NexusPay BotSwap`, version `1`, `chainId` of
   the BOT chain, `verifyingContract` = escrow address.
4. User approves the escrow for ERC-20 input (native input is `msg.value`) and calls
   `swap(quote, signature)`.
5. The contract marks the quote used, pulls the input, and pays `amountOut` from inventory in the
   same transaction. `SwapExecuted` carries `feeBps` so the spread can be reconciled off chain.

## Contract API

| Function | Caller | Purpose |
| --- | --- | --- |
| `swap(quote, signature)` | trader | Settle a signed quote atomically |
| `quoteIdOf(quote)` | anyone | EIP-712 struct hash, also the replay key |
| `quoteDigest(quote)` | anyone | Digest the broker signs |
| `inventory(token)` | anyone | Inventory held for a token (`NATIVE` for BOT) |
| `withdrawInventory(token, to, amount)` | owner | Move inventory out, native included |
| `setBroker(nextBroker)` | owner | Rotate the quote signer |
| `pause()` / `unpause()` | owner | Block new swaps; nothing is trapped |
| `transferOwnership` / `acceptOwnership` | owner | Two-step ownership transfer |
| `domainSeparator()` | anyone | EIP-712 domain separator |

## Guarantees

- **Atomic.** Both legs move or neither does. There is no deposit path, so user funds are never held
  by the contract.
- **Single use.** Each quote settles at most once, keyed by its struct hash.
- **Immutable terms.** `amountIn`, `amountOut`, `minOut`, `expiresAt`, `trader` and `recipient` are
  all inside the signed payload; the price cannot move after signing.
- **No third-party settlement.** `recipient` must equal `trader`, and the caller must be the trader.
- **No partial fills.** Insufficient inventory reverts instead of paying part of the quote.
- **Sane audit values.** `feeBps` above 10000 is rejected at swap time even if the signer misbehaves.
- **Checked transfers.** No-return tokens such as USDT, false-return tokens, and fee-on-transfer
  tokens are all rejected unless the exact amount arrives.
- **Reentrancy safe.** A reentrant token or native recipient cannot execute a second swap; the outer
  settlement still completes.
- **Pause cannot trap funds.** Pausing blocks new swaps only; nothing of the user's is ever held.

## Limits and parameters

| Parameter | Value | Notes |
| --- | --- | --- |
| Quote TTL | 120 seconds default | Stale quotes are a pricing risk; re-quote instead of extending |
| `feeBps` | 0–10000 | Signed; above range reverts |
| USDT decimals | 6 | Assumed by pricing, not enforced by the contract |

## Operations

- Fund ERC-20 inventory with a plain `transfer` to the escrow address.
- Fund native BOT inventory by sending BOT to the escrow address; `receive()` accepts it.
- Withdraw with `withdrawInventory(NATIVE, to, amount)` or the token address.
- Read `inventory(token)` before quoting; pass it to `swapPreflight` as `availableOut`.

## Tests

`test/BotSwapEscrow.t.sol` covers 25 cases, fuzz included: both directions with native and ERC-20
legs, replay, exact `msg.value`, trader/recipient binding, inventory shortfall, no-return /
false-return / fee-on-transfer tokens, reentrancy, and conservation of value.
