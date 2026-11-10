// Live testnet end-to-end: deploys both contracts to BOT Chain testnet and Arbitrum Sepolia,
// funds the six test wallets, then drives the bridge and swap flows with real transactions.
// Every hash is written to deploy/deployments/testnet-e2e.json as it is produced, so a stage can
// be re-run or inspected without repeating earlier work.
//
//   npx tsx test/e2e/testnet.e2e.ts status
//   npx tsx test/e2e/testnet.e2e.ts deploy
//   npx tsx test/e2e/testnet.e2e.ts prepare
//   npx tsx test/e2e/testnet.e2e.ts bridge
//   npx tsx test/e2e/testnet.e2e.ts refund
//   npx tsx test/e2e/testnet.e2e.ts swap
//
// Run from src/BotContracts after `forge build`. Keys come from TESTNET_ACCOUNTS_FILE
// (default /tmp/botchain-test-accounts/accounts.json) or DEPLOYER_PRIVATE_KEY plus
// TESTNET_WALLET_KEYS (comma separated).

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createPublicClient,
  encodeDeployData,
  encodeFunctionData,
  http,
  keccak256,
  parseAbi,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem'
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'
import {
  bridgeDepositCall,
  bridgeRefundCall,
  bridgeReleaseCall,
  buildBridgeQuote,
  signBridge,
  verifyBridge,
} from '../../bridge/operator'
import { buildSwapQuote, signSwap, swapCall } from '../../swap/operator'
import { domainSeparator, bridgeDomain, swapDomain } from '../../shared/signing'
import { NATIVE, type BridgeQuote, type SwapQuote } from '../../shared/types'

// --------------------------------------------------------------------------- constants

const BOT_RPC = process.env.BOT_TESTNET_RPC_URL ?? 'https://rpc.bohr.life'
const ARB_RPC = process.env.ARBITRUM_SEPOLIA_RPC_URL ?? 'https://sepolia-rollup.arbitrum.io/rpc'
const BOT_CHAIN_ID = 968
const ARB_CHAIN_ID = 421614
const BOT_USDT = '0x75edC9335175Fc0552D51D48439F229c10420fe3' as Address

// Short enough that a refund can be exercised in one sitting. Production uses 3600.
const SETTLEMENT_WINDOW = 120n
const BRIDGE_TTL = 60
const BRIDGE_AMOUNT = 10_000_000n // 10 TUSDC (6 decimals)
const BRIDGE_PAYOUT = 10_000_000_000_000_000n // 0.01 tBOT
const SWAP_USDT_IN = 10_000_000n // 10 USDT
const SWAP_BOT_OUT = 20_000_000_000_000_000n // 0.02 tBOT
const SWAP_BOT_IN = 20_000_000_000_000_000n // 0.02 tBOT
const SWAP_USDT_OUT = 9_800_000n // 9.8 USDT, 50 bps spread

const STATE_PATH = 'deploy/deployments/testnet-e2e.json'
const MANIFEST_PATH = 'deploy/deployments/testnet.json'
const ARTIFACT_ROOT = process.env.BOTCONTRACTS_OUT ?? '/tmp/botcontracts-out'

const ERC20 = parseAbi([
  'function mint(address to, uint256 amount)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
])

const BRIDGE_READS = parseAbi([
  'function owner() view returns (address)',
  'function broker() view returns (address)',
  'function operator() view returns (address)',
  'function botChainId() view returns (uint256)',
  'function settlementWindow() view returns (uint64)',
  'function domainSeparator() view returns (bytes32)',
  'function quoteDigest((address token,uint256 amountIn,address trader,uint256 destChainId,address destToken,address destAccount,uint256 minOut,uint256 feeBps,uint256 expiresAt,uint256 nonce) quote) view returns (bytes32)',
  'function quoteIdOf((address token,uint256 amountIn,address trader,uint256 destChainId,address destToken,address destAccount,uint256 minOut,uint256 feeBps,uint256 expiresAt,uint256 nonce) quote) view returns (bytes32)',
  'function escrowOf(bytes32 quoteId) view returns (address depositor,address token,uint256 amountIn,uint256 destChainId,address destToken,address destAccount,uint256 minOut,uint256 feeBps,uint64 depositedAt,uint64 expiresAt,uint64 releaseDeadline,bool released,bool refunded,bytes32 botPayoutRef)',
  'function canRefund(bytes32 quoteId) view returns (bool)',
])

