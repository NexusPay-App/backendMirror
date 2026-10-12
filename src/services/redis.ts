import { redis } from '../config/redis';
import { logger } from '../config/logger';

// Share one lazy ioredis connection with queues, rates and payment services.
let connection: Promise<void> | undefined;
export async function initRedisClient() {
    if (redis.status === 'wait' || redis.status === 'end') {
        connection ??= redis.connect().finally(() => { connection = undefined; });
        await connection;
    } else if (connection) await connection;
    return redis;
}
export const getRedisClient = initRedisClient;
export async function addToTransactionQueue(transactionId: string, priority: 'high' | 'normal' | 'low' = 'normal'): Promise<boolean> {
    try {
        const client = await getRedisClient();
        await client.rpush(`transaction:queue:${priority}`, transactionId);
        logger.info({ transactionId, priority }, 'Transaction queued');
        return true;
    } catch { return false; }
}
export async function getNextTransaction(): Promise<string | null> {
    const client = await getRedisClient();
    for (const queue of ['transaction:queue:high', 'transaction:queue:normal', 'transaction:queue:low']) {
        const transactionId = await client.lpop(queue);
        if (transactionId) return transactionId;
    }
    return null;
}
export async function closeRedisConnection(): Promise<void> {
    if (redis.status === 'ready') await redis.quit();
    else redis.disconnect();
}
