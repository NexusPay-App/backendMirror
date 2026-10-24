# Mainnet activation — 23 October 2026

The owner authorized BOT Chain, Base and Arbitrum mainnet activation with users paying their own network fees. This supersedes the earlier testnet-only authorization; it does not establish funded mainnet acceptance or ecosystem eligibility.

## Configuration

| Network | Chain ID | Network fee | Provider |
| --- | --- | --- | --- |
| BOT Chain | 677 | Native BOT in the BOT smart account | BOT RPC and ERC-4337 bundler |
| Base | 8453 | ETH on Base in the existing NexusPay smart account | Public Base RPC, Thirdweb bundler |
| Arbitrum | 42161 | ETH on Arbitrum in the existing NexusPay smart account | Public Arbitrum RPC, Thirdweb bundler |

BOT mainnet requires `BOTCHAIN_ENABLED=true` and `BOTCHAIN_TRANSFERS_ENABLED=true`. Testnet remains separately enabled. Base and Arbitrum were already configured with mainnet IDs; the payment paths now disable sponsorship, check native balance and estimated account-abstraction gas, and retain the existing factory and address checks. No EOA fallback or wallet migration is introduced. Stablecoins do not cover network fees.

## Verified and blocked

- Production-credential read-only checks pass for BOT RPC, entry point, account factory and bundler.
- Base and Arbitrum RPC and contract checks pass, but the configured Thirdweb project rejects mainnet bundler access with `Mainnets not enabled for this account`. Thirdweb-hosted bundling requires billing access independently of who pays gas. Alternatively, use the [Alchemy bundler configuration](MAINNET_BUNDLER.md) to retain the SDK without a Thirdweb bundler subscription. Sponsorship stays off.
- `GET /api/health/mainnet` reports read-only provider readiness, cached for five minutes. It does not sign or submit transactions. The deployment-health workflow reports failure while any requested mainnet provider remains unavailable.
- Backend build, lint and 63 tests pass, including native-fee rejection, account preservation, safe provider errors and maintenance authentication.
- Next.js is patched to 16.4.3; the backend TOML parser override is 5.0.1. Root dependency audits report no high/critical findings; moderate transitive findings remain.
- No real mainnet payment has been submitted or verified by this activation work. Fund the correct network-specific account before an owner-operated payment test.

## Payment reconciliation

The `Payment reconciliation` GitHub workflow calls an authenticated endpoint on a five-minute schedule and can also run manually. It checks up to five previously submitted BOT operations per invocation, without signing or resubmitting. GitHub schedules may be delayed. Browser polling still handles foreground confirmation. `PAYMENT_MAINTENANCE_SECRET` must match in GitHub Actions and Vercel production; never commit it.

External deposit indexing remains disabled. Balances use RPC reads; complete external deposit history is not claimed. The earlier onboarding delivery, credential rotation, custody/backup restoration and independent usage checks in [technical readiness](BOTCHAIN_TECHNICAL_READINESS.md) remain outstanding unless separately evidenced.

## Release verification and rollback

Run backend build/lint/tests and frontend typecheck/lint/tests/build/browser checks before promotion. Verify `/api/health/ready`, `/api/botchain/networks`, `/api/health/mainnet`, and `node tools/check-deployment.mjs` after release. A provider failure must not be reported as successful activation of that network.

To stop BOT submissions, set `BOTCHAIN_TRANSFERS_ENABLED=false` in Vercel production and redeploy. Keep reads and reconciliation available. For a code regression, promote the previous known-good Vercel deployment, preserving the network flags intended for that deployment. Do not change factories, delete pending records or automatically resend uncertain payments during rollback.
