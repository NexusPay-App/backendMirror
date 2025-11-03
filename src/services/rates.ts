import Redis from 'ioredis';
import config from '../config/env';
import { randomUUID } from 'crypto';

// Initialize Redis client
import { redis, isRedisConnected } from '../config/redis';

// Cache keys and settings
const CACHE_DURATION = 10 * 60; // 10 minutes in seconds
const LOCK_DURATION = 30; // 30 seconds

// Default conversion rates
const DEFAULT_RATES: Record<string, number> = {
    'USDC': 133.5,
    'USDT': 133.0,
    'BTC': 6500000.0, // Approximate BTC/KES rate
    'ETH': 440000.0,  // Approximate ETH/KES rate
};

// Optional CoinMarketCap API key
const apiKey = process.env.COINMARKETCAP_API_KEY;

// Headers for CoinMarketCap API (if available)
const headers: HeadersInit | undefined = apiKey ? {
    'X-CMC_PRO_API_KEY': apiKey
} : undefined;

/**
 * Get crypto to KES conversion rate with proper Redis caching
 * Implements a distributed locking mechanism to prevent multiple simultaneous API calls
 * @param tokenType The type of token (USDC, USDT, BTC, ETH)
 * @returns The current conversion rate
 */
export async function getConversionRateWithCaching(tokenType: string = 'USDC'): Promise<number> {
    // Normalize token type
    const token = tokenType.toUpperCase();
    
    // Use default rate if token not supported
    if (!DEFAULT_RATES[token]) {
        console.warn(`Unsupported token type: ${token}, falling back to USDC rate`);
        return DEFAULT_RATES['USDC'];
    }
    
    // Set cache keys for this specific token
    const RATE_CACHE_KEY = `rates:${token.toLowerCase()}_to_kes`;
    const RATE_LOCK_KEY = `rates:${token.toLowerCase()}_to_kes:lock`;
    
    try {
        // Try to get from cache first (skip if Redis not connected)
        if (redis.status === 'ready') {
            const cachedRate = await redis.get(RATE_CACHE_KEY);
            if (cachedRate) {
                return parseFloat(cachedRate);
            }
        }
        
        // No cached rate, we need to fetch a new one
        // First, try to obtain a lock to prevent multiple API calls (only if Redis is connected)
        let acquired = true;
        let lockId = '';
        
        if (redis.status === 'ready') {
            lockId = randomUUID();
            acquired = await redis.set(
                RATE_LOCK_KEY,
                lockId,
                'EX',
                LOCK_DURATION,
                'NX'
            ) as any;
        }
        
        // If we couldn't acquire the lock, someone else is fetching
        // Wait briefly and try again from cache
        if (!acquired && redis.status === 'ready') {
            // Wait a moment (100-300ms)
            await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
            
            // Check cache again
            const rateAfterWait = await redis.get(RATE_CACHE_KEY);
            if (rateAfterWait) {
                return parseFloat(rateAfterWait);
            }
            
            // Still no rate, use default as fallback
            return DEFAULT_RATES[token];
        }
        
        try {
            // We have the lock, fetch fresh rate
            const rate = await fetchCryptoToKESPrice(token);
            
            // Validate rate to ensure it's reasonable
            if (isNaN(rate) || rate <= 0 || rate > 10000000) { // Higher limit for BTC
                console.error(`Invalid conversion rate received for ${token}: ${rate}`);
                return DEFAULT_RATES[token];
            }
            
            // Cache the rate (only if Redis is connected)
            if (redis.status === 'ready') {
                await redis.set(RATE_CACHE_KEY, rate.toString(), 'EX', CACHE_DURATION);
            }
            
            return rate;
        } finally {
            // Release lock if it's still ours (only if Redis is connected)
            if (redis.status === 'ready' && lockId) {
                const currentLock = await redis.get(RATE_LOCK_KEY);
                if (currentLock === lockId) {
                    await redis.del(RATE_LOCK_KEY);
                }
            }
        }
    } catch (error) {
        console.error(`Error in getConversionRateWithCaching for ${token}:`, error);
        
        // On error, use default rate as fallback
        return DEFAULT_RATES[token];
    }
}

