# Testnet deployment

Deployed on BOT Chain Testnet (968) and Arbitrum Sepolia (421614). Transaction hashes link to their
block explorer page. Machine-readable record: `deploy/deployments/testnet-e2e.json`; deployment
manifest: `deploy/deployments/testnet.json`.

## Contracts

| Contract | Chain | Address | Deploy tx | Gas |
| --- | --- | --- | --- | --- |
| `BotBridgeHub` | Arbitrum Sepolia (421614) | `0xAFC7fAE6d192EfDe3f66D6a8Eff1A255cE59ccA0` | [`0xe941aef2ee61c50c83b10ec4a13a3a5b8a09d65f9b808bb4ca9c0cd51547c34c`](https://sepolia.arbiscan.io/tx/0xe941aef2ee61c50c83b10ec4a13a3a5b8a09d65f9b808bb4ca9c0cd51547c34c) | 1,826,720 |
| `BotSwapEscrow` | BOT Chain Testnet (968) | `0x3037Df7A0c417FC9c5ecaB6aaeb610Ba25C798f0` | [`0x422abcb076da80b1429574e2316a1d28967631bb332b04bf4e7ba133a03fc3fc`](https://scan.bohr.life/tx/0x422abcb076da80b1429574e2316a1d28967631bb332b04bf4e7ba133a03fc3fc) | 1,309,086 |

Constructor arguments: hub `(owner, broker, operator, botChainId 968, settlementWindow 120)`, escrow
`(owner, broker)`, with deployer `0xA1E52125F3780bf3c39BDa988e231C3c9cC6A7c5` in every role. The 120
second settlement window is testnet-only, short enough to exercise the refund path; production uses
3600.

After deployment, the script read `owner`, `broker`, `operator`, `botChainId`, `settlementWindow` and
`domainSeparator` back from both chains and compared them with the TypeScript EIP-712 domains. All
nine checks passed, so live quotes hash and recover exactly as `shared/signing.ts` computes them.

The hub only escrows ERC-20 assets, and no Arbitrum Sepolia test token is faucet-available from this
environment, so the bridged asset is a mintable test token:

| Test asset | Chain | Address | Deploy tx |
| --- | --- | --- | --- |
| `TUSDC` (Test USD, 6 decimals) | Arbitrum Sepolia | `0x8E30278Fb74D49c2A0ede0590a5e5cbeB8580D8d` | [`0xf1a9b90cc38796167573d35357c839f51aeee3a046be19a0c0b5dc00c4fd0ec6`](https://sepolia.arbiscan.io/tx/0xf1a9b90cc38796167573d35357c839f51aeee3a046be19a0c0b5dc00c4fd0ec6) |

## Wallets and funding

All six wallets received 0.4 tBOT, 50 USDT and 1,000 TUSDC before any flow ran.

| # | Address | TUSDC mint | tBOT transfer | USDT transfer |
| --- | --- | --- | --- | --- |
| 0 | `0xc67b1c8187a2e513b6a41253a64257D3cA161769` | [`0x7db1a3ef…4937`](https://sepolia.arbiscan.io/tx/0x7db1a3ef9ca11497f1aaf6592e02870183f4272e1cee52ea1c5db67857d44937) | [`0x21776c94…8998`](https://scan.bohr.life/tx/0x21776c943399610eb4a6347a875d6fa9797ecd83b306941ee3d9a6a3cf6b8998) | [`0x632232ea…af82`](https://scan.bohr.life/tx/0x632232eae6d3762030adc22ed5768f74da62a995b4cb01c8f5279ac02d9daf82) |
| 1 | `0x9Fd6B37e56f25966fBD086a56e459D56aAE4C268` | [`0x56846a05…6ff3`](https://sepolia.arbiscan.io/tx/0x56846a05da84b100454be014c5b1cc23d09da3922cd7e62095c2f4bcc4c76ff3) | [`0x171c475f…2ecd`](https://scan.bohr.life/tx/0x171c475f99012c0c00b0956d192ff0b52e43655875ea09f5e61e454c20342ecd) | [`0xec41d717…27a3`](https://scan.bohr.life/tx/0xec41d717b20e2524784cce7dc248c89fcf98a4c2208a6f900947f87d15b827a3) |
| 2 | `0xCC06c90Bc2e0C0865C2495028709a9763C6e3E5F` | [`0xd0a0d1fd…c7be`](https://sepolia.arbiscan.io/tx/0xd0a0d1fda912e1782a1455384720f4a0493b8c4ef1f50a7912c0e38f8230c7be) | [`0xab003e0e…be57`](https://scan.bohr.life/tx/0xab003e0eddb58321091e10cc6d3cec00b6da720c875a203c2519b5c08f36be57) | [`0x10df370a…ef7e`](https://scan.bohr.life/tx/0x10df370aa18a2f856f209e130615e8c731b6d28a6973f045f9619b26402def7e) |
| 3 | `0x90b4f3189f55fA939C872D11d01BbE94BaB644f9` | [`0xe87462df…f37b`](https://sepolia.arbiscan.io/tx/0xe87462df7bb46b952776897af1abb3cd0c0a93c3538b1d61aae6a8255058f37b) | [`0xdc670eca…0e9a`](https://scan.bohr.life/tx/0xdc670eca8d58982488f72e78b7294729820de27eabf7c5b9fa2b44fb99e90e9a) | [`0xad0960f3…637d`](https://scan.bohr.life/tx/0xad0960f3d7abf48ce526eb2a0413096033ee36a1bdf788cbc09d5853f48a637d) |
| 4 | `0x146B8098A242A3467BFea665a4A736F818Ecc04b` | [`0xfa42619f…e59b`](https://sepolia.arbiscan.io/tx/0xfa42619fe15186f24eee1656a9ca64a3120312960e58e33b92c75c764998e59b) | [`0xd945f4e1…6963`](https://scan.bohr.life/tx/0xd945f4e1812f316d6b12a0dbb4dd787d37efe616974e19dc658186d7a3886963) | [`0xe2e2dfd2…2970`](https://scan.bohr.life/tx/0xe2e2dfd26f6a98bca171ef22110da1a47487148e023b760fcb80b0692b8e2970) |
| 5 | `0x19B813BbE48a9536CB5C01d75FBe41B67ee5744f` | [`0x217f8e59…273c`](https://sepolia.arbiscan.io/tx/0x217f8e59fc6bb90de2739386bc44c6eff63a9e6c0c1d05c7ea816f53f4d4273c) | [`0xd60ec818…ab36`](https://scan.bohr.life/tx/0xd60ec8184fee16d153edcdc4200ee2cc3cc3f607466669c7f35f09299506ab36) | [`0xf2fd0259…f761`](https://scan.bohr.life/tx/0xf2fd0259811628ce7563755c4f4fcb78cdbc17271345448fdc5cb0edfc88f761) |

Swap inventory on `BotSwapEscrow`: 1 tBOT
([`0x9cfa7a85…df56`](https://scan.bohr.life/tx/0x9cfa7a859dd8e6f2b0c61c09c957eaac1f4f8bfac3315a81f9a5ac277c82df56))
and 300 USDT
([`0x66e24024…10b5`](https://scan.bohr.life/tx/0x66e2402472ccf8b534d68345430ed9212cdbb16bc7bb8cc54dbdd192b1dc10b5)).

## Bridge: deposit, BOT payout, release

Each wallet deposited 10 TUSDC on Arbitrum Sepolia against a broker-signed quote for chain 968 with
`destToken = NATIVE` and itself as `destAccount`. The operator then sent 0.01 tBOT on BOT Chain and
anchored that BOT transaction hash with `release`.

| # | Depositor | Deposit tx (Arb Sepolia) | BOT payout tx (968) | Release tx (Arb Sepolia) |
| --- | --- | --- | --- | --- |
| 0 | `0xc67b…1769` | [`0x1858dcaa…40c0`](https://sepolia.arbiscan.io/tx/0x1858dcaa119fac8b02c7ff0d25f6b4ad441057357d1482524ccbcdb398fe40c0) | [`0xab160799…d60b`](https://scan.bohr.life/tx/0xab1607998a616e32b9f2738729dd51ece2949e1a5c183b29fb18606dcd27d60b) | [`0xbe55affc…49bd`](https://sepolia.arbiscan.io/tx/0xbe55affcd8de374b88e70b6fc9e920d40e4f98e5d67ac8c85b3010544dbb49bd) |
| 1 | `0x9Fd6…C268` | [`0x8d5fad7a…a5f1`](https://sepolia.arbiscan.io/tx/0x8d5fad7a4a4220e1fae4ba13e3841a008493020cd550510e56b1036d28fba5f1) | [`0x9411c4ff…a53e`](https://scan.bohr.life/tx/0x9411c4fffb7d10ad524b5a8628237f17b5076da032d73ab0fabe98180107a53e) | [`0x4486df2c…f688`](https://sepolia.arbiscan.io/tx/0x4486df2cec74e2e0b70c0f321886838e0a7d9cf04374cee4db5caf711d7cf688) |
| 2 | `0xCC06…3E5F` | [`0xa7e4a0ce…3ddc`](https://sepolia.arbiscan.io/tx/0xa7e4a0cef567df9adc362264644cf8ac4cb9644952bb15df03f0ebd702f63ddc) | [`0x6e4f7e67…577e`](https://scan.bohr.life/tx/0x6e4f7e67702571e75b88f6bcab27367817774cadc2d9045684cab5eecd2a577e) | [`0x211f0a76…4bfe`](https://sepolia.arbiscan.io/tx/0x211f0a768f3b384e37782ea7f75016fd7f55d099e0a4ca4d45234dd143934bfe) |
| 3 | `0x90b4…44f9` | [`0x852d221f…bb5b`](https://sepolia.arbiscan.io/tx/0x852d221f2d5b6418a93f9bb831e5714fea6d90485c51ffe8e438c1e0faf3bb5b) | [`0x752fe412…707a`](https://scan.bohr.life/tx/0x752fe412a382163abd7fb42c7aa54811c771424800642f3819888bf8d427707a) | [`0x123764cc…6735`](https://sepolia.arbiscan.io/tx/0x123764ccd75047efe7d5c3628eb6bd51214edf99a69bf9a99bb8ba9deead6735) |
| 4 | `0x146B…c04b` | [`0x1c4b3a74…a8ec`](https://sepolia.arbiscan.io/tx/0x1c4b3a7457f9c0bce3800d00e91711e462aa3152bb2f53541a81e0e2a5dda8ec) | [`0xd6d334b4…4153`](https://scan.bohr.life/tx/0xd6d334b4d71dc335961711bceac7fcf9f7ab98403ee9a942a8115c857c9c4153) | [`0x9c65ff4f…8019`](https://sepolia.arbiscan.io/tx/0x9c65ff4f0e984925595a28099d2448399ae70077bdbd30130ce353ea8b458019) |

Approvals were separate transactions, e.g. wallet 0:
[`0x642a3f88…ede9`](https://sepolia.arbiscan.io/tx/0x642a3f88773e4a636f60c4fd4f42a604191e9e1715e5fe0c57e0197b5973ede9).

## Bridge: refund after the window

Wallet 5 deposited 10 TUSDC and did not get a release, so the refund path ran once
`releaseDeadline` (1794318234) had passed.

| Step | Transaction |
| --- | --- |
| Deposit | [`0x8bbd95ca3ed63147058cc890aa4581b6c4466a4656dfb1457e337e404bc3450c`](https://sepolia.arbiscan.io/tx/0x8bbd95ca3ed63147058cc890aa4581b6c4466a4656dfb1457e337e404bc3450c) |
| Refund | [`0x13506cc6a8cf7a020fedb97bed0316291a0ad8d2b48182336faf74591f4ac867`](https://sepolia.arbiscan.io/tx/0x13506cc6a8cf7a020fedb97bed0316291a0ad8d2b48182336faf74591f4ac867) |

`escrowOf` afterwards reports `refunded = true`, `released = false`, `amountIn = 0`, and the wallet's
TUSDC balance is back to 1,000.

## Swap, both directions

Three wallets sold 10 USDT for 0.02 tBOT, three sold 0.02 tBOT for 9.8 USDT, all against signed
quotes with `feeBps` 50.

| # | Direction | Swap tx (968) | Wallet delta |
| --- | --- | --- | --- |
| 0 | USDT → BOT | [`0xa7da8eb6…21e9`](https://scan.bohr.life/tx/0xa7da8eb606f7010b4f603d51293224805c25385ff897d1e257176f48335221e9) | +0.02 tBOT |
| 1 | USDT → BOT | [`0x31642e44…b7ce`](https://scan.bohr.life/tx/0x31642e44cda62835f1016a9418632e551df60e283404f07e72dd0ac858f6b7ce) | +0.02 tBOT |
| 2 | USDT → BOT | [`0xca3f2ecf…fb86`](https://scan.bohr.life/tx/0xca3f2ecfb9acdc18d106172ae577e1516ba67ff67d4b958b19af3d76c99ffb86) | +0.02 tBOT |
| 3 | BOT → USDT | [`0x436b379d…e07f`](https://scan.bohr.life/tx/0x436b379dba77fbed6e22d0c8e94274815cfb3b46629997fa631d3b24d783e07f) | +9.8 USDT |
| 4 | BOT → USDT | [`0x16ac2afe…9b60`](https://scan.bohr.life/tx/0x16ac2afe56e56a7e579285433574c60f14df68d2a5b3597ca587f39ed82c9b60) | +9.8 USDT |
| 5 | BOT → USDT | [`0xfa7d65aa…8a7c`](https://scan.bohr.life/tx/0xfa7d65aa5a793f00996a3c02314f795fafd77e22708359b8e9af526f94fd8a7c) | +9.8 USDT |

USDT approvals for the first three:
[`0x9d9b5119…ab36`](https://scan.bohr.life/tx/0x9d9b51197de9929f55bbc5a92df002591ea4b4844e869f61785574ef166aab36),
[`0xcd07707e…b57a`](https://scan.bohr.life/tx/0xcd07707e4fb0645a9f8aafaebaa7dd1021a83ea509e3f5a1fb17d9f1b169b57a),
[`0x1661f7f9…6630`](https://scan.bohr.life/tx/0x1661f7f992f30158a1d369f0b6b9d3e6d78e2fefbec9b10934b71c1462ab6630).

## Verified on chain

- Every quote's on-chain `quoteDigest` equals the digest computed by `shared/signing.ts`, and every
  signature recovers to the deployed broker.
- `deposit` recorded the correct depositor and exact `amountIn`, and `release` stored the BOT payout
  hash as `botPayoutRef` with `released = true`.
- A deposit that was not released could be refunded by its depositor once the window closed, and the
  escrow amount went to zero.
- Every swap marked its `quoteId` used, paid the quoted output from inventory, and left the escrow
  holding only inventory.

Resulting balances on BOT Chain testnet:

| # | tBOT | USDT |
| --- | --- | --- |
| 0 | 0.42586933 | 40 |
| 1 | 0.42586885 | 40 |
| 2 | 0.42586885 | 40 |
| 3 | 0.38754678 | 59.8 |
| 4 | 0.38754774 | 59.8 |
| 5 | 0.37754714 | 59.8 |

Escrow inventory after the run: 300.6 USDT and 1.0 tBOT. Released bridge deposits remain in the hub
as Arbitrum-side inventory: 50 TUSDC, sweepable by the owner with `sweepReleased`.

## Reproducing

From `src/BotContracts` after `forge build`, with keys from `TESTNET_ACCOUNTS_FILE` (default
`/tmp/botchain-test-accounts/accounts.json`):

```
npx tsx test/e2e/testnet.e2e.ts deploy
npx tsx test/e2e/testnet.e2e.ts prepare
npx tsx test/e2e/testnet.e2e.ts bridge
npx tsx test/e2e/testnet.e2e.ts refund
npx tsx test/e2e/testnet.e2e.ts swap
npx tsx test/e2e/testnet.e2e.ts status
```

Each stage writes its hashes to `deploy/deployments/testnet-e2e.json` and skips work already
recorded there, so a re-run resumes rather than duplicating. Quote TTLs were 60 seconds and the
deployment's settlement window 120 seconds.

## Limits

TUSDC stands in for the Arbitrum-side token because no Sepolia test token is faucet-available here.
The BOT payout is an operator transfer from inventory, as in production, so the trust model is
unchanged: the contract bounds and records the release, it does not make the operator trustless.
