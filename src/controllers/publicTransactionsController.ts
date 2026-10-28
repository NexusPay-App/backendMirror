import type { Request, Response } from 'express';
import { BotTransfer } from '../models/botTransfer';
import { getBotConfig, isBotNetwork, type BotNetwork } from '../config/botchain';
import { getTransactionDirection } from '../services/transactionDirection';

/**
 * Public transaction feed behind tx-dashboard.nexuspayapp.xyz.
 *
 * Scoped to BOT Chain mainnet + testnet only. Other-chain ledgers (Escrow / Arbitrum /
 * Base / etc.) stay available on authenticated history routes — this endpoint does not
 * query them.
 *
 * NexusPay has no payment contract to watch: every user and business holds its own
 * ERC-4337 smart account, so there is no single address to index. The only complete
 * record of BOT activity is our own BotTransfer ledger, and this endpoint publishes a
 * deliberately narrowed view of it.
 *
 * Never returned here: user ids, wallet/smart-account addresses, phone numbers,
 * emails, M-Pesa references, recipient identifiers, fees or balances. Rows are built
 * field by field so a schema addition cannot leak into the response by accident.
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
// Bound the scan window so an unauthenticated caller cannot page the whole ledger.
const SCAN_WINDOW = 500;
const BOT_DASHBOARD_NETWORKS: BotNetwork[] = ['botchain', 'botchain-testnet'];

export interface PublicTransaction {
  id: string;
  network: string;
  token: string;
  amount: string;
  direction: 'incoming' | 'outgoing' | null;
  status: 'completed' | 'pending' | 'failed';
  type: string;
  txHash: string | null;
  explorerUrl: string | null;
  createdAt: string;
}

function mapBotRecord(record: any): PublicTransaction {
  const txHash = record.transactionHash || null;
  const explorer = txHash && isBotNetwork(record.network) ? `${getBotConfig(record.network).explorer}/tx/${txHash}` : null;
  return {
    id: String(record._id),
    network: record.network,
    token: record.token,
    amount: String(record.amount),
    direction: getTransactionDirection('token_transfer', record.direction),
    status: record.status === 'confirmed' ? 'completed' : record.status === 'failed' ? 'failed' : 'pending',
    type: record.merchantId ? 'crypto_to_till' : 'token_transfer',
    txHash,
    explorerUrl: explorer,
    createdAt: new Date(record.createdAt).toISOString(),
  };
}

function resolveNetworkFilter(raw: string): { filter: Record<string, unknown>; summaryNetwork: string } {
  if (!raw) {
    return { filter: { network: { $in: BOT_DASHBOARD_NETWORKS } }, summaryNetwork: 'all' };
  }
  if (isBotNetwork(raw)) {
    return { filter: { network: raw }, summaryNetwork: raw };
  }
  // Non-BOT filters are ignored for this public surface — return an empty match.
  return { filter: { network: { $in: [] } }, summaryNetwork: raw };
}

export const getPublicTransactions = async (req: Request, res: Response) => {
  try {
    const requested = Number.parseInt(String(req.query.limit ?? ''), 10);
    const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), MAX_LIMIT) : DEFAULT_LIMIT;
    const network = typeof req.query.network === 'string' ? req.query.network.trim().slice(0, 32) : '';
    const { filter, summaryNetwork } = resolveNetworkFilter(network);

    const [botRecords, botTotal] = await Promise.all([
      BotTransfer.find(filter).sort({ createdAt: -1 }).limit(SCAN_WINDOW),
      BotTransfer.countDocuments(filter),
    ]);

    const rows: PublicTransaction[] = [];
    for (const record of botRecords) {
      try { rows.push(mapBotRecord(record)); } catch {
        // One malformed historical row must not blank the whole public list.
      }
    }
    rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({
      success: true,
      data: {
        transactions: rows.slice(0, limit),
        summary: { total: botTotal, returned: Math.min(limit, rows.length), network: summaryNetwork },
      },
    });
  } catch (error: any) {
    console.error('Public transaction feed failed:', error?.message || error);
    res.status(503).json({ success: false, error: { code: 'FEED_UNAVAILABLE', message: 'Transaction feed is temporarily unavailable' } });
  }
};
