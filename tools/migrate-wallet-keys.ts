/** Opt-in additive migration. Default: counts only. Never logs key material. */
import mongoose from 'mongoose';
import { protectWalletKey } from '../src/utils/walletKeys';
async function main() {
  const apply = process.argv.includes('--apply');
  if (!process.env.MONGODB_MIGRATION_URI) throw new Error('Set MONGODB_MIGRATION_URI explicitly');
  if (apply && !process.env.WALLET_KEY_ENCRYPTION_KEY) throw new Error('Set and back up WALLET_KEY_ENCRYPTION_KEY before applying');
  await mongoose.connect(process.env.MONGODB_MIGRATION_URI, { autoIndex: false });
  try {
    for (const name of ['users', 'businesses']) {
      const collection = mongoose.connection.collection(name);
      let candidates = 0, changed = 0;
      const cursor = collection.find({ privateKey: { $type: 'string', $not: /^enc:v1:/ } }, { projection: { _id: 1, privateKey: 1 } });
      for await (const record of cursor) {
        candidates++;
        if (apply) {
          const encrypted = protectWalletKey(record.privateKey);
          const result = await collection.updateOne({ _id: record._id, privateKey: record.privateKey }, { $set: { privateKey: encrypted } });
          changed += result.modifiedCount;
        }
      }
      console.log(JSON.stringify({ collection: name, mode: apply ? 'apply' : 'dry-run', candidates, changed }));
    }
  } finally { await mongoose.disconnect(); }
}
main().catch(() => { console.error('Migration failed; database records and credentials were not logged. Check configuration and connectivity.'); process.exitCode = 1; });
