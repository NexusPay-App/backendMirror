import { createClient } from 'redis';
import config from '../config/env';
import { logger } from '../config/logger';

// Use any to avoid TypeScript version conflicts
let redisClient: any = null;
let isConnecting = false;

/**
 * Initialize the Redis client connection
 */
export const initRedisClient = async (): Promise<any> => {
    if (redisClient) return redisClient;
    if (isConnecting) {
        console.log('Redis client connection already in progress');
        return null;
    }
    
    try {
        isConnecting = true;
        console.log(`Connecting to Redis at: ${config.REDIS_URL}`);
        
        const client = createClient({
            url: config.REDIS_URL
        });
        
        client.on('error', (err) => {
            console.error('Redis connection error:', err);
            redisClient = null;
        });
        
        client.on('connect', () => {
            console.log('✅ Connected to Redis');
        });
        
        await client.connect();
        redisClient = client;
        isConnecting = false;
        return client;
    } catch (error) {
        console.error('Error connecting to Redis:', error);
        isConnecting = false;
        redisClient = null;
        return null;
    }
};

/**
 * Get the Redis client, initializing if needed
 */
export const getRedisClient = async (): Promise<any> => {
    if (redisClient) return redisClient;
    return initRedisClient();
};

/**
 * Add a transaction to the Redis queue for processing
 */
export const addToTransactionQueue = async (
    transactionId: string, 
    priority: 'high' | 'normal' | 'low' = 'normal'
): Promise<boolean> => {
    const client = await getRedisClient();
    if (!client) return false;
    
    const queue = `transaction:queue:${priority}`;
    await client.rPush(queue, transactionId);
    logger.info(`Added transaction ${transactionId} to ${priority} queue`);
    return true;
};

/**
 * Get the next transaction from the queue for processing
 */
export const getNextTransaction = async (): Promise<string | null> => {
    const client = await getRedisClient();
    if (!client) return null;
    
    // Try high priority queue first, then normal, then low
    const queues = ['transaction:queue:high', 'transaction:queue:normal', 'transaction:queue:low'];
    
    for (const queue of queues) {
        const transactionId = await client.lPop(queue);
        if (transactionId) {
            return transactionId;
        }
    }
    
    return null;
};

/**
 * Clean up Redis client on application shutdown
 */
export const closeRedisConnection = async (): Promise<void> => {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
        console.log('Redis connection closed');
    }
}; 