jest.mock('../src/services/botchainRpc', () => ({ botRpc: jest.fn() }));
jest.mock('../src/models/botDepositCursor', () => ({ BotDepositCursor: { findById: jest.fn(), findOneAndUpdate: jest.fn(), updateOne: jest.fn() } }));
jest.mock('../src/utils/txHistoryCache', () => ({ invalidateUserTransactionHistory: jest.fn() }));
jest.mock('../src/models/chainAccount', () => ({ ChainAccount: { find: jest.fn() } }));
jest.mock('../src/models/businessModel', () => ({ Business: { find: jest.fn() } }));
jest.mock('../src/models/botTransfer', () => ({ BotTransfer: { findOne: jest.fn(), create: jest.fn() } }));
import { botRpc } from '../src/services/botchainRpc';
import { BotDepositCursor } from '../src/models/botDepositCursor';
import { ChainAccount } from '../src/models/chainAccount';
import { Business } from '../src/models/businessModel';
import { BotTransfer } from '../src/models/botTransfer';
import { scanBotDeposits, recordBotReceipt } from '../src/services/botchainDeposits';
import { encodeEventTopics, encodeAbiParameters, parseAbi, type Hex } from 'viem';

const transferAbi = parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']);
const watchedOwner = '0x1111111111111111111111111111111111111111';
const watchedAddress = '0x2222222222222222222222222222222222222222';
const outsider = '0x3333333333333333333333333333333333333333';
const usdt = '0x75edC9335175Fc0552D51D48439F229c10420fe3'; // testnet USDT, 6 decimals

let stored: Record<string, string>;
let records: any[];
let rpc: jest.Mock;

function transferLog(from: string, to: string, value: bigint, blockNumber: bigint, txHash: string, logIndex: number) {
  return {
    address: usdt,
    topics: encodeEventTopics({ abi: transferAbi, eventName: 'Transfer', args: { from, to } }) as Hex[],
    data: encodeAbiParameters([{ type: 'uint256' }], [value]),
    blockNumber: `0x${blockNumber.toString(16)}`,
    transactionHash: txHash,
    logIndex: `0x${logIndex.toString(16)}`,
  };
}

beforeEach(() => {
  process.env.BOTCHAIN_TESTNET_ENABLED = 'true';
  process.env.BOTCHAIN_TESTNET_DEPOSIT_INDEXING_ENABLED = 'true';
  stored = {};
  records = [];
  rpc = botRpc as jest.Mock;
  (BotDepositCursor.findById as jest.Mock).mockImplementation(async (key: string) => stored[key] ? { block: Number(stored[key]) } : null);
  (BotDepositCursor.findOneAndUpdate as jest.Mock).mockResolvedValue({ lease: 'fixture' });
  (BotDepositCursor.updateOne as jest.Mock).mockImplementation(async (query, update) => {
    if (update.$max) stored[query._id] = String(Math.max(Number(stored[query._id] || 0), update.$max.block));
  });
  (ChainAccount.find as jest.Mock).mockResolvedValue([{ ownerId: 'owner-1', ownerType: 'user', address: watchedAddress }]);
  (Business.find as jest.Mock).mockResolvedValue([]);
  (BotTransfer.findOne as jest.Mock).mockReturnValue({
    sort: () => ({ select: async () => (records.length ? { blockNumber: records.filter(r => r.direction === 'incoming').map(r => r.blockNumber).sort().at(-1) } : null) }),
  });
  (BotTransfer.create as jest.Mock).mockImplementation(async (value: any) => {
    const duplicate = records.some(r => r.idempotencyKey === value.idempotencyKey);
    if (duplicate) { const error: any = new Error('duplicate'); error.code = 11000; throw error; }
    records.push({ ...value, _id: `record-${records.length}` });
    return records.at(-1);
  });
  rpc.mockImplementation(async (_url: string, method: string, params: any[]) => {
    if (method === 'eth_blockNumber') return '0x64'; // head 100, confirmations 3 → safe head 97
    if (method === 'eth_getLogs') return [];
    if (method === 'eth_getTransactionReceipt') return { status: '0x1', blockNumber: '0x5f' };
    if (method === 'eth_getBlockByNumber') return { transactions: [] };
    throw new Error(`unexpected ${method}`);
  });
});
afterEach(() => { delete process.env.BOTCHAIN_TESTNET_ENABLED; delete process.env.BOTCHAIN_TESTNET_DEPOSIT_INDEXING_ENABLED; });

