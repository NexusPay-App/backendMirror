# BotContracts

Escrow contracts and operator tooling for BOT Chain. `BotBridgeHub` escrows assets on the chain the
user deposits from (Arbitrum) and settles the payout on BOT Chain through an operator release.
`BotSwapEscrow` settles OTC swaps against platform inventory directly on BOT Chain.

The TypeScript layer builds, signs and encodes quotes. It holds no keys beyond the broker account
passed in and never broadcasts a transaction.

## Networks

| Network | Chain ID | RPC | Explorer | USDT |
| --- | --- | --- | --- | --- |
| BOT Chain | 677 | `https://rpc.botchain.ai` | `https://scan.botchain.ai` | `0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C` |
| BOT Chain Testnet | 968 | `https://rpc.bohr.life` | `https://scan.bohr.life` | `0x75edC9335175Fc0552D51D48439F229c10420fe3` |
| Arbitrum One | 42161 | `https://arb1.arbitrum.io/rpc` | `https://arbiscan.io` | — |
| Arbitrum Sepolia | 421614 | `https://sepolia-rollup.arbitrum.io/rpc` | `https://sepolia.arbiscan.io` | — |

BOT Chain bundler endpoints: `https://bundler.botchain.ai/rpc/` (677) and
`https://bundler.bohr.life/rpc` (968). On testnet, EntryPoint
`0x0000000071727De22E5E9d8BAf0edAc6f37da032` and smart account factory
`0xBC88d6012b3bf8426C2851d3798cEB5257658332` both have code; `deploy/deploy.ts check` verifies this.

The RPCs are overridable: `BOT_TESTNET_RPC_URL` and `ARBITRUM_SEPOLIA_RPC_URL` are read by
`deploy/deploy.ts`, so a private endpoint can be substituted without changing code. The BOT testnet
public RPC is rate-limited and intermittently slow; retry reads and avoid tight polling loops
against it.

### Live testnet deployment

| Contract | Chain | Address |
| --- | --- | --- |
| `BotBridgeHub` | Arbitrum Sepolia (421614) | `0xAFC7fAE6d192EfDe3f66D6a8Eff1A255cE59ccA0` |
| `BotSwapEscrow` | BOT Chain Testnet (968) | `0x3037Df7A0c417FC9c5ecaB6aaeb610Ba25C798f0` |

The deployment uses a 120 second `settlementWindow` so the refund path can be exercised; production
uses 3600. Bridge quotes on this deployment use `destChainId: 968n` and are signed with domain
`chainId` 421614. The Arbitrum-side asset is a mintable test ERC-20
(`0x8E30278Fb74D49c2A0ede0590a5e5cbeB8580D8d`) because the hub only escrows ERC-20 and no Sepolia
test token is faucet-available from this environment.

`testnet-funding-status.md` lists every deposit, release, refund and swap with its explorer link;
`deploy/deployments/testnet-e2e.json` holds the machine-readable record.

## Layout

```
common/BotContractBase.sol   EIP-712 domain, two-step ownership, pause, reentrancy guard, checked transfers
common/IERC20.sol            minimal ERC-20 interface

bridge/BotBridgeHub.sol      Arbitrum escrow for Arbitrum -> BOT Chain intents
bridge/operator.ts           quote, sign, verify, calldata, tracking, arrival gas

swap/BotSwapEscrow.sol       OTC settlement against platform inventory on BOT Chain
swap/operator.ts             quote, sign, verify, calldata, tracking

shared/signing.ts            EIP-712 types, struct hash = quoteId, digest, sign, recover
shared/state.ts              operation store, transition table, fingerprint
shared/gasDrip.ts            native-BOT top-up policy for wallets arriving from Arbitrum
shared/types.ts              quote and operation types, BOT constants

deploy/deploy.ts             testnet pre-flight and broadcast
test/                        Foundry suite and TypeScript end-to-end checks
```

The contracts import only from inside this folder, so they compile with `solc` alone:

```
solc --bin --optimize bridge/BotBridgeHub.sol swap/BotSwapEscrow.sol
```

## Build and test

Foundry (`forge`, `anvil`) must be on `PATH`. The suite vendors a minimal `Vm` cheatcode interface
instead of forge-std, so there are no submodules to install. Build output and cache go to
`/tmp` (see `foundry.toml`).

```
forge test                        # 74 EVM tests
npx tsx test/e2e/modules.e2e.ts   # 41 checks on the shared TypeScript modules
npx tsx test/e2e/chain.e2e.ts     # 18 checks against anvil: deploy, settle, refund, replay
npx tsx test/e2e/testnet.e2e.ts deploy|prepare|bridge|refund|swap   # live testnets, writes hashes
```

| Suite | Coverage |
| --- | --- |
| `test/BotBridgeHub.t.sol` | signature binding to chain, contract and terms; replay; expiry; deposit/release/refund boundaries; sweep isolation; high-s and malformed signatures; fuzzed amounts |
| `test/BotSwapEscrow.t.sol` | both directions including native BOT; replay; exact `msg.value`; trader/recipient binding; inventory shortfall; no-return, false-return, fee-on-transfer and reentrant tokens; fuzzed conservation |
| `test/BotContractBase.t.sol` | domain separator, low-s recovery, two-step ownership, pause, fee bound |
| `test/e2e/modules.e2e.ts` | quote construction, pre-flight codes, gas-drip caps, operation state machine, serialization |
| `test/e2e/chain.e2e.ts` | on-chain `quoteDigest` / `quoteIdOf` equal the TypeScript values, then real deposit, release, refund and swap calldata from the operator builders |
| `test/e2e/testnet.e2e.ts` | live deployment, funding and full flow on BOT Chain Testnet and Arbitrum Sepolia, with every hash persisted to `deploy/deployments/testnet-e2e.json` |

