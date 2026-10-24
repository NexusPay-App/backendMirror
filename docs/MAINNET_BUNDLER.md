# User-paid gas without Thirdweb-hosted bundling

Thirdweb's SDK is separate from its hosted bundler. Setting `sponsorGas: false` makes users fund network fees, but does not remove a hosted provider's access requirements. The deployed Thirdweb key returned `Mainnets not enabled for this account` on Base and Arbitrum.

Alchemy documents its Bundler API as available on the free tier, subject to compute-unit and throughput limits. Gas sponsorship is a different product and is not used here:

- https://www.alchemy.com/docs/reference/pricing-plans
- https://www.alchemy.com/docs/wallets/transactions/low-level-infra/bundler/overview
- https://portal.thirdweb.com/bundler

## Prepared configuration

1. In https://dashboard.alchemy.com create or update an app with Base Mainnet and Arbitrum Mainnet access, on the intended free tier. Configure its API key in the backend's local `.env` and Vercel production as `ALCHEMY_API_KEY`. Never commit or share the key in chat.
2. Set `MAINNET_BUNDLER_PROVIDER=alchemy` in the backend environment. This selects `https://base-mainnet.g.alchemy.com/v2/<key>` and `https://arb-mainnet.g.alchemy.com/v2/<key>`. Explicit `BASE_BUNDLER_URL` or `ARBITRUM_BUNDLER_URL` overrides take precedence; check those before switching.
3. Stage a production deployment with `vercel deploy --prod --skip-domain` and check `/api/health/mainnet` on that deployment. Both Base and Arbitrum must report `ready: true` and `bundler: alchemy` before promotion. The check verifies chain ID, factory, USDC metadata, the factory's actual EntryPoint against the bundler's supported list, and fee estimation inputs.
4. After promotion, test a small owner-authorized payment with a funded account and inspect its actual receipt. Read-only readiness and mocked tests do not prove successful settlement.

No new smart account factory, EOA fallback, account migration or paymaster is introduced. The existing factory on both networks reports EntryPoint v0.6 (`0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789`). If a provider stops supporting it, do not change factories or EntryPoints to make the health check pass; that needs a separate account migration design.

The SDK uses standard ERC-4337 bundler methods for estimation, submission and receipts. Alchemy's priority-fee floor plus live base fee are applied to the smart account's existing execute/executeBatch calls for both gas estimation and submission. Provider access errors are returned without credential-bearing URLs. No automatic fallback to sponsored transactions occurs.

BOT mainnet (677) continues using BOT's own bundler, with users paying native BOT. This provider selection affects Base/Arbitrum phone-number and merchant payments through the shared `sendToken` service. Disabled legacy fiat/migration paths are not certified by this change.

## Status — 24 October 2026

Build, lint and 70 tests passed during preparation. Existing local Alchemy credentials returned HTTP 401; no working replacement key has been verified. The default remains Thirdweb until `MAINNET_BUNDLER_PROVIDER=alchemy` is explicitly configured. Do not claim all three mainnets are operational until provider checks and funded acceptance pass.
