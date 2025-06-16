import Redis from 'ioredis';

// Create Redis client
export const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    }
}); 