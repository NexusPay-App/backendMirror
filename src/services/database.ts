import mongoose from 'mongoose';
import config from '../config/env';
export async function connect() {
  if (!config.MONGO_URL) throw new Error('MongoDB URL is not configured');
  await mongoose.connect(config.MONGO_URL, { autoIndex: false, serverSelectionTimeoutMS: 10000 });
}
