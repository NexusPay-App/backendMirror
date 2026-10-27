import type { Request, Response } from 'express';
import { BotTransfer } from '../models/botTransfer';
import { Escrow } from '../models/escrowModel';
import { getBotConfig, isBotNetwork } from '../config/botchain';
import { generateExplorerUrl } from '../utils/explorer';
import type { Chain } from '../types/token';
import { getTransactionDirection } from '../services/transactionDirection';

/**
 * Public transaction feed behind tx-dashboard.nexuspayapp.xyz.
 *
 * NexusPay has no payment contract to watch: every user and business holds its own
 * ERC-4337 smart account, so there is no single address to index. The only complete
 * record of platform activity is our own ledger, and this endpoint publishes a
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

function explorerUrlFor(chain: string, txHash: string): string | null {
  try {
    return generateExplorerUrl(chain as Chain, txHash);
  } catch {
    return null;
  }
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

function mapLegacyRecord(record: any): PublicTransaction {
  const metadata = record.metadata || {};
  const txHash = record.cryptoTransactionHash || null;
  return {
    id: String(record.transactionId || record._id),
    network: metadata.chain || 'arbitrum',
    token: metadata.tokenType || 'USDT',
    amount: String(record.cryptoAmount ?? 0),
    direction: getTransactionDirection(record.type),
    status: record.status,
    type: record.type,
    txHash,
    explorerUrl: txHash ? explorerUrlFor(metadata.chain || 'arbitrum', txHash) : null,
    createdAt: new Date(record.createdAt).toISOString(),
  };
}

export const getPublicTransactions = async (req: Request, res: Response) => {
  try {
    const requested = Number.parseInt(String(req.query.limit ?? ''), 10);
    const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), MAX_LIMIT) : DEFAULT_LIMIT;
    const network = typeof req.query.network === 'string' ? req.query.network.trim().slice(0, 32) : '';

    const botFilter = network ? { network } : {};
    const legacyFilter = network ? { 'metadata.chain': network } : {};

    const [botRecords, legacyRecords, botTotal, legacyTotal] = await Promise.all([
      BotTransfer.find(botFilter).sort({ createdAt: -1 }).limit(SCAN_WINDOW),
      Escrow.find(legacyFilter).sort({ createdAt: -1 }).limit(SCAN_WINDOW),
      BotTransfer.countDocuments(botFilter),
      Escrow.countDocuments(legacyFilter),
    ]);

    const rows: PublicTransaction[] = [];
    for (const record of botRecords) {
      try { rows.push(mapBotRecord(record)); } catch {
        // One malformed historical row must not blank the whole public list.
      }
    }
    for (const record of legacyRecords) {
      try { rows.push(mapLegacyRecord(record)); } catch {
        // One malformed historical row must not blank the whole public list.
      }
    }
    rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({
      success: true,
      data: {
        transactions: rows.slice(0, limit),
        summary: { total: botTotal + legacyTotal, returned: Math.min(limit, rows.length), network: network || 'all' },
      },
    });
  } catch (error: any) {
    console.error('Public transaction feed failed:', error?.message || error);
    res.status(503).json({ success: false, error: { code: 'FEED_UNAVAILABLE', message: 'Transaction feed is temporarily unavailable' } });
  }
};
