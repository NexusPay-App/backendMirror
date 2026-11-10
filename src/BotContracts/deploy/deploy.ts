/**
 * Testnet deployment for BotContracts.
 *
 *   npx tsx deploy/deploy.ts check    read-only: RPCs, token metadata, bytecode sizes
 *   npx tsx deploy/deploy.ts deploy   broadcast; needs DEPLOYER_PRIVATE_KEY
 *
 * The bridge hub belongs on the chain users deposit from, so on testnet that is Arbitrum
 * Sepolia (421614) bound to BOT Chain testnet (968). The swap escrow belongs on BOT Chain.
 * Nothing here runs against mainnet.
 */
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createPublicClient, createWalletClient, http, parseAbi, type Abi, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const BOT_TESTNET = {
  id: 968,
  name: 'BOT Chain Testnet',
  rpc: process.env.BOT_TESTNET_RPC_URL ?? 'https://rpc.bohr.life',
  usdt: '0x75edC9335175Fc0552D51D48439F229c10420fe3' as Address,
  explorer: 'https://scan.bohr.life',
}

const ARB_SEPOLIA = {
  id: 421614,
  name: 'Arbitrum Sepolia',
  rpc: process.env.ARBITRUM_SEPOLIA_RPC_URL ?? 'https://sepolia-rollup.arbitrum.io/rpc',
  explorer: 'https://sepolia.arbiscan.io',
}

// Addresses the rest of the product already assumes on BOT Chain.
const BOT_ENTRY_POINT = '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as Address
const BOT_FACTORY = '0xBC88d6012b3bf8426C2851d3798cEB5257658332' as Address

const ERC20 = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
])

const artifactRoot = process.env.BOTCONTRACTS_OUT ?? '/tmp/botcontracts-out'
const EIP170_LIMIT = 24_576
const EIP3860_LIMIT = 49_152

function findArtifact(name: string): { abi: Abi; bytecode: Hex; deployedSize: number; initSize: number } {
  const stack = [artifactRoot]
  while (stack.length > 0) {
    const dir = stack.pop() as string
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      throw new Error(`No build output at ${artifactRoot}. Run "forge build" in src/BotContracts first.`)
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        stack.push(join(dir, entry.name))
        continue
      }
      if (entry.name !== `${name}.json`) continue
      const artifact = JSON.parse(readFileSync(join(dir, entry.name), 'utf8'))
      const code = artifact?.bytecode?.object as string | undefined
      if (!code) continue
      const bytecode = (code.startsWith('0x') ? code : `0x${code}`) as Hex
      const initSize = bytecode.length / 2 - 1
      return { abi: artifact.abi as Abi, bytecode, initSize, deployedSize: (artifact.deployedBytecode?.object?.length ?? 0) / 2 }
    }
  }
  throw new Error(`Artifact ${name}.json not found under ${artifactRoot}`)
}

const rpc = (url: string) => createPublicClient({ transport: http(url) })

async function inspect(label: string, url: string, expectedChainId: number) {
  const client = rpc(url)
  const chainId = await client.getChainId()
  const block = await client.getBlock()
  const gasPrice = await client.getGasPrice()
  console.log(`${label}`)
  console.log(`  rpc            ${url}`)
  console.log(`  chainId        ${chainId}${chainId === expectedChainId ? '' : `  MISMATCH, expected ${expectedChainId}`}`)
  console.log(`  head block     ${block.number}`)
  console.log(`  gas price      ${Number(gasPrice) / 1e9} gwei`)
  console.log(`  block gas cap  ${block.gasLimit}`)
  return chainId === expectedChainId
}

