// End-to-end check: deploy the real contracts on anvil and drive them with the TypeScript
// operator builders. This is the only test that proves the off-chain typehashes, ABIs, calldata,
// quote ids and digests agree with the deployed bytecode.
//
// Run from src/BotContracts after `forge build`:
//   npx tsx test/e2e/chain.e2e.ts

import { spawn, type ChildProcess } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
  type Address,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  bridgeDepositCall,
  bridgeRefundCall,
  bridgeReleaseCall,
  buildBridgeQuote,
  signBridge,
  verifyBridge,
} from '../../bridge/operator'
import { buildSwapQuote, signSwap, swapCall } from '../../swap/operator'
import { NATIVE } from '../../shared/types'

const RPC = 'http://127.0.0.1:8547'
const PORT = 8547
const OUT = '/tmp/botcontracts-out'

const chain = defineChain({
  id: 42161,
  name: 'anvil-arbitrum',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
})

const KEYS = {
  deployer: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  broker: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  operator: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  trader: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
} as const

const deployer = privateKeyToAccount(KEYS.deployer)
const broker = privateKeyToAccount(KEYS.broker)
const operator = privateKeyToAccount(KEYS.operator)
const trader = privateKeyToAccount(KEYS.trader)

const publicClient = createPublicClient({ chain, transport: http(RPC) })
const deployerWallet = createWalletClient({ account: deployer, chain, transport: http(RPC) })
const traderWallet = createWalletClient({ account: trader, chain, transport: http(RPC) })
const operatorWallet = createWalletClient({ account: operator, chain, transport: http(RPC) })

// --------------------------------------------------------------------------- helpers

const failures: string[] = []
let checks = 0

function check(name: string, condition: boolean, detail?: unknown): void {
  checks += 1
  if (condition) {
    console.log(`  ok   ${name}`)
  } else {
    failures.push(name)
    console.log(`  FAIL ${name}${detail === undefined ? '' : ` -> ${JSON.stringify(detail, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))}`}`)
  }
}

function artifact(name: string): { abi: any[]; bytecode: Hex } {
  const files = readdirSync(OUT, { recursive: true }).map(String)
  const file = files.find((entry) => entry.endsWith(`/${name}.json`))
  if (!file) throw new Error(`artifact ${name} not found under ${OUT}; run forge build first`)
  const json = JSON.parse(readFileSync(join(OUT, file), 'utf8')) as {
    abi: any[]
    bytecode: { object: string }
  }
  // Forge writes `bytecode.object` with the 0x prefix in some versions and without it in
  // others; normalise instead of assuming.
  const bytecode = json.bytecode.object.startsWith('0x')
    ? json.bytecode.object
    : `0x${json.bytecode.object}`
  return { abi: json.abi, bytecode: bytecode as Hex }
}

async function deploy(name: string, args: unknown[] = []): Promise<Address> {
  const { abi, bytecode } = artifact(name)
  const hash = await deployerWallet.deployContract({ abi, bytecode, args })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (!receipt.contractAddress) throw new Error(`deployment of ${name} produced no address`)
  return receipt.contractAddress
}