/**
 * Fetch current crypto to KES exchange rate from an API
 * @param tokenType The type of token (USDC, USDT, BTC, ETH)
 * @returns The current conversion rate
 */
async function fetchCryptoToKESPrice(tokenType: string = 'USDC'): Promise<number> {
    try {
        // Map our token symbols to CoinGecko symbols
        const cmcSymbol = tokenType === 'BTC' ? 'bitcoin' : 
                          tokenType === 'ETH' ? 'ethereum' : 
                          tokenType === 'USDT' ? 'tether' : 'usd-coin';
        
        // Try CoinGecko API first
        try {
        const apiEndpoint = `https://api.coingecko.com/api/v3/simple/price?ids=${cmcSymbol}&vs_currencies=kes`;
        const response = await fetch(apiEndpoint);
        
            if (response.status === 200) {
        const data = await response.json();
                if (data[cmcSymbol]?.kes) {
        return data[cmcSymbol].kes;
                }
            }
            throw new Error(`Failed to fetch ${tokenType} to KES price from CoinGecko`);
        } catch (coingeckoError) {
            console.error(`CoinGecko API error:`, coingeckoError);
            
            // Only try CoinMarketCap if we have an API key
            if (apiKey) {
            const fallbackEndpoint = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${tokenType}&convert=KES`;
            
                const response = await fetch(fallbackEndpoint, {
                    method: 'GET',
                headers: {
                    'X-CMC_PRO_API_KEY': apiKey
                }
            });
            
                if (response.ok) {
                    const data = await response.json();
                    if (data.data?.[tokenType]?.quote?.['KES']?.price) {
                        return data.data[tokenType].quote['KES'].price;
            }
                }
                throw new Error(`Failed to fetch ${tokenType} to KES price from CoinMarketCap`);
            }
        }
        
        // If all API calls fail, use default rate
        console.warn(`Using default rate for ${tokenType}`);
        return DEFAULT_RATES[tokenType];
    } catch (error) {
        console.error(`Error fetching ${tokenType} to KES price:`, error);
        return DEFAULT_RATES[tokenType];
    }
}

/**
 * Force refresh the cached conversion rate for a specific token
 * @param tokenType The type of token (USDC, USDT, BTC, ETH)
 */
export async function forceRefreshConversionRate(tokenType: string = 'USDC'): Promise<number> {
    try {
        // Normalize token type
        const token = tokenType.toUpperCase();
        
        // Use default rate if token not supported
        if (!DEFAULT_RATES[token]) {
            console.warn(`Unsupported token type: ${token}, falling back to USDC rate`);
            return DEFAULT_RATES['USDC'];
        }
        
        // Set cache key for this specific token
        const RATE_CACHE_KEY = `rates:${token.toLowerCase()}_to_kes`;
        
        // Fetch new rate
        const newRate = await fetchCryptoToKESPrice(token);
        
        // Cache the new rate
        await redis.set(RATE_CACHE_KEY, newRate.toString(), 'EX', CACHE_DURATION);
        
        return newRate;
    } catch (error) {
        console.error('Error in forceRefreshConversionRate:', error);
        throw error;
    }
}

/**
 * Get all available rates with sources and timestamps
 */
export async function getRateInfo(): Promise<Record<string, any>> {
    const result: Record<string, any> = {
        default: DEFAULT_RATES,
        current: {}
    };
    
    // Get current rates for all supported tokens
    for (const token of Object.keys(DEFAULT_RATES)) {
        const tokenLower = token.toLowerCase();
        const RATE_CACHE_KEY = `rates:${tokenLower}_to_kes`;
        
        const cachedRate = await redis.get(RATE_CACHE_KEY);
        const cachedTTL = cachedRate ? await redis.ttl(RATE_CACHE_KEY) : -1;
        
        result.current[token] = {
            rate: cachedRate ? parseFloat(cachedRate) : null,
            source: cachedRate ? 'cache' : null,
            ttlSeconds: cachedTTL,
            refreshAt: cachedTTL > 0 ? new Date(Date.now() + cachedTTL * 1000) : null
        };
    }
    
    return result;
} 