const SWAP_READS = parseAbi([
  'function owner() view returns (address)',
  'function broker() view returns (address)',
  'function domainSeparator() view returns (bytes32)',
  'function quoteDigest((address tokenIn,uint256 amountIn,address tokenOut,uint256 amountOut,address trader,address recipient,uint256 minOut,uint256 feeBps,uint256 expiresAt,uint256 nonce) quote) view returns (bytes32)',
  'function inventory(address token) view returns (uint256)',
  'function isQuoteUsed(bytes32 quoteId) view returns (bool)',
])

// --------------------------------------------------------------------------- state

interface Proof {
  quoteId?: Hex
  digest?: Hex
  digestMatches?: boolean
  approveTx?: Hex
  depositTx?: Hex
  payoutTx?: Hex
  releaseTx?: Hex
  refundTx?: Hex
  swapTx?: Hex
  notes?: string
  [key: string]: unknown
}

interface State {
  deployer: string
  deployment: {
    hub?: { address: Address; txHash: Hex; chainId: number; settlementWindow: string; botChainId: string }
    escrow?: { address: Address; txHash: Hex; chainId: number }
    testToken?: Address
    completedAt?: string
  }
  prepare: {
    mint?: Record<string, Hex>
    tbot?: Record<string, Hex>
    usdt?: Record<string, Hex>
    inventory?: { native?: Hex; usdt?: Hex }
    completedAt?: string
  }
  bridge: Record<string, Proof>
  refund: Record<string, Proof>
  swap: Record<string, Proof>
}

function loadState(): State {
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8')) as State
  } catch {
    return { deployer: '', deployment: {}, prepare: {}, bridge: {}, refund: {}, swap: {} }
  }
}

const state = loadState()

function saveState(): void {
  writeFileSync(
    STATE_PATH,
    `${JSON.stringify(state, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)}\n`,
  )
}

// --------------------------------------------------------------------------- accounts

function loadAccounts(): { funder: PrivateKeyAccount; wallets: PrivateKeyAccount[] } {
  let funderKey = process.env.DEPLOYER_PRIVATE_KEY
  let walletKeys = process.env.TESTNET_WALLET_KEYS?.split(',').map((k) => k.trim()).filter(Boolean)

  if (!funderKey || !walletKeys?.length) {
    const file = process.env.TESTNET_ACCOUNTS_FILE ?? '/tmp/botchain-test-accounts/accounts.json'
    const raw = JSON.parse(readFileSync(file, 'utf8')) as {
      funder: { privateKey: string }
      testAccounts: { privateKey: string }[]
    }
    funderKey = funderKey ?? raw.funder.privateKey
    walletKeys = walletKeys ?? raw.testAccounts.map((account) => account.privateKey)
  }

  if (walletKeys.length < 6) throw new Error(`need 6 test wallets, got ${walletKeys.length}`)
  const normalize = (key: string): Hex => (key.startsWith('0x') ? key : `0x${key}`) as Hex
  return {
    funder: privateKeyToAccount(normalize(funderKey)),
    wallets: walletKeys.map((key) => privateKeyToAccount(normalize(key))),
  }
}

const { funder, wallets } = loadAccounts()

// --------------------------------------------------------------------------- clients

const bot: PublicClient = createPublicClient({
  transport: http(BOT_RPC, { timeout: 30_000, retryCount: 2, retryDelay: 1_000 }),
})
const arb: PublicClient = createPublicClient({
  transport: http(ARB_RPC, { timeout: 30_000, retryCount: 2, retryDelay: 1_000 }),
})

const logger = (client: PublicClient, label: string) => ({ client, label })

async function confirm(client: PublicClient, hash: Hex, label: string, seconds = 60): Promise<Hex> {
  try {
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: seconds * 1_000, pollingInterval: 1_500 })
    if (receipt.status !== 'success') throw new Error(`${label}: reverted (${hash})`)
    return hash
  } catch (error) {
    if (error instanceof Error && /reverted/.test(error.message)) throw error
    console.log(`  ${label}: broadcast ${hash}, receipt not returned within ${seconds}s`)
    return hash
  }
}