async function check() {
  console.log('BotContracts testnet pre-flight (read-only)\n')
  const okBot = await inspect(BOT_TESTNET.name, BOT_TESTNET.rpc, BOT_TESTNET.id)
  console.log()
  const okArb = await inspect(ARB_SEPOLIA.name, ARB_SEPOLIA.rpc, ARB_SEPOLIA.id)
  console.log()

  const bot = rpc(BOT_TESTNET.rpc)
  const [name, symbol, decimals, supply] = await Promise.all([
    bot.readContract({ address: BOT_TESTNET.usdt, abi: ERC20, functionName: 'name' }),
    bot.readContract({ address: BOT_TESTNET.usdt, abi: ERC20, functionName: 'symbol' }),
    bot.readContract({ address: BOT_TESTNET.usdt, abi: ERC20, functionName: 'decimals' }),
    bot.readContract({ address: BOT_TESTNET.usdt, abi: ERC20, functionName: 'totalSupply' }),
  ])
  console.log('BOT testnet USDT')
  console.log(`  address        ${BOT_TESTNET.usdt}`)
  console.log(`  name/symbol    ${name} / ${symbol}`)
  console.log(`  decimals       ${decimals}${decimals === 6 ? '' : '  MISMATCH, BotSwapEscrow assumes 6'}`)
  console.log(`  total supply   ${supply}`)

  for (const [label, address] of [['EntryPoint', BOT_ENTRY_POINT], ['smart account factory', BOT_FACTORY]] as const) {
    const code = await bot.getCode({ address })
    console.log(`  ${label.padEnd(14)} ${address} ${code && code !== '0x' ? `${(code.length - 2) / 2} bytes` : 'NO CODE'}`)
  }
  console.log()

  for (const name of ['BotBridgeHub', 'BotSwapEscrow']) {
    const { deployedSize, initSize } = findArtifact(name)
    const sizeOk = deployedSize <= EIP170_LIMIT && initSize <= EIP3860_LIMIT
    console.log(`${name}: runtime ${deployedSize}/${EIP170_LIMIT} bytes, init ${initSize}/${EIP3860_LIMIT} bytes${sizeOk ? '' : '  OVER LIMIT'}`)
  }

  console.log(`\n${okBot && okArb ? 'RPC and token checks passed.' : 'A chain id mismatch was found, fix it before deploying.'}`)
  console.log('Broadcast needs a funded key: faucet.bohr.life/basic (tBOT) and a Sepolia ETH faucet.')
}

