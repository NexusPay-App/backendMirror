import { readFile } from 'node:fs/promises';
import { parse } from 'dotenv';
import mongoose from 'mongoose';
const env = parse(await readFile(new URL('../.env', import.meta.url), 'utf8'));
const sourceUri = env.PROD_MONGO_URL || env.DEV_MONGO_URL;
if (!sourceUri) throw new Error('No source database configured');
const source = new mongoose.mongo.MongoClient(sourceUri, { serverSelectionTimeoutMS: 10000 });
const local = new mongoose.mongo.MongoClient('mongodb://127.0.0.1:27028');
const fields = names => Object.fromEntries(names.split(' ').map(name => [name, 1]));
const schemas = {
  chainaccounts: fields('_id ownerType chainId address ownerAddress factory entryPoint salt accountType createdAt updatedAt'),
  escrows: fields('_id transactionId amount cryptoAmount type status cryptoTransactionHash completedAt createdAt updatedAt metadata.chain metadata.tokenType metadata.gasFee metadata.gasUsed metadata.blockNumber'),
  bottransfers: fields('_id idempotencyKey fingerprint network chainId sender recipient token amount amountUnits direction transactionHash userOpHash blockNumber actualFeeUnits transferLogIndex status createdAt updatedAt'),
};
try {
  await Promise.all([source.connect(), local.connect()]);
  const target = local.db('nexuspay_security_review');
  const identities = await target.collection('users').find({ googleId: { $type: 'string' }, isEmailVerified: true }, { projection: { googleId: 1, walletAddress: 1 } }).toArray();
  const totals = { accounts: 0, chainaccounts: 0, escrows: 0, bottransfers: 0 };
  for (const identity of identities) {
    const matches = await source.db().collection('users').find({ googleId: identity.googleId }, { projection: { _id: 1, googleId: 1, walletAddress: 1, status: 1 } }).limit(2).toArray();
    if (matches.length !== 1 || (matches[0].status && matches[0].status !== 'active')) continue;
    const original = matches[0];
    if (!/^0x[a-fA-F0-9]{40}$/.test(original.walletAddress || '')) continue;
    if (identity.walletAddress && identity.walletAddress.toLowerCase() !== original.walletAddress.toLowerCase()) throw new Error('Wallet mismatch requires review');
    for (const [collection, projection] of Object.entries(schemas)) {
      const ownerField = collection === 'chainaccounts' ? 'ownerId' : 'userId';
      const query = { [ownerField]: original._id, ...(collection === 'chainaccounts' ? { ownerType: 'user' } : {}) };
      const records = await source.db().collection(collection).find(query, { projection }).toArray();
      for (const record of records) {
        const existing = await target.collection(collection).findOne({ _id: record._id }, { projection: { [ownerField]: 1 } });
        if (existing && String(existing[ownerField]) !== String(identity._id)) throw new Error('Local record ownership conflict');
        await target.collection(collection).updateOne({ _id: record._id }, { $set: { ...record, [ownerField]: identity._id } }, { upsert: true });
      }
      totals[collection] += records.length;
    }
    await target.collection('users').updateOne({ _id: identity._id, googleId: identity.googleId }, { $set: { walletAddress: original.walletAddress, walletStatus: 'ready' } });
    totals.accounts++;
  }
  console.log(JSON.stringify(totals));
} catch (error) {
  console.error(`Wallet sync failed (${error.name}). Check connectivity and source configuration; no source writes are performed.`);
  process.exitCode = 1;
} finally { await Promise.all([source.close(), local.close()]); }