`chain.e2e.ts` is the drift detector: it compares the deployed contract's digest and struct hash with
`shared/signing.ts` and settles quotes built by `bridge/operator.ts` and `swap/operator.ts`.

## Deploy

`deploy/deploy.ts` splits the system the way it runs in production: the hub on the chain users
deposit from, bound to the destination BOT chain, and the escrow on BOT Chain.

```
npx tsx deploy/deploy.ts check    # read-only: RPCs, USDT metadata, code, bytecode sizes
npx tsx deploy/deploy.ts deploy   # broadcast, needs DEPLOYER_PRIVATE_KEY
```

`check` verifies chain ids (968 and 421614), testnet USDT metadata (`Tether USD` / `USDT` / 6
decimals), EntryPoint and factory code, and contract sizes: 7,849 and 5,565 bytes of runtime against
the 24,576-byte EIP-170 limit.

Broadcast inputs:

| Variable | Default | Meaning |
| --- | --- | --- |
| `DEPLOYER_PRIVATE_KEY` | required | Key that pays for both deployments |
| `OWNER_ADDRESS` | deployer | Contract owner; use the platform multisig in production |
| `BROKER_ADDRESS` | deployer | Quote signer |
| `OPERATOR_ADDRESS` | deployer | Release key on the hub |
| `BOT_CHAIN_ID` | `968` | Destination chain recorded in the hub |
| `SETTLEMENT_WINDOW` | `3600` | Seconds after `expiresAt` in which release is allowed |

After the receipts, the script reads `owner`, `broker`, `operator` and `botChainId` back off the
deployed contracts and fails on any mismatch, then writes `deploy/deployments/testnet.json`. The
manifest holds the live testnet deployment.

Gas for testnet deploys, measured from local runs: 1,826,732 for the hub and 1,309,086 for the
escrow. Testnet BOT comes from `https://faucet.bohr.life/basic` (10 tBOT per 24h, CAPTCHA), which
covers the escrow deploy; Arbitrum Sepolia ETH comes from any Sepolia faucet.

Testnet quotes differ from mainnet only in two arguments: pass `destChainId: 968n` to
`buildBridgeQuote` and `expectedDestChainId: 968n` to `bridgePreflight`, and sign with the domain
`chainId` of the chain the hub lives on (421614). Defaults stay on mainnet.

## How the bridge works

`BotBridgeHub` locks the Arbitrum asset against a broker-signed quote that names the exact BOT
destination account. An operator then pays the BOT side from inventory and anchors the BOT
transaction hash on chain. The contract's guarantees are all about the Arbitrum side: single-use
signed quotes, exact amounts, the trader must be the caller, release only inside the settlement
window, and an unconditional refund for the depositor after that window.

The BOT payout itself is an operator action. This is a trusted operator model, not a light client.

## How the swap works

`BotSwapEscrow` is OTC by design. No swap venue on BOT Chain is confirmed, so a pool would be an
unpriced market maker holding inventory it cannot hedge. Instead: quote a price, take the user's
asset, pay out from inventory, keep the spread — atomically, in one transaction. The user is never
left with funds waiting on an operator, and the platform never extends uncollateralised credit.

If a real BOT venue appears, the swap becomes a router call and this escrow is retired rather than
grown. `swap/operator.ts` composes calldata only, which keeps that switch cheap.

## Security properties

These are enforced by the contracts and covered by the test suite:

- Quotes are single use, keyed by the EIP-712 struct hash, and bound to chain, verifying contract
  and every term.
- `feeBps` is bounded at 10000 in both contracts, so the emitted audit value is always sane.
- Bridge expiries beyond the packed `uint64` settlement window are rejected at deposit instead of
  truncating silently.
- A BOT payout reference settles exactly one escrow: zero or reused references are rejected.
- `pause` blocks new business but never refunds or withdrawals of user funds.
- Zero-amount paths revert consistently, including `withdrawInventory`.

## Gas

solc 0.8.28, optimizer 200 runs, measured with `forge test --gas-report`.

| Function | Min | Avg | Max |
| --- | --- | --- | --- |
| `BotBridgeHub.deposit` | 29,260 | 265,333 | 279,899 |
| `BotBridgeHub.release` | 24,559 | 81,675 | 83,470 |
| `BotBridgeHub.refund` | 46,024 | 62,134 | 62,414 |
| `BotBridgeHub.sweepReleased` | 24,328 | 55,828 | 75,365 |
| `BotSwapEscrow.swap` | 29,320 | 83,501 | 169,617 |
| `BotSwapEscrow.withdrawInventory` | 24,420 | 51,362 | 66,708 |

`deposit` is dominated by one new escrow slot plus the token pull; `swap` by the replay slot and the
inventory transfer. Neither loops or grows with history.

## Before mainnet

1. Owner is the platform multisig, not an EOA.
2. Broker and operator are separate keys, and neither is the owner.
3. `SETTLEMENT_WINDOW` is set deliberately and matches `DEFAULT_SETTLEMENT_WINDOW_SECONDS`.
4. Swap inventory is funded before the first quote is issued, including native BOT for USDT → BOT.
5. Arrival gas is wired to a treasury drip, or bridged wallets arrive with zero BOT and cannot
   transact. The planner exists; the drip is an operational job.
6. Each release records `botPayoutRef`, so every bridge has an on-chain anchor on both chains.

## Open items

- Whether BOT Chain will expose a canonical USDT bridge or a DEX is unverified. Either would change
  the swap adapter and let the bridge stop being operator-settled.
- `destAccount` must be derived by `walletProvisioning`, never supplied by a client.
  `bridgePreflight` compares it against the expected account; that comparison is the guard, not the
  contract.
- Earn on BOT Chain is out of scope for this folder.
