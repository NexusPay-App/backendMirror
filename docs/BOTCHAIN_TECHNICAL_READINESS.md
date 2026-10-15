# BOT Chain technical readiness — 15 October 2026

The public test deployment is https://nexuspayapp-ten.vercel.app. BOT Chain testnet (968) is enabled. **Mainnet (677) remains disabled; no mainnet launch or transfer is authorized by this readiness work.**

## Completed

- Retained Thirdweb 5 with BOT's ERC-4337 bundler and the existing SimpleAccount factory. NexusPay does not deploy a separate payment protocol contract; each user/business receives a chain-specific smart account. Thirdweb-managed gas sponsorship is not assumed. Users fund native test BOT for fees.
- Corrected home network selection so selecting BOT Chain follows through to the send screen and the dedicated BOT transfer API. Phone recipients resolve to their BOT account. Email punctuation is preserved.
- Added native gas and token balance checks, actionable payment failures, a MongoDB-backed payment-attempt limit, and server request IDs. Google-only accounts must set up a password before authorizing payments.
- Retained idempotency keys across uncertain outcomes. Competing requests cannot release an active preparation lock; ambiguous submissions are retained for reconciliation. The interface polls the recorded payment and only displays success after confirmed status.
- Added public BOT branding and both required links in the footer, plus `/ecosystem` with live network capabilities. The website does not claim a mainnet launch.
- Persisted OTP challenges and verified sessions in MongoDB. Codes are HMAC-hashed, expire after five minutes, allow at most five verification attempts, have a one-minute resend cooldown, and are purpose-bound. Account setup is also bound to the signed-in user. Only one concurrent verifier can consume a code.
- Corrected phone registration to create the account and session after successful OTP verification. It no longer consumes the code and then asks the user to log in again. Unverified secondary contact fields are not attached during registration. Delivery failures do not claim that an OTP was sent. Google initialization errors no longer block the phone form.
- Preserved the legacy `uniqueCode` business index by populating new merchants' compatibility field from their merchant ID. No existing user indexes or wallet addresses were rewritten.
- Updated Reclaim SDK to 5.8.3. Fresh production audits: backend 24 moderate, frontend 2 moderate; neither reports high/critical findings. Reclaim remains disabled. See the dependency security reviews for remaining transitive findings.
- Reinitialize the serverless database connection after an idle disconnect, sharing one reconnect across concurrent requests. A regression test covers reconnect, failure and recovery.
- Added a public deployment-health checker and a six-hour GitHub Actions schedule. It checks website links, MongoDB readiness, and testnet/mainnet capabilities. This does not replace payment monitoring.

## Evidence

| Check | Result |
| --- | --- |
| Backend build and lint | Passed |
| Backend unit/API tests | 54 tests passed across 14 suites |
| Frontend production build / TypeScript | Passed |
| Frontend lint | 0 errors, 10 existing warnings |
| Frontend unit tests | 13 passed |
| Desktop/mobile browser tests | 14 passed with mocked APIs, including signup success/delivery failure and payment lifecycle |
| Real MongoDB verification probe | Concurrent single consumption, guess limit, expiry, resend cooldown, owner/purpose binding, reconnect persistence and invalidation passed |
| Dependency trees | `npm ls --all` passed in both applications |
| RPC/bundler probe | Both networks passed read-only chain, contract, metadata and provider checks |
| Live deployed browser payment | 0.001 USDT to the QA phone recipient: HTTP 202 pending, then confirmed in the UI; authenticated fixture session preloaded |
| Funded testnet API acceptance | Native BOT, USDT, WBOT, merchant USDT, wrapping, duplicate-key reuse, password rejection and history passed |

