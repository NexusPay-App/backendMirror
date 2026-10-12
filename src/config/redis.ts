import Redis from 'ioredis';

let redisConnected = false;
let redisErrorLogged = false;

// Create Redis client with proper error handling
export const redis = new Redis(process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || "localhost"}:${process.env.REDIS_PORT || "6379"}`, {
    ...(process.env.REDIS_URL ? {} : { password: process.env.REDIS_PASSWORD }),
    db: parseInt(process.env.REDIS_DB || '0'),
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
        // Stop retrying after 3 attempts to prevent spam
        if (times > 3) {
            return null;
        }
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    lazyConnect: true, // Don't connect immediately
});

// Handle connection events
redis.on('connect', () => {
    if (!redisConnected) {
        console.log('✅ Connected to Redis');
        redisConnected = true;
        redisErrorLogged = false;
    }
});

redis.on('error', (err: Error) => {
    if (!redisErrorLogged) {
        console.error('❌ Redis connection error:', err.message);
        console.warn('Redis-dependent operations are unavailable');
        redisErrorLogged = true;
    }
    redisConnected = false;
});

// Suppress additional unhandled error events
redis.on('end', () => {
    redisConnected = false;
});

redis.on('reconnecting', () => {
    // Silently handle reconnection attempts
});

redis.on('close', () => {
    redisConnected = false;
});

// Export connection status checker
export const isRedisConnected = () => redisConnected; 