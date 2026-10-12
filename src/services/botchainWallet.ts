import { getContract, prepareContractCall, readContract, type ThirdwebContract } from 'thirdweb';
import { privateKeyToAccount } from 'thirdweb/wallets';
import { createUnsignedUserOp, signUserOp } from 'thirdweb/wallets/smart';
import { encodeFunctionData, parseAbi, type Hex } from 'viem';
import { getUserOperationHash } from 'viem/account-abstraction';
import { client } from './auth';
import { BOT_ENTRY_POINT, BOT_FACTORY, BOT_SALT, getBotConfig, type BotNetwork, type BotToken } from '../config/botchain';
import { ChainAccount } from '../models/chainAccount';
import { botRpc } from './botchainRpc';
import { parseAmount, formatAmount } from '../utils/amounts';

export function botAccountOverrides(network: BotNetwork) {
  const n = getBotConfig(network);
  return {
    bundlerUrl: n.bundler,
    entrypointAddress: BOT_ENTRY_POINT,
    predictAddress: (factory: ThirdwebContract, owner: string) => readContract({ contract: factory, method: 'function getAddress(address owner, uint256 salt) view returns (address)', params: [owner, BOT_SALT] }),
    createAccount: (factory: ThirdwebContract, owner: string) => prepareContractCall({ contract: factory, method: 'function createAccount(address owner, uint256 salt) returns (address)', params: [owner, BOT_SALT] }),
    getAccountNonce: (account: ThirdwebContract) => readContract({ contract: getContract({ client: account.client, chain: n.chain, address: BOT_ENTRY_POINT }), method: 'function getNonce(address sender, uint192 key) view returns (uint256)', params: [account.address, 0n] }),
  };
}
// The public BOT RPC drops the occasional connection (observed ETIMEDOUT bursts);
// these reads are idempotent, so one quick retry keeps a flaky response from
// surfacing as a user-visible failure. Writes never go through this helper.
async function withRpcRetry<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    await new Promise(resolve => setTimeout(resolve, 400));
    return operation();
  }
}
export async function resolveBotAccount(owner: { _id: unknown; privateKey: string }, network: BotNetwork, ownerType: 'user' | 'business' = 'user') {
  const n = getBotConfig(network);
  if (!n.enabled) throw new Error('BOT network is not enabled');
  const admin = privateKeyToAccount({ client, privateKey: owner.privateKey });
  const factory = getContract({ client, chain: n.chain, address: BOT_FACTORY });
  const address = await withRpcRetry(() => botAccountOverrides(network).predictAddress(factory, admin.address));
  const identity = { ownerId: owner._id, ownerType, chainId: n.id };
  let record = await ChainAccount.findOne(identity);
  if (!record) {
    try { record = await ChainAccount.create({ ...identity, address, ownerAddress: admin.address, factory: BOT_FACTORY, entryPoint: BOT_ENTRY_POINT, salt: BOT_SALT.toString() }); }
    catch (error: any) { if (error.code !== 11000) throw error; record = await ChainAccount.findOne(identity); }
  }
  if (!record || record.address.toLowerCase() !== address.toLowerCase() || record.factory.toLowerCase() !== BOT_FACTORY.toLowerCase() || record.salt !== BOT_SALT.toString() || record.entryPoint.toLowerCase() !== BOT_ENTRY_POINT.toLowerCase()) throw new Error('Stored BOT account differs from configured account; migration required');
  return { address, ownerAddress: admin.address, factory: BOT_FACTORY, entryPoint: BOT_ENTRY_POINT, salt: BOT_SALT.toString(), chainId: n.id, network, gasMode: 'self-funded' };
}
export async function assertBotInfrastructure(network: BotNetwork) {
  const n = getBotConfig(network);
  const [chainId, bundlerChain, entries, factoryCode, entryCode] = await Promise.all([
    botRpc<Hex>(n.rpc, 'eth_chainId'), botRpc<Hex>(n.bundler, 'eth_chainId'), botRpc<string[]>(n.bundler, 'eth_supportedEntryPoints'),
    botRpc<Hex>(n.rpc, 'eth_getCode', [BOT_FACTORY, 'latest']), botRpc<Hex>(n.rpc, 'eth_getCode', [BOT_ENTRY_POINT, 'latest']),
  ]);
  if (Number(chainId) !== n.id || Number(bundlerChain) !== n.id || !entries.some(e => e.toLowerCase() === BOT_ENTRY_POINT.toLowerCase()) || factoryCode === '0x' || entryCode === '0x') throw new Error('BOT infrastructure does not match configured chain/account contracts');
}
export async function getBotBalances(network: BotNetwork, address: string) {
  const n = getBotConfig(network);
  return Promise.all(Object.values(n.tokens).map(async token => {
    const units = token.address
      ? await withRpcRetry(() => readContract({ contract: getContract({ client, chain: n.chain, address: token.address! }), method: 'function balanceOf(address account) view returns (uint256)', params: [address] }))
      : BigInt(await withRpcRetry(() => botRpc<Hex>(n.rpc, 'eth_getBalance', [address, 'latest'])));
    return { ...token, balance: formatAmount(units, token.decimals), balanceUnits: units.toString() };
  }));
}
export async function prepareBotTransfer(network: BotNetwork, privateKey: string, sender: string, recipient: string, symbol: BotToken, amount: string) {
  const n = getBotConfig(network);
  if (!n.transfersEnabled) throw new Error('Transfers are not enabled on this BOT network');
  await assertBotInfrastructure(network);
  const token = n.tokens[symbol];
  if (!token) throw new Error('Unsupported BOT asset');
  const units = parseAmount(amount, token.decimals);
  const contract = getContract({ client, chain: n.chain, address: sender });
  const overrides = botAccountOverrides(network);
  const factory = getContract({ client, chain: n.chain, address: BOT_FACTORY });
  const admin = privateKeyToAccount({ client, privateKey });
  const predicted = await overrides.predictAddress(factory, admin.address);
  if (predicted.toLowerCase() !== sender.toLowerCase()) throw new Error('BOT sender does not match signing account');
  if (token.address) {
    const actualDecimals = await readContract({ contract: getContract({ client, chain: n.chain, address: token.address }), method: 'function decimals() view returns (uint8)' });
    if (actualDecimals !== token.decimals) throw new Error('BOT token metadata changed');
  }
  const data = token.address ? encodeFunctionData({ abi: parseAbi(['function transfer(address to, uint256 amount) returns (bool)']), functionName: 'transfer', args: [recipient as Hex, units] }) : '0x';
  const fees = await botRpc<{ maxFeePerGas: Hex; maxPriorityFeePerGas: Hex }>(n.bundler, 'skandha_getGasPrice');
  const transaction = prepareContractCall({ contract, method: 'function execute(address dest, uint256 value, bytes func)', params: [token.address || recipient, token.address ? 0n : units, data], maxFeePerGas: BigInt(fees.maxFeePerGas), maxPriorityFeePerGas: BigInt(fees.maxPriorityFeePerGas) });
  const unsigned = await createUnsignedUserOp({ transaction, factoryContract: factory, accountContract: contract, adminAddress: admin.address, sponsorGas: false, overrides });
  // Non-deploying ops: thirdweb estimates are tight for validateUserOp (AA26)
  // and bundleUserOp ships an empty factoryData that skandha rejects. Sign a
  // 3× verificationGasLimit and submit a clean v0.7 payload ourselves.
  const isDeploy = Boolean((unsigned as { factory?: unknown }).factory);
  const verificationGasLimit = BigInt(unsigned.verificationGasLimit as bigint | string) * (isDeploy ? 1n : 3n);
  const unsignedWithHeadroom = { ...unsigned, verificationGasLimit };
  const signed = await signUserOp({ client, chain: n.chain, entrypointAddress: BOT_ENTRY_POINT, adminAccount: admin, userOp: unsignedWithHeadroom });
  if (!('factoryData' in signed)) throw new Error('Expected an EntryPoint v0.7 operation');
  const userOpHash = getUserOperationHash({ chainId: n.id, entryPointAddress: BOT_ENTRY_POINT, entryPointVersion: '0.7', userOperation: { ...signed, sender: signed.sender as Hex, factory: signed.factory as Hex | undefined, paymaster: signed.paymaster as Hex | undefined } });
  const wireOp: Record<string, unknown> = {
    sender: signed.sender,
    nonce: `0x${BigInt(signed.nonce as bigint | string).toString(16)}`,
    callData: signed.callData,
    callGasLimit: `0x${BigInt(signed.callGasLimit as bigint | string).toString(16)}`,
    verificationGasLimit: `0x${BigInt(signed.verificationGasLimit as bigint | string).toString(16)}`,
    preVerificationGas: `0x${BigInt(signed.preVerificationGas as bigint | string).toString(16)}`,
    maxFeePerGas: `0x${BigInt(signed.maxFeePerGas as bigint | string).toString(16)}`,
    maxPriorityFeePerGas: `0x${BigInt(signed.maxPriorityFeePerGas as bigint | string).toString(16)}`,
    paymasterVerificationGasLimit: `0x${BigInt((signed as { paymasterVerificationGasLimit?: bigint | string }).paymasterVerificationGasLimit ?? 0n).toString(16)}`,
    paymasterPostOpGasLimit: `0x${BigInt((signed as { paymasterPostOpGasLimit?: bigint | string }).paymasterPostOpGasLimit ?? 0n).toString(16)}`,
    signature: signed.signature,
  };
  // Only attach factory/init fields when the account is still undeployed.
  if (signed.factory) {
    wireOp.factory = signed.factory;
    wireOp.factoryData = signed.factoryData;
  }
  if (signed.paymaster) {
    wireOp.paymaster = signed.paymaster;
    wireOp.paymasterData = (signed as { paymasterData?: string }).paymasterData;
  }
  return {
    userOpHash,
    submit: async () => botRpc<Hex>(n.bundler, 'eth_sendUserOperation', [wireOp, BOT_ENTRY_POINT]),
  };
}