test('indexes a confirmed USDT deposit into the existing BotTransfer ledger and persists the cursor', async () => {
  rpc.mockImplementation(async (_url: string, method: string, params: any[]) => {
    if (method === 'eth_blockNumber') return '0x64';
    if (method === 'eth_getLogs') return [transferLog(outsider, watchedAddress, 2_500_000n, 90n, '0x' + 'aa'.repeat(32), 3)];
    if (method === 'eth_getBlockByNumber') return { transactions: [] };
    throw new Error(`unexpected ${method}`);
  });
  const result = await scanBotDeposits('botchain-testnet');
  expect(result).not.toBeNull();
  expect(result!.tokens).toBe(1);
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    direction: 'incoming',
    status: 'confirmed',
    token: 'USDT',
    amount: '2.5',
    amountUnits: '2500000',
    sender: outsider,
    recipient: watchedAddress,
    chainId: 968,
    blockNumber: '90',
    userId: 'owner-1',
    transactionHash: '0x' + 'aa'.repeat(32),
  });
  expect(stored['botchain:deposit-cursor:botchain-testnet:token']).toBe('98');
});

test('re-scanning the same block range never duplicates a deposit', async () => {
  rpc.mockImplementation(async (_url: string, method: string) => {
    if (method === 'eth_blockNumber') return '0x64';
    if (method === 'eth_getLogs') return [transferLog(outsider, watchedAddress, 2_500_000n, 90n, '0x' + 'aa'.repeat(32), 3)];
    if (method === 'eth_getBlockByNumber') return { transactions: [] };
    throw new Error(`unexpected ${method}`);
  });
  await scanBotDeposits('botchain-testnet');
  // Simulate cursor loss (e.g. Redis flush) and a full rescan from the database watermark.
  const first = records[0];
  stored = {};
  (BotTransfer.findOne as jest.Mock).mockReturnValue({
    sort: () => ({ select: async () => ({ blockNumber: first.blockNumber }) }),
  });
  await scanBotDeposits('botchain-testnet');
  expect(records).toHaveLength(1);
  expect((BotTransfer.create as jest.Mock).mock.calls.length).toBeGreaterThan(1);
});

test('never indexes blocks below the confirmation depth', async () => {
  const seenRanges: string[] = [];
  rpc.mockImplementation(async (_url: string, method: string, params: any[]) => {
    if (method === 'eth_blockNumber') return '0x64'; // 100
    if (method === 'eth_getLogs') { seenRanges.push(`${params[0].fromBlock}..${params[0].toBlock}`); return []; }
    if (method === 'eth_getBlockByNumber') return { transactions: [] };
    throw new Error(`unexpected ${method}`);
  });
  await scanBotDeposits('botchain-testnet');
  // head 100 with 3 confirmations → block 100-2=98 (0x62) is the newest safely confirmed block.
  expect(seenRanges.every(range => range.endsWith('0x62'))).toBe(true);
});

