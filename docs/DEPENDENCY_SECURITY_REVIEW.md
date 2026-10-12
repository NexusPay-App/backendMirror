# Dependency security review — 8 October 2026

These are npm advisory counts, including transitive parent findings; they are not counts of independently exploitable application flaws. Upgrading a package does not prove application security.

| Package root | Before | After |
| --- | --- | --- |
| backendMirror | 178 (9 critical / 93 high) | 45 (0 critical / 2 high / 43 moderate) |
| nexuspayapp | 56 (1 critical / 41 high) | 27 (0 critical / 7 high / 20 moderate) |
| backendMirror/mpesa-webhook-service | 36 (1 critical / 28 high) | 0 (0 critical / 0 high / 0 moderate) |
| backendMirror/SimpleFrontend | 11 (1 critical / 8 high) | 0 (0 critical / 0 high / 0 moderate) |

Production-only audits (`npm audit --omit=dev`) report backend 25 findings (2 high, 23 moderate) and frontend 3 (2 high, 1 moderate). Nested packages have no reported findings. Exact snapshots are retained with the repository documentation.

## Remaining high findings and release handling

- **Reclaim → node-forge**, in both application dependency trees: [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) reports no patched version through 1.4.0. This is signature-verification code, so it must not be dismissed merely because it is transitive. `ENABLE_RECLAIM=false` is the default; remove or remediate the affected verification path, or obtain a documented cryptographic reachability review before enabling it. Owner: backend/security maintainer and Reclaim dependency owner. Rotate the previously exposed application secret separately.
- **Next lint → fast-glob/micromatch/braces**, development dependencies: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) reports no patched version through braces 3.0.3. CI uses repository-controlled patterns; do not pass user input as lint glob patterns. Track an upstream fix. Owner: frontend maintainer.
- **js-yaml 4.x** was overridden to 4.3.2 to resolve the patched merge-key issue, including Thirdweb's transitive Hey API tools. See [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh). Remaining moderate findings in other major versions are retained in the audit JSON; no untested major override was applied.

Remaining moderate findings include SDK/tooling dependency paths. They require path-specific review using the saved audit JSON. Package-level suppression or `npm audit fix --force` downgrades were not used. npm suggests downgrading some direct SDK/framework packages; those suggestions are not accepted fixes for the implemented APIs.

CI fails on critical application findings and high findings in the two nested packages. Existing application high/moderate findings are explicitly recorded here rather than silently treated as zero. Weekly Dependabot checks were added for packages and actions. Mainnet release remains gated by the unresolved operational/security requirements in the BOT runbook.

## Reproducibility and supported-version exceptions

Use Node 24.21.0, npm 12.2.0 and `npm ci`. Both application trees pass `npm ls --all` without invalid peer dependencies. The complete original 118-entry dependency decision inventory is in the workspace's `DEPENDENCY_UPGRADE_REPORT.md`.

Backend TypeScript is pinned to 5.9.3 for Thirdweb's Solana peer range; ioredis to 5.11.1 for WalletConnect/unstorage. Frontend TypeScript is 6.0.3; ESLint remains 9.39.5 for Next's React lint compatibility. Backend gcp-metadata 7.0.1 satisfies MongoDB's optional peer while Google auth retains its own 9.x copy. Other scoped overrides are visible in package.json. These pins should be revisited when upstream peer support changes.