const ERC20_ABI = [
  { type: 'function', name: 'mint', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 's', type: 'address' }, { name: 'a', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const

const BRIDGE_VIEW_ABI = [
  { type: 'error', name: 'QuoteAlreadyUsed', inputs: [{ name: 'quoteId', type: 'bytes32' }] },
  {
    type: 'error',
    name: 'InvalidSigner',
    inputs: [{ name: 'expected', type: 'address' }, { name: 'recovered', type: 'address' }],
  },
  { type: 'function', name: 'quoteDigest', stateMutability: 'view', inputs: [{ name: 'quote', type: 'tuple', components: [
    { name: 'token', type: 'address' }, { name: 'amountIn', type: 'uint256' }, { name: 'trader', type: 'address' },
    { name: 'destChainId', type: 'uint256' }, { name: 'destToken', type: 'address' }, { name: 'destAccount', type: 'address' },
    { name: 'minOut', type: 'uint256' }, { name: 'feeBps', type: 'uint256' }, { name: 'expiresAt', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ] }], outputs: [{ type: 'bytes32' }] },
  { type: 'function', name: 'quoteIdOf', stateMutability: 'view', inputs: [{ name: 'quote', type: 'tuple', components: [
    { name: 'token', type: 'address' }, { name: 'amountIn', type: 'uint256' }, { name: 'trader', type: 'address' },
    { name: 'destChainId', type: 'uint256' }, { name: 'destToken', type: 'address' }, { name: 'destAccount', type: 'address' },
    { name: 'minOut', type: 'uint256' }, { name: 'feeBps', type: 'uint256' }, { name: 'expiresAt', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ] }], outputs: [{ type: 'bytes32' }] },
  { type: 'function', name: 'escrowOf', stateMutability: 'view', inputs: [{ name: 'id', type: 'bytes32' }], outputs: [{ type: 'tuple', components: [
    { name: 'depositor', type: 'address' }, { name: 'token', type: 'address' }, { name: 'amountIn', type: 'uint256' },
    { name: 'destChainId', type: 'uint256' }, { name: 'destToken', type: 'address' }, { name: 'destAccount', type: 'address' },
    { name: 'minOut', type: 'uint256' }, { name: 'feeBps', type: 'uint256' }, { name: 'depositedAt', type: 'uint64' },
    { name: 'expiresAt', type: 'uint64' }, { name: 'releaseDeadline', type: 'uint64' }, { name: 'released', type: 'bool' },
    { name: 'refunded', type: 'bool' }, { name: 'botPayoutRef', type: 'bytes32' },
  ] }] },
  { type: 'function', name: 'deposit', stateMutability: 'nonpayable', inputs: [
    { name: 'quote', type: 'tuple', components: [
      { name: 'token', type: 'address' }, { name: 'amountIn', type: 'uint256' }, { name: 'trader', type: 'address' },
      { name: 'destChainId', type: 'uint256' }, { name: 'destToken', type: 'address' }, { name: 'destAccount', type: 'address' },
      { name: 'minOut', type: 'uint256' }, { name: 'feeBps', type: 'uint256' }, { name: 'expiresAt', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
    ] },
    { name: 'signature', type: 'bytes' },
  ], outputs: [{ type: 'bytes32' }] },
] as const

const SWAP_VIEW_ABI = [
  { type: 'error', name: 'QuoteAlreadyUsed', inputs: [{ name: 'quoteId', type: 'bytes32' }] },
  { type: 'function', name: 'quoteDigest', stateMutability: 'view', inputs: [{ name: 'quote', type: 'tuple', components: [
    { name: 'tokenIn', type: 'address' }, { name: 'amountIn', type: 'uint256' }, { name: 'tokenOut', type: 'address' },
    { name: 'amountOut', type: 'uint256' }, { name: 'trader', type: 'address' }, { name: 'recipient', type: 'address' },
    { name: 'minOut', type: 'uint256' }, { name: 'feeBps', type: 'uint256' }, { name: 'expiresAt', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ] }], outputs: [{ type: 'bytes32' }] },
  { type: 'function', name: 'quoteIdOf', stateMutability: 'view', inputs: [{ name: 'quote', type: 'tuple', components: [
    { name: 'tokenIn', type: 'address' }, { name: 'amountIn', type: 'uint256' }, { name: 'tokenOut', type: 'address' },
    { name: 'amountOut', type: 'uint256' }, { name: 'trader', type: 'address' }, { name: 'recipient', type: 'address' },
    { name: 'minOut', type: 'uint256' }, { name: 'feeBps', type: 'uint256' }, { name: 'expiresAt', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ] }], outputs: [{ type: 'bytes32' }] },
  { type: 'function', name: 'isQuoteUsed', stateMutability: 'view', inputs: [{ name: 'id', type: 'bytes32' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'swap', stateMutability: 'payable', inputs: [
    { name: 'quote', type: 'tuple', components: [
      { name: 'tokenIn', type: 'address' }, { name: 'amountIn', type: 'uint256' }, { name: 'tokenOut', type: 'address' },
      { name: 'amountOut', type: 'uint256' }, { name: 'trader', type: 'address' }, { name: 'recipient', type: 'address' },
      { name: 'minOut', type: 'uint256' }, { name: 'feeBps', type: 'uint256' }, { name: 'expiresAt', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
    ] },
    { name: 'signature', type: 'bytes' },
  ], outputs: [{ type: 'bytes32' }] },
] as const

/// viem wraps reverts several `cause` levels deep; find the decoded custom error name.
function revertName(error: unknown): string | undefined {
  let current: any = error
  for (let depth = 0; depth < 6 && current; depth += 1) {
    if (typeof current.errorName === 'string') return current.errorName
    if (typeof current.data?.errorName === 'string') return current.data.errorName
    current = current.cause
  }
  return undefined
}

async function expectRevert(name: string, action: () => Promise<unknown>, expected: string): Promise<void> {
  try {
    await action()
    check(name, false, 'call succeeded')
  } catch (error) {
    const got = revertName(error)
    check(name, got === expected, { expected, got: got ?? 'unrecognised revert' })
  }
}

// --------------------------------------------------------------------------- run

let anvil: ChildProcess | undefined

async function main(): Promise<void> {
  anvil = spawn('anvil', ['--port', String(PORT), '--chain-id', '42161', '--silent'], { stdio: 'ignore' })
  for (let i = 0; i < 100; i += 1) {
    try {
      await publicClient.getBlockNumber()
      break
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  // ---------------------------------------------------------------- bridge deploy
  const usdc = await deploy('MockERC20', ['USD Coin', 'USDC', 6])
  const hub = await deploy('BotBridgeHub', [deployer.address, broker.address, operator.address, 677n, 3600n])

  await deployerWallet.writeContract({ address: usdc, abi: ERC20_ABI, functionName: 'mint', args: [trader.address, 1_000_000_000n] })
  await traderWallet.writeContract({ address: usdc, abi: ERC20_ABI, functionName: 'approve', args: [hub, 1_000_000_000n] })

  const now = Math.floor(Date.now() / 1000)
  // All-lowercase so viem's EIP-55 validator does not reject the placeholders.
  const destToken = '0x00000000000000000000000000000000000000b7' as Address
  const destAccount = '0x00000000000000000000000000000000000000d1' as Address
  const quote = buildBridgeQuote({
    token: usdc,
    amountIn: 25_000_000n,
    trader: trader.address,
    destToken,
    destAccount,
    minOut: 24_000_000n,
    feeBps: 75,
  }, now)
  const signed = await signBridge(broker, quote, { chainId: 42161, verifyingContract: hub })

  const onChainDigest = await publicClient.readContract({
    address: hub, abi: BRIDGE_VIEW_ABI, functionName: 'quoteDigest', args: [quote],
  })
  const onChainId = await publicClient.readContract({
    address: hub, abi: BRIDGE_VIEW_ABI, functionName: 'quoteIdOf', args: [quote],
  })
  check('bridge typehash/digest matches TypeScript', onChainDigest === signed.digest, { onChainDigest, ts: signed.digest })
  check('bridge quoteId matches TypeScript struct hash', onChainId === signed.quoteId, { onChainId, ts: signed.quoteId })
  check('bridge signature verifies off chain', await verifyBridge(signed, broker.address))

  // ---------------------------------------------------------------- deposit / release
  const deposit = bridgeDepositCall(hub, signed)
  const depositHash = await traderWallet.sendTransaction({ to: deposit.to, data: deposit.data, value: deposit.value })
  await publicClient.waitForTransactionReceipt({ hash: depositHash })

  const escrow = await publicClient.readContract({
    address: hub, abi: BRIDGE_VIEW_ABI, functionName: 'escrowOf', args: [signed.quoteId],
  }) as any
  check('deposit recorded depositor', escrow.depositor === trader.address, escrow.depositor)
  check('deposit recorded exact amount', escrow.amountIn === 25_000_000n, escrow.amountIn)
  check('deposit recorded release deadline', escrow.releaseDeadline === BigInt(Number(quote.expiresAt) + 3600), escrow.releaseDeadline)
  check('deposit not yet settled', escrow.released === false && escrow.refunded === false)

  const payoutRef = ('0x' + 'ab'.repeat(32)) as Hex
  const release = bridgeReleaseCall(hub, signed.quoteId, payoutRef)
  const releaseHash = await operatorWallet.sendTransaction({ to: release.to, data: release.data, value: release.value })
  await publicClient.waitForTransactionReceipt({ hash: releaseHash })

  const released = await publicClient.readContract({
    address: hub, abi: BRIDGE_VIEW_ABI, functionName: 'escrowOf', args: [signed.quoteId],
  }) as any
  check('release anchors the BOT payout ref', released.released === true && released.botPayoutRef === payoutRef)

  await expectRevert(
    'replayed deposit rejected on chain',
    () => publicClient.simulateContract({
      address: hub, abi: BRIDGE_VIEW_ABI, functionName: 'deposit', args: [quote, signed.signature], account: trader,
    }),
    'QuoteAlreadyUsed',
  )

  // A signature is bound to the exact terms, so any edit must be rejected before the time jump
  // (after it, the quote would fail on expiry instead and prove nothing about the signature).
  await expectRevert(
    'tampered quote rejected',
    () => publicClient.simulateContract({
      address: hub, abi: BRIDGE_VIEW_ABI, functionName: 'deposit',
      args: [{ ...quote, nonce: quote.nonce + 1n }, signed.signature], account: trader,
    }),
    'InvalidSigner',
  )

  // Refund path on a fresh quote, after the release window closes.
  const refundQuote = buildBridgeQuote({
    token: usdc, amountIn: 10_000_000n, trader: trader.address, destToken, destAccount, minOut: 9_000_000n, feeBps: 75,
  }, now)
  const refundSigned = await signBridge(broker, refundQuote, { chainId: 42161, verifyingContract: hub })
  const refundDeposit = bridgeDepositCall(hub, refundSigned)
  await publicClient.waitForTransactionReceipt({
    hash: await traderWallet.sendTransaction({ to: refundDeposit.to, data: refundDeposit.data, value: refundDeposit.value }),
  })

  // Expiry (900s) plus settlement window (3600s) must both pass before a refund is allowed.
  await publicClient.request({ method: 'evm_increaseTime' as never, params: [5400] as never })
  await publicClient.request({ method: 'evm_mine' as never, params: [] as never })

  const refundCall = bridgeRefundCall(hub, refundSigned.quoteId)
  await publicClient.waitForTransactionReceipt({
    hash: await traderWallet.sendTransaction({ to: refundCall.to, data: refundCall.data, value: refundCall.value }),
  })

  const refunded = await publicClient.readContract({
    address: hub, abi: BRIDGE_VIEW_ABI, functionName: 'escrowOf', args: [refundSigned.quoteId],
  }) as any
  check('refund after window returns funds', refunded.refunded === true && refunded.amountIn === 0n)

  // ---------------------------------------------------------------- swap both directions
  const usdt = await deploy('MockERC20', ['Tether USD', 'USDT', 6])
  const swapEscrow = await deploy('BotSwapEscrow', [deployer.address, broker.address])

  await deployerWallet.writeContract({ address: usdt, abi: ERC20_ABI, functionName: 'mint', args: [swapEscrow, 1_000_000_000n] })
  await deployerWallet.writeContract({ address: usdt, abi: ERC20_ABI, functionName: 'mint', args: [trader.address, 1_000_000_000n] })
  await deployerWallet.sendTransaction({ to: swapEscrow, value: parseEther('5') })
  await traderWallet.writeContract({ address: usdt, abi: ERC20_ABI, functionName: 'approve', args: [swapEscrow, 1_000_000_000n] })

  // The refund test moved chain time forward by 5400s, so swap quotes must be built against the
  // chain clock, not the wall clock, or they are born expired.
  const chainNow = Number((await publicClient.getBlock({ blockTag: 'latest' })).timestamp)

  const sell = buildSwapQuote({
    tokenIn: usdt, amountIn: 25_000_000n, tokenOut: NATIVE, amountOut: parseEther('0.01'),
    trader: trader.address, feeBps: 50,
  }, chainNow)
  const sellSigned = await signSwap(broker, sell, { chainId: 42161, verifyingContract: swapEscrow })
  const sellDigest = await publicClient.readContract({
    address: swapEscrow, abi: SWAP_VIEW_ABI, functionName: 'quoteDigest', args: [sell],
  })
  check('swap typehash/digest matches TypeScript', sellDigest === sellSigned.digest, { onChain: sellDigest, ts: sellSigned.digest })

  const escrowNativeBefore = await publicClient.getBalance({ address: swapEscrow })
  const traderUsdtBefore = await publicClient.readContract({ address: usdt, abi: ERC20_ABI, functionName: 'balanceOf', args: [trader.address] })
  const sellCall = swapCall(swapEscrow, sellSigned)
  await publicClient.waitForTransactionReceipt({
    hash: await traderWallet.sendTransaction({ to: sellCall.to, data: sellCall.data, value: sellCall.value }),
  })
  const escrowNativeAfter = await publicClient.getBalance({ address: swapEscrow })
  const traderUsdtAfter = await publicClient.readContract({ address: usdt, abi: ERC20_ABI, functionName: 'balanceOf', args: [trader.address] })

  check('sell USDT for BOT: native leg paid from inventory', escrowNativeBefore - escrowNativeAfter === parseEther('0.01'), escrowNativeBefore - escrowNativeAfter)
  check('sell USDT for BOT: token leg collected', traderUsdtBefore - traderUsdtAfter === 25_000_000n, traderUsdtBefore - traderUsdtAfter)

  const buy = buildSwapQuote({
    tokenIn: NATIVE, amountIn: parseEther('0.02'), tokenOut: usdt, amountOut: 20_000_000n,
    trader: trader.address, feeBps: 50,
  }, chainNow)
  const buySigned = await signSwap(broker, buy, { chainId: 42161, verifyingContract: swapEscrow })
  const buyCall = swapCall(swapEscrow, buySigned)
  check('native swap builder sends msg.value', buyCall.value === buy.amountIn, buyCall.value)

  const traderUsdtBeforeBuy = await publicClient.readContract({ address: usdt, abi: ERC20_ABI, functionName: 'balanceOf', args: [trader.address] })
  await publicClient.waitForTransactionReceipt({
    hash: await traderWallet.sendTransaction({ to: buyCall.to, data: buyCall.data, value: buyCall.value }),
  })
  const traderUsdtAfterBuy = await publicClient.readContract({ address: usdt, abi: ERC20_ABI, functionName: 'balanceOf', args: [trader.address] })
  check('buy USDT with BOT: token leg paid from inventory', traderUsdtAfterBuy - traderUsdtBeforeBuy === 20_000_000n, traderUsdtAfterBuy - traderUsdtBeforeBuy)

  const used = await publicClient.readContract({
    address: swapEscrow, abi: SWAP_VIEW_ABI, functionName: 'isQuoteUsed', args: [buySigned.quoteId],
  })
  check('swap marks the quote used', used === true)

  await expectRevert(
    'replayed swap rejected',
    () => publicClient.simulateContract({
      address: swapEscrow, abi: SWAP_VIEW_ABI, functionName: 'swap',
      args: [buy, buySigned.signature], account: trader, value: buy.amountIn,
    }),
    'QuoteAlreadyUsed',
  )
}

main()
  .then(() => {
    console.log(`\n${checks - failures.length}/${checks} on-chain checks passed`)
    if (failures.length > 0) {
      console.error(`FAILED: ${failures.join(', ')}`)
      process.exitCode = 1
    }
  })
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    anvil?.kill('SIGKILL')
  })