/// Sign locally and submit the raw bytes. Signing before sending means a retry after a dropped
/// connection resubmits the same transaction instead of creating a second one with a new nonce.
async function send(
  target: { client: PublicClient; label: string },
  account: PrivateKeyAccount,
  chainId: number,
  tx: { to?: Address; data?: Hex; value?: bigint; gas?: bigint; label: string },
): Promise<Hex> {
  const { client, label } = target
  const nonce = await client.getTransactionCount({ address: account.address, blockTag: 'pending' })
  // The public Arbitrum Sepolia endpoint rejects eth_estimateGas for contract creation, so
  // creations carry an explicit limit measured from the local anvil run plus a wide margin.
  // Calls keep estimating, because a revert there is real information.
  const gas =
    tx.gas ??
    (await client
      .estimateGas({ account: account.address, to: tx.to, data: tx.data, value: tx.value })
      .catch((error) => {
        if (tx.to) throw error
        console.log('  estimate unavailable for creation, using the measured limit')
        return 3_000_000n
      }))
  const gasPrice = ((await client.getGasPrice()) * 15n) / 10n
  const raw = await account.signTransaction({
    chainId,
    nonce,
    gas,
    gasPrice,
    to: tx.to,
    data: tx.data,
    value: tx.value ?? 0n,
    type: 'legacy',
  })
  const hash = keccak256(raw)

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      await client.sendRawTransaction({ serializedTransaction: raw })
      break
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const mined = (await client.getTransactionCount({ address: account.address })) > nonce
      if (mined || /already known|known transaction|nonce too low/i.test(message)) break
      if (attempt === 4) throw new Error(`${label}: could not broadcast (${message})`)
      await new Promise((resolve) => setTimeout(resolve, 2_000))
    }
  }

  console.log(`  ${label}: ${hash} (gas ${gas}, ${label === 'BOT' ? 'BOT testnet' : 'Arb Sepolia'})`)
  return confirm(client, hash, `${label} tx`, 90)
}

// --------------------------------------------------------------------------- artifacts

function artifact(name: string): { abi: any[]; bytecode: Hex } {
  const stack = [ARTIFACT_ROOT]
  while (stack.length > 0) {
    const dir = stack.pop() as string
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        stack.push(join(dir, entry.name))
        continue
      }
      if (entry.name !== `${name}.json`) continue
      const json = JSON.parse(readFileSync(join(dir, entry.name), 'utf8')) as {
        abi: any[]
        bytecode: { object: string }
      }
      const code = json.bytecode.object
      if (!code) continue
      return { abi: json.abi, bytecode: (code.startsWith('0x') ? code : `0x${code}`) as Hex }
    }
  }
  throw new Error(`artifact ${name}.json not found under ${ARTIFACT_ROOT}; run forge build`)
}

async function deployContract(
  target: { client: PublicClient; label: string },
  account: PrivateKeyAccount,
  chainId: number,
  name: string,
  args: unknown[],
  label: string,
): Promise<{ address: Address; hash: Hex; gasUsed: bigint }> {
  const { abi, bytecode } = artifact(name)
  const data = encodeDeployData({ abi, bytecode, args: args as never })
  const hash = await send(target, account, chainId, {
    data,
    gas: name === 'BotBridgeHub' ? 2_400_000n : 2_000_000n,
    label,
  })
  const receipt = await target.client.getTransactionReceipt({ hash })
  if (!receipt?.contractAddress) throw new Error(`${label}: no contract address for ${hash}`)
  return { address: receipt.contractAddress, hash, gasUsed: receipt.gasUsed }
}

// --------------------------------------------------------------------------- deploy

