# BOT Chain implementation and staging runbook

Status (15 October 2026): funded testnet payments and merchant settlement passed. Mainnet remains disabled. See [current readiness and evidence](BOTCHAIN_TECHNICAL_READINESS.md) for completed work and release gates.

## Accounts and gas

Thirdweb 5 remains the SDK. Its custom-chain, prepared transaction, user-operation creation, signing, and bundler APIs are used. This does **not** imply Thirdweb-managed bundler/paymaster support for BOT.

Live read-only probes on 8 October 2026 verified both chain IDs, BOT bundlers, EntryPoint v0.7, the SimpleAccount factory, and USDT/WBOT decimals and symbols. Thirdweb's default v0.7 factory returned empty bytecode on both networks. Evidence: `botchain-rpc-probe-2026-10-08.json` and `botchain-adapter-probe-2026-10-08.json`. The factory implementation’s EntryPoint binding, real address prediction, factory calldata and nonce adapter also passed read-only checks.

| Network | Chain ID | RPC | Bundler | Explorer |
|---|---:|---|---|---|
| Mainnet | 677 | https://rpc.botchain.ai | https://bundler.botchain.ai/rpc | https://scan.botchain.ai |
| Testnet | 968 | https://rpc.bohr.life | https://bundler.bohr.life/rpc | https://scan.bohr.life |

- EntryPoint: `0x0000000071727De22E5E9d8BAf0edAc6f37da032` (v0.7).
- Factory: `0xBC88d6012b3bf8426C2851d3798cEB5257658332`; `getAddress(owner, 0)` and `createAccount(owner, 0)`.
- Nonce: EntryPoint `getNonce(sender, 0)`, including undeployed accounts.
- Execution: SimpleAccount `execute(destination, value, data)`.
- Gas prices: `skandha_getGasPrice`; sponsorship is disabled. Fund the **smart account** with native BOT before sending. No owner-EOA fallback exists.
- Native BOT has no ERC-20 address. WBOT has 18 decimals; USDT has 6. Mainnet/testnet USDT contracts differ.
- Account records are additive in `chainaccounts`, indexed by owner/type/chain. Existing user/business `walletAddress` fields are not rewritten.
- This is a single-owner user/business payment account. It does not replace or claim the multisignature treasury's recovery/approval capabilities. BOT treasury/M-Pesa settlement remains unavailable.

## Local checks

Use the pinned Node/npm versions, then `npm ci`, `npm run build`, `npm run lint`, and `npm test`. These checks do not send payments. `npm run check:botchain` probes public services read-only. After building, `node tools/verify-bot-adapter.mjs` checks real address prediction and nonce retrieval using a public fixture owner, without a signing key.

Tests cover integer precision, wrong-account debits, unsupported authenticator codes, operation failure, wrong token/amount logs, bundle isolation, duplicate retries, ambiguous submission, encrypted key integrity, authenticated callback persistence, middleware ordering, and disabled capabilities. They are not a substitute for a funded testnet test.

## Enable staging

1. Use a staging MongoDB and Redis, a Thirdweb project secret, JWT secret, and a separately backed-up wallet encryption key. Copy `.env.example`; never use production provider credentials for a local trial.
2. Set `BOTCHAIN_TESTNET_ENABLED=true`. Start the backend. It creates indexes only for the new BOT collections. Verify existing users retain their legacy addresses. `GET /api/botchain/botchain-testnet/account` predicts and records the separate BOT address.
3. Fund that predicted address with test BOT using the official faucet and test USDT using the BOT team's test token distribution. Keep mainnet flags false.
4. Set `BOTCHAIN_TESTNET_TRANSFERS_ENABLED=true` after verifying funding. BOT Chain is served through the same screens as every other chain — select it in the home chain selector, the `/crypto` send form, `/pay` merchant payment, and `/receive` (there is no dedicated BOT page; `/botchain` redirects to `/home`). Test native BOT, WBOT, USDT, phone/email resolution, and merchant USDT payments.
5. Validate exact token amounts, insufficient gas/token errors, deployment of a previously undeployed account, nonce progression, duplicate requests, request timeouts, failed UserOperations, and balances after three canonical block confirmations.
6. Run a persistent worker with `RUN_PAYMENT_WORKERS=true` to reconcile pending BOT records and run the deposit indexer. The serverless handler never launches workers. UI polling can also reconcile the signed-in user's submitted payments.
7. Set `BOTCHAIN_TESTNET_DEPOSIT_INDEXING_ENABLED=true` to index external deposits; verify by receiving a testnet transfer to a registered account and confirming it appears via `?direction=incoming`.
8. Record transaction hashes, provider responses, and operator sign-off before enabling mainnet flags. No mainnet deployment or fund transfer is part of the implementation checks.

