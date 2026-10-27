jest.mock('../src/models/botTransfer', () => ({ BotTransfer: { find: jest.fn(), countDocuments: jest.fn() } }));
jest.mock('../src/models/escrowModel', () => ({ Escrow: { find: jest.fn(), countDocuments: jest.fn() } }));
import express from 'express';
import request from 'supertest';
import routes from '../src/routes/publicRoutes';
import { BotTransfer } from '../src/models/botTransfer';
import { Escrow } from '../src/models/escrowModel';

const app = express().use(express.json()).use('/api/public', routes);

const botOutgoing = {
  _id: 'b1',
  network: 'botchain',
  token: 'USDT',
  amount: '0.5',
  direction: 'outgoing',
  status: 'confirmed',
  merchantId: null,
  transactionHash: '0xabc',
  createdAt: new Date('2026-10-26T12:00:00Z'),
  userId: 'user-secret-id',
  sender: '0xsenderwallet',
  recipient: '0xrecipientwallet',
};

const botIncomingFailed = {
  _id: 'b2',
  network: 'botchain-testnet',
  token: 'BOT',
  amount: '0.02',
  direction: 'incoming',
  status: 'failed',
  transactionHash: null,
  createdAt: new Date('2026-10-12T09:00:00Z'),
  userId: 'user-secret-id',
  sender: '0xotherwallet',
  recipient: '0xmywallet',
};

const legacyTransfer = {
  transactionId: 'tx-legacy-1',
  userId: 'user-secret-id',
  type: 'token_transfer',
  status: 'completed',
  cryptoAmount: 4,
  cryptoTransactionHash: '0xdef',
  metadata: {
    chain: 'arbitrum',
    tokenType: 'USDT',
    recipientPhone: '+254712345678',
    recipientEmail: 'person@example.com',
    recipientAddress: '0xlegacyrecipient',
  },
  createdAt: new Date('2026-10-20T09:00:00Z'),
};

beforeEach(() => {
  jest.clearAllMocks();
  (BotTransfer.find as jest.Mock).mockReturnValue({ sort: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([botOutgoing, botIncomingFailed]) }) });
  (Escrow.find as jest.Mock).mockReturnValue({ sort: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([legacyTransfer]) }) });
  (BotTransfer.countDocuments as jest.Mock).mockResolvedValue(2);
  (Escrow.countDocuments as jest.Mock).mockResolvedValue(1);
});

test('serves the public feed without any authentication', async () => {
  const response = await request(app).get('/api/public/transactions');
  expect(response.status).toBe(200);
  expect(response.body.success).toBe(true);
  expect(response.body.data.summary).toEqual({ total: 3, returned: 3, network: 'all' });
});

test('returns public-safe fields only: no users, addresses, phones or emails', async () => {
  const response = await request(app).get('/api/public/transactions');
  const serialized = JSON.stringify(response.body);
  for (const secret of ['user-secret-id', '0xsenderwallet', '0xrecipientwallet', '0xotherwallet', '0xmywallet', '0xlegacyrecipient', '+254712345678', 'person@example.com', 'metadata', 'mpesa']) {
    expect(serialized).not.toContain(secret);
  }
  expect(response.body.data.transactions[0]).toEqual({
    id: 'b1',
    network: 'botchain',
    token: 'USDT',
    amount: '0.5',
    direction: 'outgoing',
    status: 'completed',
    type: 'token_transfer',
    txHash: '0xabc',
    explorerUrl: 'https://scan.botchain.ai/tx/0xabc',
    createdAt: '2026-10-26T12:00:00.000Z',
  });
});

test('merges both ledgers newest first with direction and status mapped', async () => {
  const response = await request(app).get('/api/public/transactions');
  const rows = response.body.data.transactions;
  expect(rows.map((row: any) => row.id)).toEqual(['b1', 'tx-legacy-1', 'b2']);
  expect(rows[1]).toMatchObject({
    network: 'arbitrum',
    token: 'USDT',
    amount: '4',
    direction: 'outgoing',
    status: 'completed',
    explorerUrl: 'https://arbiscan.io/tx/0xdef',
  });
  // Failed incoming row keeps its direction and has no explorer link without a hash.
  expect(rows[2]).toMatchObject({ direction: 'incoming', status: 'failed', explorerUrl: null, txHash: null });
});

test('applies the network filter to both collections', async () => {
  await request(app).get('/api/public/transactions?network=botchain');
  expect(BotTransfer.find).toHaveBeenCalledWith({ network: 'botchain' });
  expect(Escrow.find).toHaveBeenCalledWith({ 'metadata.chain': 'botchain' });
});

test('clamps the limit instead of allowing a full ledger scan', async () => {
  await request(app).get('/api/public/transactions?limit=1');
  const response = await request(app).get('/api/public/transactions?limit=5000');
  expect(response.body.data.summary.returned).toBeLessThanOrEqual(100);
  await request(app).get('/api/public/transactions?limit=abc');
  expect(response.body.data.summary.returned).toBe(3);
});

test('reports the feed as unavailable instead of failing open', async () => {
  (BotTransfer.find as jest.Mock).mockReturnValue({ sort: jest.fn().mockReturnValue({ limit: jest.fn().mockRejectedValue(new Error('database down')) }) });
  const response = await request(app).get('/api/public/transactions');
  expect(response.status).toBe(503);
  expect(response.body.success).toBe(false);
});