async function deploy(): Promise<void> {
  const [botId, arbId] = await Promise.all([bot.getChainId(), arb.getChainId()])
  console.log(`BOT testnet chain id ${botId}, Arb Sepolia chain id ${arbId}`)
  if (botId !== BOT_CHAIN_ID || arbId !== ARB_CHAIN_ID) throw new Error('unexpected chain id')

  const [botBalance, arbBalance] = await Promise.all([
    bot.getBalance({ address: funder.address }),
    arb.getBalance({ address: funder.address }),
  ])
  console.log(`deployer ${funder.address}: ${botBalance} wei tBOT, ${arbBalance} wei ETH`)
  if (botBalance === 0n) throw new Error('deployer has no tBOT')
  if (arbBalance === 0n) throw new Error('deployer has no Sepolia ETH')

  console.log('\nBotBridgeHub -> Arbitrum Sepolia')
  const hub = await deployContract(
    logger(arb, 'Arb Sepolia'),
    funder,
    ARB_CHAIN_ID,
    'BotBridgeHub',
    [funder.address, funder.address, funder.address, BigInt(BOT_CHAIN_ID), SETTLEMENT_WINDOW],
    'deploy BotBridgeHub',
  )
  console.log(`  address ${hub.address}  gas ${hub.gasUsed}`)

  console.log('\nBotSwapEscrow -> BOT Chain testnet')
  const escrow = await deployContract(
    logger(bot, 'BOT'),
    funder,
    BOT_CHAIN_ID,
    'BotSwapEscrow',
    [funder.address, funder.address],
    'deploy BotSwapEscrow',
  )
  console.log(`  address ${escrow.address}  gas ${escrow.gasUsed}`)

  // Constructors are the only place the terms are set, so compare them against the TypeScript
  // EIP-712 domains. A mismatch here would make every live quote unusable.
  const [hubOwner, hubBroker, hubOperator, hubChainId, hubWindow, hubDomain, escrowOwner, escrowBroker, escrowDomain] =
    await Promise.all([
      arb.readContract({ address: hub.address, abi: BRIDGE_READS, functionName: 'owner' }),
      arb.readContract({ address: hub.address, abi: BRIDGE_READS, functionName: 'broker' }),
      arb.readContract({ address: hub.address, abi: BRIDGE_READS, functionName: 'operator' }),
      arb.readContract({ address: hub.address, abi: BRIDGE_READS, functionName: 'botChainId' }),
      arb.readContract({ address: hub.address, abi: BRIDGE_READS, functionName: 'settlementWindow' }),
      arb.readContract({ address: hub.address, abi: BRIDGE_READS, functionName: 'domainSeparator' }),
      bot.readContract({ address: escrow.address, abi: SWAP_READS, functionName: 'owner' }),
      bot.readContract({ address: escrow.address, abi: SWAP_READS, functionName: 'broker' }),
      bot.readContract({ address: escrow.address, abi: SWAP_READS, functionName: 'domainSeparator' }),
    ])

  const checks: [string, boolean][] = [
    ['hub owner', hubOwner.toLowerCase() === funder.address.toLowerCase()],
    ['hub broker', hubBroker.toLowerCase() === funder.address.toLowerCase()],
    ['hub operator', hubOperator.toLowerCase() === funder.address.toLowerCase()],
    ['hub botChainId 968', hubChainId === 968n],
    ['hub settlementWindow', hubWindow === SETTLEMENT_WINDOW],
    ['escrow owner', escrowOwner.toLowerCase() === funder.address.toLowerCase()],
    ['escrow broker', escrowBroker.toLowerCase() === funder.address.toLowerCase()],
    [
      'hub domain separator matches TypeScript',
      hubDomain === domainSeparator(bridgeDomain({ chainId: ARB_CHAIN_ID, verifyingContract: hub.address })),
    ],
    [
      'escrow domain separator matches TypeScript',
      escrowDomain === domainSeparator(swapDomain({ chainId: BOT_CHAIN_ID, verifyingContract: escrow.address })),
    ],
  ]
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`)
    if (!ok) throw new Error(`deployment check failed: ${name}`)
  }

  state.deployer = funder.address
  state.deployment.hub = {
    address: hub.address,
    txHash: hub.hash,
    chainId: ARB_CHAIN_ID,
    settlementWindow: SETTLEMENT_WINDOW.toString(),
    botChainId: String(BOT_CHAIN_ID),
  }
  state.deployment.escrow = { address: escrow.address, txHash: escrow.hash, chainId: BOT_CHAIN_ID }
  state.deployment.completedAt = new Date().toISOString()
  saveState()

  writeFileSync(
    MANIFEST_PATH,
    `${JSON.stringify(
      {
        network: 'testnet',
        deployedAt: new Date().toISOString(),
        deployer: funder.address,
        contracts: {
          BotBridgeHub: {
            address: hub.address,
            chainId: ARB_CHAIN_ID,
            txHash: hub.hash,
            gasUsed: hub.gasUsed.toString(),
            constructorArgs: [funder.address, funder.address, funder.address, String(BOT_CHAIN_ID), SETTLEMENT_WINDOW.toString()],
          },
          BotSwapEscrow: {
            address: escrow.address,
            chainId: BOT_CHAIN_ID,
            txHash: escrow.hash,
            gasUsed: escrow.gasUsed.toString(),
            constructorArgs: [funder.address, funder.address],
          },
        },
      },
      null,
      2,
    )}\n`,
  )
  console.log(`\nwrote ${MANIFEST_PATH} and ${STATE_PATH}`)
}

// --------------------------------------------------------------------------- prepare

async function deployTestToken(): Promise<Address> {
  if (state.deployment.testToken) return state.deployment.testToken
  const token = await deployContract(
    logger(arb, 'Arb Sepolia'),
    funder,
    ARB_CHAIN_ID,
    'MockERC20',
    ['Test USD', 'TUSDC', 6],
    'deploy test ERC-20 on Arb Sepolia',
  )
  state.deployment.testToken = token.address
  saveState()
  console.log(`  test token ${token.address}`)
  return token.address
}

const need = (value: Address | undefined, label: string): Address => {
  if (!value) throw new Error(`${label} missing; run the deploy stage first`)
  return value
}

async function prepare(): Promise<void> {
  const hub = need(state.deployment.hub?.address, 'hub address')
  const escrow = need(state.deployment.escrow?.address, 'escrow address')
  const token = await deployTestToken()

  console.log('\nminting test ERC-20 to the six wallets on Arbitrum Sepolia')
  state.prepare.mint ??= {}
  for (const wallet of wallets) {
    state.prepare.mint[wallet.address] = await send(
      logger(arb, 'Arb Sepolia'),
      funder,
      ARB_CHAIN_ID,
      {
        to: token,
        data: encodeMint(wallet.address, 1_000_000_000n),
        label: `mint to ${wallet.address.slice(0, 10)}`,
      },
    )
    saveState()
  }

  console.log('\nfunding wallets with tBOT and USDT on BOT testnet')
  state.prepare.tbot ??= {}
  state.prepare.usdt ??= {}
  for (const wallet of wallets) {
    state.prepare.tbot[wallet.address] = await send(logger(bot, 'BOT'), funder, BOT_CHAIN_ID, {
      to: wallet.address,
      value: 400_000_000_000_000_000n, // 0.4 tBOT
      label: `tBOT -> ${wallet.address.slice(0, 10)}`,
    })
    state.prepare.usdt[wallet.address] = await send(logger(bot, 'BOT'), funder, BOT_CHAIN_ID, {
      to: BOT_USDT,
      data: encodeTransfer(wallet.address, 50_000_000n), // 50 USDT
      label: `USDT -> ${wallet.address.slice(0, 10)}`,
    })
    saveState()
  }

  console.log('\nfunding swap inventory on the escrow')
  state.prepare.inventory ??= {}
  state.prepare.inventory.native = await send(logger(bot, 'BOT'), funder, BOT_CHAIN_ID, {
    to: escrow,
    value: 1_000_000_000_000_000_000n, // 1 tBOT
    label: 'inventory 1 tBOT -> escrow',
  })
  state.prepare.inventory.usdt = await send(logger(bot, 'BOT'), funder, BOT_CHAIN_ID, {
    to: BOT_USDT,
    data: encodeTransfer(escrow, 300_000_000n), // 300 USDT
    label: 'inventory 300 USDT -> escrow',
  })

  const [usdtIn, nativeIn, walletTbot, walletUsdt, escrowBalance] = await Promise.all([
    bot.readContract({ address: escrow, abi: SWAP_READS, functionName: 'inventory', args: [BOT_USDT] }),
    bot.readContract({ address: escrow, abi: SWAP_READS, functionName: 'inventory', args: [NATIVE] }),
    bot.getBalance({ address: wallets[0].address }),
    bot.readContract({ address: BOT_USDT, abi: ERC20, functionName: 'balanceOf', args: [wallets[0].address] }),
    arb.getBalance({ address: hub }),
  ])
  console.log(
    `  escrow inventory: ${usdtIn} USDT base units, ${nativeIn} wei native; wallet[0] ${walletTbot} wei / ${walletUsdt} USDT`,
  )
  console.log(`  hub escrow balance on Arb: ${escrowBalance} wei`)
  if (usdtIn < 250_000_000n || nativeIn < 900_000_000_000_000_000n) throw new Error('inventory funding incomplete')

  state.prepare.completedAt = new Date().toISOString()
  saveState()
  console.log(`\nprepare complete, results in ${STATE_PATH}`)
}

const TRANSFER_ABI = parseAbi(['function transfer(address to, uint256 amount) returns (bool)'])

function encodeMint(to: Address, amount: bigint): Hex {
  return encodeFunctionData({ abi: ERC20, functionName: 'mint', args: [to, amount] })
}

function encodeTransfer(to: Address, amount: bigint): Hex {
  return encodeFunctionData({ abi: TRANSFER_ABI, functionName: 'transfer', args: [to, amount] })
}

// --------------------------------------------------------------------------- bridge

async function runBridge(): Promise<void> {
  const hub = need(state.deployment.hub?.address, 'hub address')
  const token = need(state.deployment.testToken, 'test token address')

  // Five wallets deposit and are released; the sixth is used for the refund path.
  for (const [index, wallet] of wallets.entries()) {
    if (index === 5) continue
    const key = `wallet_${index}`
    if (state.bridge[key]?.releaseTx) {
      console.log(`wallet_${index}: already released, skipping`)
      continue
    }
    console.log(`\nbridge wallet_${index} ${wallet.address}`)
    const proof: Proof = state.bridge[key] ?? {}

    const quote = buildBridgeQuote({
      token,
      amountIn: BRIDGE_AMOUNT,
      trader: wallet.address,
      destChainId: BigInt(BOT_CHAIN_ID),
      destToken: NATIVE,
      destAccount: wallet.address,
      minOut: 9_000_000_000_000_000n,
      feeBps: 50,
      ttlSeconds: BRIDGE_TTL,
    })
    const signed = await signBridge(funder, quote, { chainId: ARB_CHAIN_ID, verifyingContract: hub })
    if (!(await verifyBridge(signed, funder.address))) throw new Error('bridge signature does not recover to the broker')

    const onChainDigest = await arb.readContract({
      address: hub,
      abi: BRIDGE_READS,
      functionName: 'quoteDigest',
      args: [quote],
    })
    if (onChainDigest !== signed.digest) throw new Error('bridge digest mismatch against the live hub')

    proof.quoteId = signed.quoteId
    proof.digest = signed.digest
    proof.digestMatches = true
    proof.amountIn = BRIDGE_AMOUNT.toString()
    proof.destAccount = wallet.address

    proof.approveTx = await send(logger(arb, 'Arb Sepolia'), wallet, ARB_CHAIN_ID, {
      to: token,
      data: encodeApprove(hub, BRIDGE_AMOUNT),
      label: `approve hub (wallet_${index})`,
    })
    const deposit = bridgeDepositCall(hub, signed)
    proof.depositTx = await send(logger(arb, 'Arb Sepolia'), wallet, ARB_CHAIN_ID, {
      to: deposit.to,
      data: deposit.data,
      label: `deposit (wallet_${index})`,
    })

    const escrow = await arb.readContract({
      address: hub,
      abi: BRIDGE_READS,
      functionName: 'escrowOf',
      args: [signed.quoteId],
    })
    proof.escrowDepositor = escrow[0]
    proof.releaseDeadline = Number(escrow[10])
    if (escrow[0].toLowerCase() !== wallet.address.toLowerCase()) throw new Error('deposit recorded the wrong depositor')
    if (escrow[2] !== BRIDGE_AMOUNT) throw new Error('deposit recorded the wrong amount')
    saveState()

    // The BOT side: operator pays the quoted destination from inventory, then anchors the hash.
    proof.payoutTx = await send(logger(bot, 'BOT'), funder, BOT_CHAIN_ID, {
      to: quote.destAccount,
      value: BRIDGE_PAYOUT,
      label: `BOT payout (wallet_${index})`,
    })
    const release = bridgeReleaseCall(hub, signed.quoteId, proof.payoutTx as Hex)
    proof.releaseTx = await send(logger(arb, 'Arb Sepolia'), funder, ARB_CHAIN_ID, {
      to: release.to,
      data: release.data,
      label: `release (wallet_${index})`,
    })

    const settled = await arb.readContract({
      address: hub,
      abi: BRIDGE_READS,
      functionName: 'escrowOf',
      args: [signed.quoteId],
    })
    if (!settled[11]) throw new Error('escrow not marked released')
    if (settled[13].toLowerCase() !== (proof.payoutTx as Hex).toLowerCase()) {
      throw new Error('release did not anchor the BOT payout hash')
    }
    proof.released = true
    proof.botPayoutRef = settled[13]
    state.bridge[key] = proof
    saveState()
    console.log(`  released, anchored payout ${proof.payoutTx}`)
  }
}

function encodeApprove(spender: Address, amount: bigint): Hex {
  return encodeFunctionData({ abi: ERC20, functionName: 'approve', args: [spender, amount] })
}

async function runRefund(): Promise<void> {
  const hub = need(state.deployment.hub?.address, 'hub address')
  const token = need(state.deployment.testToken, 'test token address')
  const wallet = wallets[5]
  const key = 'wallet_5'
  const proof: Proof = state.refund[key] ?? {}
  console.log(`\nrefund path wallet_5 ${wallet.address}`)

  if (!proof.depositTx) {
    const quote: BridgeQuote = buildBridgeQuote({
      token,
      amountIn: BRIDGE_AMOUNT,
      trader: wallet.address,
      destChainId: BigInt(BOT_CHAIN_ID),
      destToken: NATIVE,
      destAccount: wallet.address,
      minOut: 9_000_000_000_000_000n,
      feeBps: 50,
      ttlSeconds: BRIDGE_TTL,
    })
    const signed = await signBridge(funder, quote, { chainId: ARB_CHAIN_ID, verifyingContract: hub })
    proof.quoteId = signed.quoteId
    proof.digest = signed.digest
    proof.digestMatches =
      (await arb.readContract({ address: hub, abi: BRIDGE_READS, functionName: 'quoteDigest', args: [quote] })) === signed.digest
    proof.approveTx = await send(logger(arb, 'Arb Sepolia'), wallet, ARB_CHAIN_ID, {
      to: token,
      data: encodeApprove(hub, BRIDGE_AMOUNT),
      label: 'approve hub (refund wallet)',
    })
    const deposit = bridgeDepositCall(hub, signed)
    proof.depositTx = await send(logger(arb, 'Arb Sepolia'), wallet, ARB_CHAIN_ID, {
      to: deposit.to,
      data: deposit.data,
      label: 'deposit (refund wallet)',
    })
    const escrow = await arb.readContract({
      address: hub,
      abi: BRIDGE_READS,
      functionName: 'escrowOf',
      args: [signed.quoteId],
    })
    proof.releaseDeadline = Number(escrow[10])
    state.refund[key] = proof
    saveState()
  }

  const quoteId = proof.quoteId as Hex
  const deadline = Number(proof.releaseDeadline)

  for (let waited = 0; ; waited += 20) {
    const block = await arb.getBlock({ blockTag: 'latest' })
    const remaining = deadline - Number(block.timestamp) + 2
    if (remaining <= 0) break
    if (waited > 600) throw new Error(`refund window never opened (deadline ${deadline})`)
    console.log(`  waiting ${remaining}s for the release window to close`)
    await new Promise((resolve) => setTimeout(resolve, Math.min(remaining, 60) * 1_000))
  }

  if (!proof.refundTx) {
    const refund = bridgeRefundCall(hub, quoteId)
    proof.refundTx = await send(logger(arb, 'Arb Sepolia'), wallet, ARB_CHAIN_ID, {
      to: refund.to,
      data: refund.data,
      label: 'refund',
    })
    const escrow = await arb.readContract({ address: hub, abi: BRIDGE_READS, functionName: 'escrowOf', args: [quoteId] })
    if (!escrow[12]) throw new Error('escrow not marked refunded')
    if (escrow[2] !== 0n) throw new Error('refunded escrow still holds a balance')
    proof.refunded = true
    state.refund[key] = proof
    saveState()
    console.log(`  refunded ${proof.refundTx}`)
  }
}

// --------------------------------------------------------------------------- swap

async function runSwap(): Promise<void> {
  const escrow = need(state.deployment.escrow?.address, 'escrow address')

  for (const [index, wallet] of wallets.entries()) {
    const key = `wallet_${index}`
    if (state.swap[key]?.swapTx) {
      console.log(`wallet_${index}: swap already recorded, skipping`)
      continue
    }
    const sellUsdt = index < 3
    console.log(`\nswap wallet_${index} ${wallet.address}: ${sellUsdt ? 'USDT -> BOT' : 'BOT -> USDT'}`)
    const proof: Proof = state.swap[key] ?? {}

    if (sellUsdt) {
      const quote: SwapQuote = buildSwapQuote({
        tokenIn: BOT_USDT,
        amountIn: SWAP_USDT_IN,
        tokenOut: NATIVE,
        amountOut: SWAP_BOT_OUT,
        trader: wallet.address,
        feeBps: 50,
      })
      const signed = await signSwap(funder, quote, { chainId: BOT_CHAIN_ID, verifyingContract: escrow })
      proof.quoteId = signed.quoteId
      proof.digest = signed.digest
      proof.digestMatches =
        (await bot.readContract({ address: escrow, abi: SWAP_READS, functionName: 'quoteDigest', args: [quote] })) ===
        signed.digest
      proof.approveTx = await send(logger(bot, 'BOT'), wallet, BOT_CHAIN_ID, {
        to: BOT_USDT,
        data: encodeApprove(escrow, SWAP_USDT_IN),
        label: `approve escrow (wallet_${index})`,
      })
      const nativeBefore = await bot.getBalance({ address: wallet.address })
      const call = swapCall(escrow, signed)
      proof.swapTx = await send(logger(bot, 'BOT'), wallet, BOT_CHAIN_ID, {
        to: call.to,
        data: call.data,
        label: `swap USDT->BOT (wallet_${index})`,
      })
      const nativeAfter = await bot.getBalance({ address: wallet.address })
      proof.nativeDelta = (nativeAfter - nativeBefore).toString()
      proof.tokenIn = 'USDT'
      proof.tokenOut = 'BOT'
    } else {
      const quote: SwapQuote = buildSwapQuote({
        tokenIn: NATIVE,
        amountIn: SWAP_BOT_IN,
        tokenOut: BOT_USDT,
        amountOut: SWAP_USDT_OUT,
        trader: wallet.address,
        feeBps: 50,
      })
      const signed = await signSwap(funder, quote, { chainId: BOT_CHAIN_ID, verifyingContract: escrow })
      proof.quoteId = signed.quoteId
      proof.digest = signed.digest
      proof.digestMatches =
        (await bot.readContract({ address: escrow, abi: SWAP_READS, functionName: 'quoteDigest', args: [quote] })) ===
        signed.digest
      const usdtBefore = await bot.readContract({ address: BOT_USDT, abi: ERC20, functionName: 'balanceOf', args: [wallet.address] })
      const nativeBefore = await bot.getBalance({ address: wallet.address })
      const call = swapCall(escrow, signed)
      proof.swapTx = await send(logger(bot, 'BOT'), wallet, BOT_CHAIN_ID, {
        to: call.to,
        data: call.data,
        value: call.value,
        label: `swap BOT->USDT (wallet_${index})`,
      })
      const usdtAfter = await bot.readContract({ address: BOT_USDT, abi: ERC20, functionName: 'balanceOf', args: [wallet.address] })
      proof.usdtDelta = (usdtAfter - usdtBefore).toString()
      proof.nativeDelta = (nativeBefore - (await bot.getBalance({ address: wallet.address }))).toString()
      proof.tokenIn = 'BOT'
      proof.tokenOut = 'USDT'
    }

    const used = await bot.readContract({
      address: escrow,
      abi: SWAP_READS,
      functionName: 'isQuoteUsed',
      args: [proof.quoteId as Hex],
    })
    if (!used) throw new Error('swap did not mark the quote used')
    proof.confirmed = true
    state.swap[key] = proof
    saveState()
    console.log(`  swap recorded ${proof.swapTx}`)
  }
}

// --------------------------------------------------------------------------- status

async function status(): Promise<void> {
  console.log(`state file ${STATE_PATH}\n${JSON.stringify(state, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)}`)
}

// --------------------------------------------------------------------------- main

async function main(): Promise<void> {
  const stage = process.argv[2]
  if (stage === 'deploy') return deploy()
  if (stage === 'prepare') return prepare()
  if (stage === 'bridge') return runBridge()
  if (stage === 'refund') return runRefund()
  if (stage === 'swap') return runSwap()
  if (stage === 'status') return status()
  console.log('usage: npx tsx test/e2e/testnet.e2e.ts <deploy|prepare|bridge|refund|swap|status>')
  process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