## API and replay behavior

Public capabilities: `GET /api/botchain/networks`. Authenticated routes: `/:network/account`, `/:network/balances`, `GET/POST /:network/transfers`, and `GET /:network/transfers/:id`, all under `/api/botchain`.

POST requires a decimal-string amount, supported `tokenSymbol`, recipient identifier or `merchantId`, account password, and a stable `Idempotency-Key` header (16–100 URL-safe characters). Merchant payments accept USDT. An optional sender address must match the authenticated account on the selected network.

The operation hash is persisted before broadcast. A timeout never authorizes a replacement transfer. A unique partial index permits only one unresolved debit per account/chain because the account uses nonce key 0. Confirmed or failed operations release that constraint; unresolved records remain locked. Persisted hashes enable reconciliation after a restart.

Confirmation requires a canonical transaction receipt, the exact successful EntryPoint UserOperation event, at least three confirmations, and an exact token Transfer event within that operation for ERC-20 payments. A transaction hash alone is not a success signal. `review`/`pending` must never be displayed as paid.

History currently contains NexusPay-initiated payments plus indexed external deposits (see below). The 9 October 2026 capability probe (`botchain-capability-probe-2026-10-09.json`) verified historical `eth_getLogs` over a 1000-block range on both networks, 10-request bursts without rate-limit errors, and a mainnet WebSocket `newHeads` subscribe/reconnect cycle. Testnet WebSocket URL is not documented; set `BOTCHAIN_TESTNET_WS_URL` to probe it.

## External deposits

The deposit indexer records incoming BOT/USDT/WBOT transfers to registered BOT accounts in the existing `bottransfers` collection (`direction: 'incoming'`), so one ledger holds the whole history. It is off until `${NETWORK}_DEPOSIT_INDEXING_ENABLED=true` is set on an enabled network.

- Confirmation depth: only blocks with `BOTCHAIN_CONFIRMATIONS` (default 3) confirmations are indexed, and records are created `confirmed` — they never enter the one-active-debit lock index.
- Cursors: per-network and per-source (token logs / native transactions) in Redis, with a durable fallback watermark derived from the newest indexed database record plus an optional `${NETWORK}_DEPOSIT_START_BLOCK` floor. A lost cursor rescans instead of skipping; duplicates are rejected by a deterministic `deposit:<chainId>:<txHash>:<logIndex>` idempotency key.
- Beneficiaries resolve through `chainaccounts`; business accounts credit the owning user and carry the merchant ID. An orphaned business account is skipped, never guessed.
- Tuning: `${NETWORK}_DEPOSIT_TOKEN_RANGE` (default 1000 blocks/cycle), `${NETWORK}_DEPOSIT_NATIVE_RANGE` (default 50), `${NETWORK}_DEPOSIT_TOKEN_LOOKBACK` (5000) and `${NETWORK}_DEPOSIT_NATIVE_LOOKBACK` (200) for the initial cursor.
- The worker runs only with `RUN_PAYMENT_WORKERS=true`; a cycle failure logs and retains the cursor. Native deposits are detected by scanning full blocks for value transfers to watched accounts — this is RPC-heavy on busy ranges; tune the range if provider limits appear.