test('indexes a native BOT transfer and ignores value-less or unknown recipients', async () => {
  process.env.BOTCHAIN_TESTNET_DEPOSIT_TOKEN_LOOKBACK = '1';
  process.env.BOTCHAIN_TESTNET_DEPOSIT_NATIVE_LOOKBACK = '20';
  rpc.mockImplementation(async (_url: string, method: string, params: any[]) => {
    if (method === 'eth_blockNumber') return '0x64';
    if (method === 'eth_getLogs') return [];
    if (method === 'eth_getTransactionReceipt') return { status: '0x1', blockNumber: '0x5f' };
    if (method === 'eth_getBlockByNumber') {
      const block = BigInt(params[0]);
      if (block === 95n) return { transactions: [
        { hash: '0x' + 'bb'.repeat(32), from: outsider, to: watchedAddress, value: '0xde0b6b3a7640000' }, // 1 BOT
        { hash: '0x' + 'cc'.repeat(32), from: outsider, to: watchedAddress, value: '0x0' },
        { hash: '0x' + 'dd'.repeat(32), from: outsider, to: outsider, value: '0x1' },
        { hash: '0x' + 'ee'.repeat(32), from: outsider, to: null, value: '0x1' },
      ] };
      return { transactions: [] };
    }
    throw new Error(`unexpected ${method}`);
  });
  const result = await scanBotDeposits('botchain-testnet');
  expect(result!.native).toBe(1);
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({ token: 'BOT', amount: '1', direction: 'incoming', blockNumber: '95', userId: 'owner-1' });
  expect(stored['botchain:deposit-cursor:botchain-testnet:native']).toBe('98');
  delete process.env.BOTCHAIN_TESTNET_DEPOSIT_TOKEN_LOOKBACK;
  delete process.env.BOTCHAIN_TESTNET_DEPOSIT_NATIVE_LOOKBACK;
});

test('a business account deposit credits the owning user and carries the merchantId', async () => {
  (ChainAccount.find as jest.Mock).mockResolvedValue([{ ownerId: 'business-1', ownerType: 'business', address: watchedAddress }]);
  (Business.find as jest.Mock).mockResolvedValue([{ _id: 'business-1', userId: 'owner-42', merchantId: 'MERCHANT-7' }]);
  rpc.mockImplementation(async (_url: string, method: string, params: any[]) => {
    if (method === 'eth_blockNumber') return '0x64';
    if (method === 'eth_getLogs') return [transferLog(outsider, watchedAddress, 1_000_000n, 92n, '0x' + 'ab'.repeat(32), 0)];
    if (method === 'eth_getBlockByNumber') return { transactions: [] };
    throw new Error(`unexpected ${method}`);
  });
  await scanBotDeposits('botchain-testnet');
  expect(records[0]).toMatchObject({ userId: 'owner-42', merchantId: 'MERCHANT-7', direction: 'incoming' });
});

test('an orphaned business account is skipped rather than credited to a guess', async () => {
  (ChainAccount.find as jest.Mock).mockResolvedValue([{ ownerId: 'business-1', ownerType: 'business', address: watchedAddress }]);
  (Business.find as jest.Mock).mockResolvedValue([]); // business deleted
  rpc.mockImplementation(async (_url: string, method: string, params: any[]) => {
    if (method === 'eth_blockNumber') return '0x64';
    if (method === 'eth_getLogs') return [transferLog(outsider, watchedAddress, 1_000_000n, 92n, '0x' + 'ab'.repeat(32), 0)];
    if (method === 'eth_getBlockByNumber') return { transactions: [] };
    throw new Error(`unexpected ${method}`);
  });
  const result = await scanBotDeposits('botchain-testnet');
  expect(result!.tokens).toBe(0);
  expect(records).toHaveLength(0);
});

test('returns null and touches no RPC when deposit indexing is disabled', async () => {
  delete process.env.BOTCHAIN_TESTNET_DEPOSIT_INDEXING_ENABLED;
  expect(await scanBotDeposits('botchain-testnet')).toBeNull();
  expect(rpc).not.toHaveBeenCalled();
});

test('mainnet deposit indexing stays off by default', async () => {
  process.env.BOTCHAIN_DEPOSIT_INDEXING_ENABLED = 'true'; // enabled flag alone is insufficient without BOTCHAIN_ENABLED
  expect(await scanBotDeposits('botchain')).toBeNull();
  delete process.env.BOTCHAIN_DEPOSIT_INDEXING_ENABLED;
});