async function deploy() {
  const rawKey = process.env.DEPLOYER_PRIVATE_KEY
  if (!rawKey) {
    throw new Error('DEPLOYER_PRIVATE_KEY is not set. Fund a fresh key at faucet.bohr.life/basic and a Sepolia ETH faucet, then export it.')
  }
  const account = privateKeyToAccount((rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`) as Hex)
  const owner = (process.env.OWNER_ADDRESS ?? account.address) as Address
  const broker = (process.env.BROKER_ADDRESS ?? account.address) as Address
  const operator = (process.env.OPERATOR_ADDRESS ?? account.address) as Address
  const botChainId = BigInt(process.env.BOT_CHAIN_ID ?? BOT_TESTNET.id)
  const window = BigInt(process.env.SETTLEMENT_WINDOW ?? 3600)

  const arb = rpc(ARB_SEPOLIA.rpc)
  const bot = rpc(BOT_TESTNET.rpc)
  const [arbBalance, botBalance] = await Promise.all([
    arb.getBalance({ address: account.address }),
    bot.getBalance({ address: account.address }),
  ])
  console.log(`deployer        ${account.address}`)
  console.log(`  Arb Sepolia   ${arbBalance} wei`)
  console.log(`  BOT testnet   ${botBalance} wei`)
  if (arbBalance === 0n) throw new Error('No Sepolia ETH: the bridge hub cannot be deployed.')
  if (botBalance === 0n) throw new Error('No tBOT: the swap escrow cannot be deployed.')

  const hub = findArtifact('BotBridgeHub')
  const escrow = findArtifact('BotSwapEscrow')

  const arbWallet = createWalletClient({ account, transport: http(ARB_SEPOLIA.rpc) })
  const botWallet = createWalletClient({ account, transport: http(BOT_TESTNET.rpc) })

  console.log('\ndeploying BotBridgeHub on Arbitrum Sepolia')
  const hubHash = await arbWallet.deployContract({
    abi: hub.abi,
    bytecode: hub.bytecode,
    args: [owner, broker, operator, botChainId, window],
    chain: null,
  })
  const hubReceipt = await arb.waitForTransactionReceipt({ hash: hubHash })
  if (!hubReceipt.contractAddress) throw new Error('BotBridgeHub deployment produced no address')
  console.log(`  ${hubReceipt.contractAddress}  gas ${hubReceipt.gasUsed}  ${ARB_SEPOLIA.explorer}/address/${hubReceipt.contractAddress}`)

  console.log('\ndeploying BotSwapEscrow on BOT Chain testnet')
  const escrowHash = await botWallet.deployContract({
    abi: escrow.abi,
    bytecode: escrow.bytecode,
    args: [owner, broker],
    chain: null,
  })
  const escrowReceipt = await bot.waitForTransactionReceipt({ hash: escrowHash })
  if (!escrowReceipt.contractAddress) throw new Error('BotSwapEscrow deployment produced no address')
  console.log(`  ${escrowReceipt.contractAddress}  gas ${escrowReceipt.gasUsed}  ${BOT_TESTNET.explorer}/address/${escrowReceipt.contractAddress}`)

  // Read back what the constructors recorded. A wrong owner or chain binding fails here, not on
  // the first user deposit.
  const hubAddress = hubReceipt.contractAddress
  const escrowAddress = escrowReceipt.contractAddress
  const read = async (client: typeof arb, abi: Abi, address: Address, functionName: string) =>
    (await client.readContract({ address, abi, functionName } as never)) as unknown
  const expectAddress = (label: string, actual: Address, expected: Address) => {
    if (actual.toLowerCase() !== expected.toLowerCase()) {
      throw new Error(`${label} mismatch: on chain ${actual}, expected ${expected}`)
    }
  }

  expectAddress('BotBridgeHub.owner', await read(arb, hub.abi, hubAddress, 'owner') as Address, owner)
  expectAddress('BotBridgeHub.broker', await read(arb, hub.abi, hubAddress, 'broker') as Address, broker)
  expectAddress('BotBridgeHub.operator', await read(arb, hub.abi, hubAddress, 'operator') as Address, operator)
  expectAddress('BotSwapEscrow.owner', await read(bot, escrow.abi, escrowAddress, 'owner') as Address, owner)
  expectAddress('BotSwapEscrow.broker', await read(bot, escrow.abi, escrowAddress, 'broker') as Address, broker)
  const onChainBotId = await read(arb, hub.abi, hubAddress, 'botChainId') as bigint
  if (onChainBotId !== botChainId) throw new Error(`botChainId mismatch: on chain ${onChainBotId}, expected ${botChainId}`)
  console.log('\non-chain config matches the constructor arguments')

  mkdirSync('deploy/deployments', { recursive: true })
  const manifest = {
    network: 'testnet',
    deployedAt: new Date().toISOString(),
    deployer: account.address,
    contracts: {
      BotBridgeHub: {
        address: hubAddress,
        chainId: ARB_SEPOLIA.id,
        txHash: hubHash,
        gasUsed: hubReceipt.gasUsed.toString(),
        constructorArgs: [owner, broker, operator, botChainId.toString(), window.toString()],
      },
      BotSwapEscrow: {
        address: escrowAddress,
        chainId: BOT_TESTNET.id,
        txHash: escrowHash,
        gasUsed: escrowReceipt.gasUsed.toString(),
        constructorArgs: [owner, broker],
      },
    },
  }
  writeFileSync('deploy/deployments/testnet.json', `${JSON.stringify(manifest, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)}\n`)
  console.log('\nwrote deploy/deployments/testnet.json')
  console.log('Next: fund the swap escrow inventory, then build quotes with destChainId 968 and')
  console.log('sign with domain chainId 421614; expectedDestChainId 968 keeps preflight aligned.')
}

async function main() {
  const mode = process.argv[2]
  if (mode === 'check') return check()
  if (mode === 'deploy') return deploy()
  console.log('usage: npx tsx deploy/deploy.ts <check|deploy>')
  process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
