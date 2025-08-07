import Redis from 'ioredis';

let redisConnected = false;
let redisErrorLogged = false;

// Create Redis client with proper error handling
export const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
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
        console.log('⚠️ Switching to in-memory storage for Redis-dependent features');
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

// Add a global error handler to prevent unhandled error events
process.on('unhandledRejection', (reason, promise) => {
    // Only log if it's not a Redis connection error we've already handled
    if (reason && typeof reason === 'object' && 'code' in reason && reason.code === 'ECONNREFUSED') {
        // Silently ignore Redis connection errors that we've already logged
        return;
    }
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

redis.on('close', () => {
    redisConnected = false;
});

// Export connection status checker
export const isRedisConnected = () => redisConnected; 