test('a failed native transaction never creates a received-funds record', async () => {
  rpc.mockImplementation(async (_url, method, params) => {
    if (method === 'eth_blockNumber') return '0x64';
    if (method === 'eth_getLogs') return [];
    if (method === 'eth_getBlockByNumber') return { transactions: BigInt(params[0]) === 95n ? [{ hash: `0x${'a'.repeat(64)}`, from: outsider, to: watchedAddress, value: '0x1' }] : [] };
    if (method === 'eth_getTransactionReceipt') return { status: '0x0', blockNumber: '0x5f' };
  });
  await scanBotDeposits('botchain-testnet');
  expect(records).toHaveLength(0);
});
test('a missing confirmed block retains the native cursor for a retry', async () => {
  rpc.mockImplementation(async (_url, method) => method === 'eth_blockNumber' ? '0x64' : method === 'eth_getLogs' ? [] : null);
  await expect(scanBotDeposits('botchain-testnet')).rejects.toThrow('Confirmed BOT block');
  expect(stored['botchain:deposit-cursor:botchain-testnet:native']).toBeUndefined();
});
test('a competing scanner leaves the cursor and ledger untouched', async () => {
  (BotDepositCursor.findOneAndUpdate as jest.Mock).mockRejectedValueOnce({ code: 11000 });
  expect(await scanBotDeposits('botchain-testnet')).toBeNull();
  expect(rpc).not.toHaveBeenCalled();
});

test('reports native backlog separately when token indexing has caught up', async () => {
  stored['botchain:deposit-cursor:botchain-testnet:token'] = '98';
  stored['botchain:deposit-cursor:botchain-testnet:native'] = '1';
  process.env.BOTCHAIN_TESTNET_DEPOSIT_NATIVE_RANGE = '20';
  try {
    const first = await scanBotDeposits('botchain-testnet');
    expect(first?.progress).toEqual({ confirmedHead: '98', tokenThrough: '98', nativeThrough: '21', remainingBlocks: '77' });
    const second = await scanBotDeposits('botchain-testnet');
    expect(second?.progress?.nativeThrough).toBe('41');
    expect(second?.progress?.remainingBlocks).toBe('57');
  } finally { delete process.env.BOTCHAIN_TESTNET_DEPOSIT_NATIVE_RANGE; }
});

test('a zero-value token event does not queue an SMS', async () => {
  rpc.mockImplementation(async (_url, method) => method === 'eth_blockNumber' ? '0x64' : method === 'eth_getLogs' ? [transferLog(outsider, watchedAddress, 0n, 90n, `0x${'a'.repeat(64)}`, 1)] : { transactions: [] });
  await scanBotDeposits('botchain-testnet');
  expect(records).toHaveLength(0);
});

test('confirmed native NexusPay smart-wallet receipts queue one incoming notification', async () => {
  const receipt = { network: 'botchain-testnet' as const, token: 'BOT', recipient: watchedAddress, sender: outsider, amountUnits: '1000000000000000000', transactionHash: `0x${'a'.repeat(64)}`, userOpHash: `0x${'b'.repeat(64)}`, blockNumber: '90' };
  await recordBotReceipt(receipt);
  await recordBotReceipt(receipt);
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({ direction: 'incoming', token: 'BOT', amount: '1', smsStatus: 'pending' });
});

test('immediate USDT receipt and later log scan produce only one recipient notification', async () => {
  const hash = '0x' + 'ab'.repeat(32);
  await recordBotReceipt({ network: 'botchain-testnet', token: 'USDT', recipient: watchedAddress, sender: outsider, amountUnits: '1000000', transactionHash: hash, userOpHash: '0xoperation', blockNumber: '92', transferLogIndex: '3' });
  rpc.mockImplementation(async (_url, method) => {
    if (method === 'eth_blockNumber') return '0x64';
    if (method === 'eth_getLogs') return [transferLog(outsider, watchedAddress, 1000000n, 92n, hash, 3)];
    if (method === 'eth_getBlockByNumber') return {transactions: []};
    throw new Error('Unexpected method');
  });
  await scanBotDeposits('botchain-testnet');
  expect(records).toHaveLength(1);
  expect(records[0].smsStatus).toBe('pending');
});