`GET /api/botchain/:network/transfers?direction=incoming|outgoing` filters history; the default returns both.

## Rollback and unresolved operations

Disable transfer flags first; retain read access and the reconciler. Do not delete `bottransfers`, `chainaccounts`, or unique indexes. Do not erase an unknown operation to unlock an account. Reconcile its saved hash and EntryPoint nonce, then perform a reviewed recovery if the provider cannot establish the outcome. Never resubmit with a fresh idempotency key while the original may execute.

Do not restore an old build that cannot read encrypted keys after encryption migration. Use a build containing the decryption reader and disable new functionality through flags. Back up MongoDB and the encryption key separately before running the opt-in key migration.

## Other release requirements

- Keep `ENABLE_RECLAIM=false` until rotated credentials and provider-backed verification have been validated (see `DEPENDENCY_SECURITY_REVIEW.md`). Rotate the Reclaim application secret previously exposed in the old frontend. Set the new secret only on the backend and allowlist provider IDs. The server creates sessions and verifies proofs against their provider version, user context, expiry, and single-use session before recording verified results.
- Google sign-in remains available. The former Google Authenticator payment branch never verified a code; payment authorization now requires an actual account password. Passwordless Google users need a supported password/step-up setup before making payments. Implementing TOTP is a separate credential-enrollment and recovery workflow, not accepting arbitrary codes.
- Configure M-Pesa callback URLs with the shared callback token and run a durable worker before setting `ENABLE_MPESA=true`. Inbox acknowledgement occurs after MongoDB persistence. Processing records left by crashes are retained for review. The forwarder awaits backend acknowledgement. Validate this with the provider sandbox before production cutover; token authentication is not a replacement for provider transaction reconciliation.
- BOT M-Pesa, treasury funding/approval policy, sponsorship/paymaster, BDEX swaps, and bridging are not enabled. No unverified USDT is substituted for USDC in existing fiat settlement.
- `tools/migrate-wallet-keys.ts` defaults to counts-only with an explicit `MONGODB_MIGRATION_URI`. Back up first; run with `--apply` only in the intended environment. The migration uses compare-and-set updates and is resumable; it never prints keys. Existing plaintext keys remain readable until migration; new production writes require encryption configuration.

## Sources

[Thirdweb smart wallets](https://portal.thirdweb.com/typescript/v5/smartWallet), [BOT account abstraction](https://dev-docs.botchain.ai/docs/Account-Abstraction/network-and-endpoints/), [BOT account contracts](https://dev-docs.botchain.ai/docs/Account-Abstraction/erc-4337/smart-accounts/), [Circle USDC contracts](https://developers.circle.com/stablecoins/usdc-contract-addresses), [Tether contracts](https://tether.to/en/supported-protocols/), [Reclaim server/client flow](https://docs.reclaimprotocol.org/manual/js-sdk/usage).

## Environments, schema and operator checks still required

Use MongoDB supporting partial indexes with `$in` expressions (MongoDB 6.0 or newer), and verify the actual staging/production version and backups before migration. No live user/business database has been inspected or migrated. The new collections/indexes must be validated against a staging database with representative existing accounts.

The modernization is not a complete rewrite of legacy fiat accounting. M-Pesa fee/settlement paths still contain floating-point arithmetic and require a dedicated decimal-ledger migration and sandbox reconciliation before release. Legacy OTP enrollment/recovery and every administrative/payment route need a complete authorization regression pass. Passwordless Google users cannot use the password-required debit endpoints until a real step-up setup flow is implemented.

Historical Markdown files and operational scripts predate this runbook. They are not release evidence. Do not run initialization, treasury transfer, cleanup, or production-provider scripts as unit tests. `tools/migrate-wallet-keys.ts` needs an explicit migration URI; `npx tsx tools/migrate-wallet-keys.ts` performs counts only and `--apply` opts into encrypted writes after backup. Pending payment collections must survive redeployments.
