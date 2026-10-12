// BOT-06: external deposit indexer. Incoming transfers to registered BOT accounts
// are recorded in the existing BotTransfer collection (direction: 'incoming') so no
// second ledger is introduced. Deposits are only indexed after the configured
// confirmation depth, so records are created 'confirmed' directly and never enter
// the one-active-debit-per-account lock index. Re-scans are idempotent through a
// deterministic per-log idempotency key.
import { parseAbi, decodeEventLog, type Hex } from 'viem';
import { createHash } from 'node:crypto';
import { getBotConfig, type BotNetwork, type BotToken } from '../config/botchain';
import { botRpc } from './botchainRpc';
import { getRedisClient } from './redis';
import { ChainAccount } from '../models/chainAccount';
import { BotTransfer } from '../models/botTransfer';
import { Business } from '../models/businessModel';
import { formatAmount } from '../utils/amounts';

const transferAbi = parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']);

type DepositLog = { address: string; topics: Hex[]; data: Hex; blockNumber: Hex; transactionHash: Hex; logIndex: Hex };
type BlockTx = { hash: string; from: string; to: string | null; value: Hex };
type WatchedAccount = { userId: unknown; merchantId?: string };

function cursorKey(network: BotNetwork, source: 'token' | 'native') {
  return `botchain:deposit-cursor:${network}:${source}`;
}
function envNumber(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isInteger(raw) && raw > 0 ? raw : fallback;
}
function confirmations(): bigint {
  return BigInt(Math.max(1, Number(process.env.BOTCHAIN_CONFIRMATIONS) || 3));
}
function bigMin(a: bigint, b: bigint): bigint { return a < b ? a : b; }
function bigMax(a: bigint, b: bigint): bigint { return a > b ? a : b; }
/** Same algorithm as outgoing transfers so identical operations share one fingerprint. */
function fingerprint(value: { network: string; recipient: string; symbol: string; amountUnits: string; merchantId?: string }) {
  return createHash('sha256').update(JSON.stringify([value.network, value.recipient.toLowerCase(), value.symbol, value.amountUnits, value.merchantId || ''])).digest('hex');
}
async function readCursor(network: BotNetwork, source: 'token' | 'native'): Promise<bigint | null> {
  try {
    const client = await getRedisClient();
    const stored = await client.get(cursorKey(network, source));
    if (stored && /^\d+$/.test(stored)) return BigInt(stored);
  } catch { /* Redis unavailable: fall back to the durable database watermark below. */ }
  const n = getBotConfig(network);
  const match = source === 'native' ? { token: 'BOT' } : { token: { $in: ['USDT', 'WBOT'] } };
  const latest = await BotTransfer.findOne({ network, direction: 'incoming', blockNumber: { $exists: true }, ...match }).sort({ createdAt: -1 }).select('blockNumber');
  const indexed = latest?.blockNumber && /^\d+$/.test(String(latest.blockNumber)) ? BigInt(String(latest.blockNumber)) : null;
  const configured = process.env[`${n.env}_DEPOSIT_START_BLOCK`];
  const floor = configured && /^\d+$/.test(configured) ? BigInt(configured) : null;
  if (indexed !== null && floor !== null) return bigMax(indexed + 1n, floor);
  if (indexed !== null) return indexed + 1n;
  return floor;
}
async function writeCursor(network: BotNetwork, source: 'token' | 'native', block: bigint) {
  try {
    const client = await getRedisClient();
    await client.set(cursorKey(network, source), block.toString());
  } catch { /* The database watermark keeps a lost cursor recoverable without duplicate credit. */ }
}
async function watchedAccounts(chainId: number): Promise<Map<string, WatchedAccount>> {
  const accounts = await ChainAccount.find({ chainId });
  const businessIds = accounts.filter(a => a.ownerType === 'business').map(a => a.ownerId);
  const businesses = businessIds.length ? await Business.find({ _id: { $in: businessIds } }) : [];
  const byId = new Map(businesses.map(b => [String(b._id), b]));
  const map = new Map<string, WatchedAccount>();
  for (const account of accounts) {
    if (account.ownerType === 'business') {
      const business: any = byId.get(String(account.ownerId));
      if (!business?.userId) continue; // Orphaned business account: never guess a beneficiary.
      map.set(account.address.toLowerCase(), { userId: business.userId, merchantId: business.merchantId });
    } else {
      map.set(account.address.toLowerCase(), { userId: account.ownerId });
    }
  }
  return map;
}
async function recordDeposit(value: { network: BotNetwork; chainId: number; watched: WatchedAccount; sender: string; recipient: string; symbol: BotToken; units: bigint; transactionHash: string; blockNumber: bigint; logKey: string }) {
  const n = getBotConfig(value.network);
  const token = n.tokens[value.symbol];
  const idempotencyKey = `deposit:${value.chainId}:${value.transactionHash}:${value.logKey}`;
  try {
    await BotTransfer.create({
      userId: value.watched.userId,
      idempotencyKey,
      fingerprint: fingerprint({ network: value.network, recipient: value.recipient, symbol: value.symbol, amountUnits: value.units.toString(), merchantId: value.watched.merchantId }),
      direction: 'incoming',
      network: value.network,
      chainId: value.chainId,
      sender: value.sender.toLowerCase(),
      recipient: value.recipient.toLowerCase(),
      token: value.symbol,
      amount: formatAmount(value.units, token.decimals),
      amountUnits: value.units.toString(),
      merchantId: value.watched.merchantId,
      transactionHash: value.transactionHash,
      blockNumber: value.blockNumber.toString(),
      status: 'confirmed',
    });
    return 1;
  } catch (error: any) {
    if (error?.code === 11000) return 0; // Already indexed by an earlier or concurrent scan.
    throw error;
  }
}
async function scanTokenDeposits(network: BotNetwork, from: bigint, to: bigint, watched: Map<string, WatchedAccount>): Promise<number> {
  const n = getBotConfig(network);
  const tokens = ([n.tokens.USDT, n.tokens.WBOT] as const).filter(t => t.address);
  let recorded = 0;
  for (const token of tokens) {
    const logs = await botRpc<DepositLog[]>(n.rpc, 'eth_getLogs', [{ fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}`, address: token.address, topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'] }]);
    for (const log of logs) {
      let event;
      try { event = decodeEventLog({ abi: transferAbi, data: log.data, topics: log.topics as [Hex, ...Hex[]] }); } catch { continue; }
      const recipient = String(event.args.to).toLowerCase();
      const account = watched.get(recipient);
      if (!account) continue;
      recorded += await recordDeposit({
        network, chainId: n.id, watched: account,
        sender: String(event.args.from), recipient,
        symbol: token.symbol as BotToken,
        units: BigInt(event.args.value),
        transactionHash: log.transactionHash,
        blockNumber: BigInt(log.blockNumber),
        logKey: String(BigInt(log.logIndex)),
      });
    }
  }
  return recorded;
}
async function scanNativeDeposits(network: BotNetwork, from: bigint, to: bigint, watched: Map<string, WatchedAccount>): Promise<number> {
  const n = getBotConfig(network);
  let recorded = 0;
  const blocks: bigint[] = [];
  for (let b = from; b <= to; b++) blocks.push(b);
  const concurrency = 8;
  for (let i = 0; i < blocks.length; i += concurrency) {
    const batch = await Promise.all(blocks.slice(i, i + concurrency).map(async block => {
      const hex = `0x${block.toString(16)}`;
      const full = await botRpc<{ transactions: BlockTx[] } | null>(n.rpc, 'eth_getBlockByNumber', [hex, true]);
      return { block, transactions: full?.transactions || [] };
    }));
    for (const { block, transactions } of batch) {
      for (const tx of transactions) {
        if (!tx.to) continue;
        const account = watched.get(tx.to.toLowerCase());
        const units = BigInt(tx.value);
        if (!account || units <= 0n) continue;
        recorded += await recordDeposit({
          network, chainId: n.id, watched: account,
          sender: tx.from, recipient: tx.to,
          symbol: 'BOT', units,
          transactionHash: tx.hash,
          blockNumber: block,
          logKey: 'native',
        });
      }
    }
  }
  return recorded;
}
/**
 * Index one confirmed block window of external deposits for a network.
 * Returns null when the network or its deposit indexer is disabled, and otherwise
 * reports the scanned range plus how many new (non-duplicate) deposits were recorded.
 */
export async function scanBotDeposits(network: BotNetwork) {
  const n = getBotConfig(network);
  if (!n.depositIndexingEnabled) return null;
  const head = BigInt(await botRpc<Hex>(n.rpc, 'eth_blockNumber'));
  const safeHead = head + 1n - confirmations();
  if (safeHead < 0n) return { from: 0n, to: 0n, tokens: 0, native: 0 };
  const lookback = (source: 'token' | 'native') => BigInt(envNumber(`${n.env}_DEPOSIT_${source.toUpperCase()}_LOOKBACK`, source === 'token' ? 5000 : 200));
  const scanSource = async (source: 'token' | 'native'): Promise<{ to: bigint; recorded: number }> => {
    const range = BigInt(envNumber(`${n.env}_DEPOSIT_${source.toUpperCase()}_RANGE`, source === 'token' ? 1000 : 50));
    let cursor = await readCursor(network, source);
    if (cursor === null) cursor = bigMax(safeHead - lookback(source), 0n);
    if (cursor >= safeHead) return { to: cursor, recorded: 0 };
    const from = cursor + 1n;
    const to = bigMin(cursor + range, safeHead);
    const recorded = source === 'token'
      ? await scanTokenDeposits(network, from, to, watched)
      : await scanNativeDeposits(network, from, to, watched);
    // Advance only after every record in the window persisted; a failed window is
    // rescanned on the next cycle and deduplicates through the idempotency key.
    await writeCursor(network, source, to);
    return { to, recorded };
  };
  const watched = await watchedAccounts(n.id);
  const start = await readCursor(network, 'token');
  const token = await scanSource('token');
  const native = await scanSource('native');
  return { from: start === null ? bigMax(safeHead - lookback('token'), 0n) + 1n : start + 1n, to: bigMax(token.to, native.to), tokens: token.recorded, native: native.recorded };
}
