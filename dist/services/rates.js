"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConversionRateWithCaching = getConversionRateWithCaching;
exports.forceRefreshConversionRate = forceRefreshConversionRate;
exports.getRateInfo = getRateInfo;
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = __importDefault(require("../config/env"));
const crypto_1 = require("crypto");
// Initialize Redis client
const redis = new ioredis_1.default(env_1.default.REDIS_URL);
// Cache keys and settings
const CONVERSION_RATE_CACHE_KEY = 'rates:usdc_to_kes';
const CONVERSION_RATE_LOCK_KEY = 'rates:usdc_to_kes:lock';
const CACHE_DURATION = 10 * 60; // 10 minutes in seconds
const LOCK_DURATION = 30; // 30 seconds
const DEFAULT_CONVERSION_RATE = 133.5; // Default fallback rate
/**
 * Get USDC to KES conversion rate with proper Redis caching
 * Implements a distributed locking mechanism to prevent multiple simultaneous API calls
 */
async function getConversionRateWithCaching() {
    try {
        // Try to get from cache first
        const cachedRate = await redis.get(CONVERSION_RATE_CACHE_KEY);
        if (cachedRate) {
            return parseFloat(cachedRate);
        }
        // No cached rate, we need to fetch a new one
        // First, try to obtain a lock to prevent multiple API calls
        const lockId = (0, crypto_1.randomUUID)();
        const acquired = await redis.set(CONVERSION_RATE_LOCK_KEY, lockId, 'EX', LOCK_DURATION, 'NX');
        // If we couldn't acquire the lock, someone else is fetching
        // Wait briefly and try again from cache
        if (!acquired) {
            // Wait a moment (100-300ms)
            await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
            // Check cache again
            const rateAfterWait = await redis.get(CONVERSION_RATE_CACHE_KEY);
            if (rateAfterWait) {
                return parseFloat(rateAfterWait);
            }
            // Still no rate, use default as fallback
            return DEFAULT_CONVERSION_RATE;
        }
        try {
            // We have the lock, fetch fresh rate
            const rate = await fetchUSDCToKESPrice();
            // Validate rate to ensure it's reasonable
            if (isNaN(rate) || rate <= 0 || rate > 1000) {
                console.error(`Invalid conversion rate received: ${rate}`);
                return DEFAULT_CONVERSION_RATE;
            }
            // Cache the rate
            await redis.set(CONVERSION_RATE_CACHE_KEY, rate.toString(), 'EX', CACHE_DURATION);
            return rate;
        }
        finally {
            // Release lock if it's still ours
            const currentLock = await redis.get(CONVERSION_RATE_LOCK_KEY);
            if (currentLock === lockId) {
                await redis.del(CONVERSION_RATE_LOCK_KEY);
            }
        }
    }
    catch (error) {
        console.error('Error in getConversionRateWithCaching:', error);
        // On error, use default rate as fallback
        return DEFAULT_CONVERSION_RATE;
    }
}
/**
 * Fetch current USDC to KES exchange rate from an API
 */
async function fetchUSDCToKESPrice() {
    try {
        // Define the API endpoint - using CoinMarketCap in this example
        const apiEndpoint = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=USDC&convert=KES';
        // Set the API key header
        const headers = {
            'X-CMC_PRO_API_KEY': process.env.COINMARKETCAP_API_KEY || '7e75c059-0ffc-41ca-ae72-88df27e0f202'
        };
        // Make a GET request to the API endpoint
        const response = await fetch(apiEndpoint, { headers });
        // Check the response status code
        if (response.status !== 200) {
            throw new Error(`Failed to fetch USDC to KES price: ${response.status}`);
        }
        // Parse the JSON response
        const data = await response.json();
        // Return the USDC to KES price
        return data.data['USDC'].quote['KES'].price;
    }
    catch (error) {
        console.error('Error fetching USDC to KES price:', error);
        // Implement fallback strategy by checking alternative data sources
        try {
            // Alternative API endpoint (example using CoinGecko)
            const fallbackResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=kes');
            if (fallbackResponse.ok) {
                const fallbackData = await fallbackResponse.json();
                return fallbackData['usd-coin'].kes;
            }
        }
        catch (fallbackError) {
            console.error('Fallback rate fetch also failed:', fallbackError);
        }
        // If all fetches fail, use default rate
        return DEFAULT_CONVERSION_RATE;
    }
}
/**
 * Force refresh the cached conversion rate
 * Useful for admin functions or scheduled updates
 */
async function forceRefreshConversionRate() {
    try {
        // Fetch new rate
        const newRate = await fetchUSDCToKESPrice();
        // Cache the new rate
        await redis.set(CONVERSION_RATE_CACHE_KEY, newRate.toString(), 'EX', CACHE_DURATION);
        return newRate;
    }
    catch (error) {
        console.error('Error in forceRefreshConversionRate:', error);
        throw error;
    }
}
/**
 * Get all available rates with sources and timestamps
 * Useful for monitoring and debugging
 */
async function getRateInfo() {
    const cachedRate = await redis.get(CONVERSION_RATE_CACHE_KEY);
    const cachedTTL = cachedRate ? await redis.ttl(CONVERSION_RATE_CACHE_KEY) : -1;
    return {
        current: {
            rate: cachedRate ? parseFloat(cachedRate) : null,
            source: cachedRate ? 'cache' : null,
            ttlSeconds: cachedTTL,
            refreshAt: cachedTTL > 0 ? new Date(Date.now() + cachedTTL * 1000) : null
        },
        default: DEFAULT_CONVERSION_RATE
    };
}