Live browser receipt: [0.001 test USDT](https://scan.bohr.life/tx/0xab11826e2e922975646aa58a7faaa81289693055e31bc8778561fb2810a49c67). This validates the deployed password/payment flow; it does not validate SMS or OAuth login.

Evidence files: `live-browser-payment-2026-10-15.json`, `testnet-acceptance-2026-10-15.json`, `botchain-readiness-probe-2026-10-15.json`, `deployment-readiness-2026-10-15.json`, and each repository's `production-dependency-audit-2026-10-15.json`.

Funded testnet receipts:

- [0.01 BOT to a registered phone recipient](https://scan.bohr.life/tx/0xe1fa14b2cf9655a55890aa255ec2f4575ba9d46797ea2353776bdd69cd5addf5)
- [0.01 USDT to a registered phone recipient](https://scan.bohr.life/tx/0x6a213617b1a39efda800db64cc9d0f3d2495d2cc29a7254261e8c27e8101377f)
- [0.01 USDT merchant payment](https://scan.bohr.life/tx/0x315a33cd5d9007ddd5f23e8fa502a38153194927127abe50464c5a1794490a69)
- [Wrap 0.01 test BOT](https://scan.bohr.life/tx/0x09bdc461cff8a0a3803a6c7934512816f61c525a34cfc05c6728b5e9af6b7aa2)
- [0.001 WBOT to a registered phone recipient](https://scan.bohr.life/tx/0x4c47e5e585ab786f7dd4669fcf3f3362a3795db599b231fc6bd682327514f5f5)

These are controlled QA fixtures, not independent users or organic ecosystem usage. QA merchant `QA-BOT-20261015` shares the recipient fixture's test signing account and exists only in the development database. Do not use it on mainnet or count it as a distinct operator.

## Mainnet gates still open

1. **Real onboarding delivery:** SMS is disabled in the deployed environment. Configure and validate SMS delivery, Google-to-phone/password setup, and recovery with actual provider delivery. Browser mocks and durable-code tests do not prove delivery. Email delivery also requires a provider-backed check. Google OAuth must be tested by the account owner in the browser.
2. **Production key custody and recovery:** provision an isolated production database and secrets; rotate historically exposed credentials; back up and restore-test the encryption key and database; inspect and migrate legacy plaintext signing keys using the existing opt-in migration. The test database contains legacy QA keys. No blind migration using a different local encryption key was performed. The deployed sensitive secrets cannot be exported by the Vercel CLI.
3. **Durable background operation:** provision the existing reconciliation/deposit workers on a persistent host, then enable and verify deposit indexing. Vercel request handlers do not run background timers. User-triggered polling reconciles submitted payments now; RPC balances reflect incoming funds, but external deposit history is not promised while indexing is disabled. Validate restart recovery, incoming history and alerts before mainnet.
4. **Operational release check:** verify production credentials, rates/limits, backup restoration, unresolved-operation recovery, dependency exceptions, and mainnet funding. Run funded mainnet acceptance only after the user approves the cutover. Keep independent enable/read/transfer flags and the rollback procedure in the runbook.
5. **Ecosystem evidence after launch:** publish the truthful mainnet announcement, maintain five valid X posts in 30 days, and collect at least three genuine wallets and five legitimate core interactions within seven days. Demonstrate independent product operation and ongoing updates. Automated testnet receipts satisfy none of these mainnet adoption requirements.

M-Pesa, swaps/bridging, Reclaim verification, and sponsored gas are not enabled BOT payment features. Their provider validation remains separate. Legacy disabled fiat withdrawal OTP paths still need review before fiat enablement.

## Repeatable checks

Use Node 24.21.0 and npm 12.2.0. Build before running the storage probe.

```sh
npm run build
npm run lint
npm test
node tools/check-deployment.mjs
node tools/check-verification-storage.mjs --test-database
```

The storage probe requires `DEV_MONGO_URL` to differ from `PROD_MONGO_URL`, creates only randomly named QA challenge/session records, sends no messages, and cleans them up. It never creates a user or merchant.

`tools/test-bot-testnet.mjs --execute-testnet` requires the explicit fixture/session environment described in the script. It submits testnet transactions and keeps a durable report; do not run it as a routine health check or repurpose it to manufacture adoption. Keep session files outside Git.

## Deployed revisions

- Backend Vercel deployment: `dpl_BpuZUtzcigE6GjFKM3NRJLdGeXfG`, aliased to `https://nexuspay-backend-test.vercel.app`.
- Frontend Vercel deployment: `dpl_H18Detr2fGKkNw4vBJxbwte1BEim`, aliased to `https://nexuspayapp-ten.vercel.app`.

Both are the existing testnet application deployments. Vercel's `production` alias terminology does not enable BOT mainnet.
