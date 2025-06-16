import { TokenSymbol } from '../types/token';
import { TransactionType } from './feeService';
import { getRedisClient } from './redis';
import { logger } from '../config/logger';
import { Redis } from 'ioredis';

interface UsageMetrics {
    swapVolume: number;
    mpesaVolume: number;
    totalVolume: number;
    lastUpdated: number;
}

const USAGE_METRICS_KEY_PREFIX = 'liquidity_usage:';
const USAGE_WINDOW = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export class LiquidityUsageTracker {
    private static async getRedis(): Promise<Redis> {
        return await getRedisClient();
    }

    private static async getKey(token: TokenSymbol): Promise<string> {
        return `${USAGE_METRICS_KEY_PREFIX}${token}`;
    }

    private static async getMetrics(token: TokenSymbol): Promise<UsageMetrics> {
        const redis = await this.getRedis();
        const key = await this.getKey(token);
        const data = await redis.get(key);

        if (!data) {
            return {
                swapVolume: 0,
                mpesaVolume: 0,
                totalVolume: 0,
                lastUpdated: Date.now()
            };
        }

        return JSON.parse(data);
    }

    private static async saveMetrics(token: TokenSymbol, metrics: UsageMetrics): Promise<void> {
        const redis = await this.getRedis();
        const key = await this.getKey(token);
        await redis.set(key, JSON.stringify(metrics));
    }

    /**
     * Record liquidity usage for a specific token
     */
    static async recordUsage(
        token: TokenSymbol,
        amount: number,
        type: TransactionType
    ): Promise<void> {
        try {
            const metrics = await this.getMetrics(token);
            const now = Date.now();

            // Reset metrics if they're older than the usage window
            if (now - metrics.lastUpdated > USAGE_WINDOW) {
                metrics.swapVolume = 0;
                metrics.mpesaVolume = 0;
                metrics.totalVolume = 0;
            }

            // Update relevant volume based on transaction type
            switch (type) {
                case TransactionType.SWAP:
                    metrics.swapVolume += amount;
                    break;
                case TransactionType.RAMP:
                    metrics.mpesaVolume += amount;
                    break;
            }

            metrics.totalVolume += amount;
            metrics.lastUpdated = now;

            await this.saveMetrics(token, metrics);
        } catch (error) {
            logger.error('Error recording liquidity usage:', error);
        }
    }

    /**
     * Get the current utilization rate for a token
     */
    static async getUtilizationRate(
        token: TokenSymbol,
        totalLiquidity: number
    ): Promise<{
        totalRate: number;
        swapRate: number;
        mpesaRate: number;
    }> {
        if (totalLiquidity <= 0) {
            return { totalRate: 0, swapRate: 0, mpesaRate: 0 };
        }

        const metrics = await this.getMetrics(token);
        const now = Date.now();

        // Return 0 if metrics are older than the usage window
        if (now - metrics.lastUpdated > USAGE_WINDOW) {
            return { totalRate: 0, swapRate: 0, mpesaRate: 0 };
        }

        return {
            totalRate: Math.min((metrics.totalVolume / totalLiquidity) * 100, 100),
            swapRate: Math.min((metrics.swapVolume / totalLiquidity) * 100, 100),
            mpesaRate: Math.min((metrics.mpesaVolume / totalLiquidity) * 100, 100)
        };
    }

    /**
     * Clean up old metrics
     */
    static async cleanup(): Promise<void> {
        try {
            const redis = await this.getRedis();
            const keys = await redis.keys(`${USAGE_METRICS_KEY_PREFIX}*`);
            const now = Date.now();

            for (const key of keys) {
                const data = await redis.get(key);
                if (data) {
                    const metrics: UsageMetrics = JSON.parse(data);
                    if (now - metrics.lastUpdated > USAGE_WINDOW) {
                        await redis.del(key);
                    }
                }
            }
        } catch (error) {
            logger.error('Error cleaning up liquidity usage metrics:', error);
        }
    }
} 