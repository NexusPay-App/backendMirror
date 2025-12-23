import pino from 'pino';
import { redis, isRedisConnected } from '../config/redis';
import { StellarTransaction } from '../models/stellarTransaction';
import mongoose from 'mongoose';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty'
  }
});

export interface StellarMetrics {
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  pendingTransactions: number;
  totalVolume: {
    XLM: string;
    USDC: string;
    USDT: string;
    BTC: string;
  };
  averageTransactionTime: number;
  successRate: number;
}

export interface StellarHealthStatus {
  isHealthy: boolean;
  horizonConnection: boolean;
  databaseConnection: boolean;
  redisConnection: boolean;
  lastTransactionTime?: Date;
  issues: string[];
}

export class StellarMonitoringService {
  private readonly METRICS_CACHE_KEY = 'stellar:metrics';
  private readonly METRICS_CACHE_TTL = 300; // 5 minutes
  private readonly HEALTH_CACHE_KEY = 'stellar:health';
  private readonly HEALTH_CACHE_TTL = 60; // 1 minute

  /**
   * Get Stellar transaction metrics
   */
  async getMetrics(timeframe: 'hour' | 'day' | 'week' | 'month' = 'day'): Promise<StellarMetrics> {
    try {
      // Check cache first
      if (isRedisConnected()) {
        const cacheKey = `${this.METRICS_CACHE_KEY}:${timeframe}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      // Calculate time range
      const now = new Date();
      let startTime = new Date();
      
      switch (timeframe) {
        case 'hour':
          startTime.setHours(now.getHours() - 1);
          break;
        case 'day':
          startTime.setDate(now.getDate() - 1);
          break;
        case 'week':
          startTime.setDate(now.getDate() - 7);
          break;
        case 'month':
          startTime.setMonth(now.getMonth() - 1);
          break;
      }

      // Query transactions
      const transactions = await StellarTransaction.find({
        createdAt: { $gte: startTime }
      }).lean();

      // Calculate metrics
      const totalTransactions = transactions.length;
      const successfulTransactions = transactions.filter(tx => tx.status === 'completed').length;
      const failedTransactions = transactions.filter(tx => tx.status === 'failed').length;
      const pendingTransactions = transactions.filter(tx => tx.status === 'pending' || tx.status === 'processing').length;

      // Calculate volume by asset
      const volumeByAsset: Record<string, number> = {
        XLM: 0,
        USDC: 0,
        USDT: 0,
        BTC: 0
      };

      transactions.forEach(tx => {
        if (tx.status === 'completed') {
          const amount = parseFloat(tx.amount);
          if (!isNaN(amount) && volumeByAsset[tx.asset] !== undefined) {
            volumeByAsset[tx.asset] += amount;
          }
        }
      });

      // Calculate average transaction time
      const completedTxs = transactions.filter(tx => tx.status === 'completed' && tx.completedAt);
      const totalTime = completedTxs.reduce((sum, tx) => {
        const duration = tx.completedAt ? tx.completedAt.getTime() - tx.createdAt.getTime() : 0;
        return sum + duration;
      }, 0);
      const averageTransactionTime = completedTxs.length > 0 ? totalTime / completedTxs.length / 1000 : 0;

      // Calculate success rate
      const successRate = totalTransactions > 0 ? (successfulTransactions / totalTransactions) * 100 : 0;

      const metrics: StellarMetrics = {
        totalTransactions,
        successfulTransactions,
        failedTransactions,
        pendingTransactions,
        totalVolume: {
          XLM: volumeByAsset.XLM.toFixed(7),
          USDC: volumeByAsset.USDC.toFixed(7),
          USDT: volumeByAsset.USDT.toFixed(7),
          BTC: volumeByAsset.BTC.toFixed(7)
        },
        averageTransactionTime: Math.round(averageTransactionTime),
        successRate: Math.round(successRate * 100) / 100
      };

      // Cache the metrics
      if (isRedisConnected()) {
        const cacheKey = `${this.METRICS_CACHE_KEY}:${timeframe}`;
        await redis.setex(cacheKey, this.METRICS_CACHE_TTL, JSON.stringify(metrics));
      }

      return metrics;
    } catch (error) {
      logger.error('Error getting Stellar metrics:', error);
      throw error;
    }
  }

  /**
   * Check Stellar service health
   */
  async checkHealth(): Promise<StellarHealthStatus> {
    try {
      // Check cache first
      if (isRedisConnected()) {
        const cached = await redis.get(this.HEALTH_CACHE_KEY);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      const issues: string[] = [];
      let isHealthy = true;

      // Check Horizon connection
      let horizonConnection = false;
      try {
        const { stellarService } = await import('./stellar');
        await stellarService.getNetworkFee();
        horizonConnection = true;
      } catch (error) {
        issues.push('Horizon API connection failed');
        isHealthy = false;
        horizonConnection = false;
      }

      // Check database connection
      let databaseConnection = false;
      try {
        await StellarTransaction.findOne().limit(1);
        databaseConnection = true;
      } catch (error) {
        issues.push('Database connection failed');
        isHealthy = false;
        databaseConnection = false;
      }

      // Check Redis connection
      const redisConnection = isRedisConnected();
      if (!redisConnection) {
        issues.push('Redis connection not available (caching disabled)');
        // Not critical, don't mark as unhealthy
      }

      // Check last transaction time
      let lastTransactionTime: Date | undefined;
      try {
        const lastTx = await StellarTransaction.findOne()
          .sort({ createdAt: -1 })
          .select('createdAt')
          .lean();
        
        if (lastTx) {
          lastTransactionTime = lastTx.createdAt;
          
          // Alert if no transactions in last hour
          const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
          if (lastTx.createdAt < hourAgo) {
            issues.push('No transactions in the last hour');
          }
        }
      } catch (error) {
        logger.error('Error checking last transaction time:', error);
      }

      const healthStatus: StellarHealthStatus = {
        isHealthy,
        horizonConnection,
        databaseConnection,
        redisConnection,
        lastTransactionTime,
        issues
      };

      // Cache the health status
      if (isRedisConnected()) {
        await redis.setex(this.HEALTH_CACHE_KEY, this.HEALTH_CACHE_TTL, JSON.stringify(healthStatus));
      }

      return healthStatus;
    } catch (error) {
      logger.error('Error checking Stellar health:', error);
      return {
        isHealthy: false,
        horizonConnection: false,
        databaseConnection: false,
        redisConnection: false,
        issues: ['Health check failed']
      };
    }
  }

  /**
   * Get failed transactions for alerting
   */
  async getFailedTransactions(limit: number = 10): Promise<any[]> {
    try {
      const failedTxs = await StellarTransaction.find({
        status: 'failed',
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('userId', 'phoneNumber email')
        .lean();

      return failedTxs;
    } catch (error) {
      logger.error('Error getting failed transactions:', error);
      return [];
    }
  }

  /**
   * Get stuck transactions (pending for too long)
   */
  async getStuckTransactions(thresholdMinutes: number = 30): Promise<any[]> {
    try {
      const threshold = new Date(Date.now() - thresholdMinutes * 60 * 1000);
      
      const stuckTxs = await StellarTransaction.find({
        status: { $in: ['pending', 'processing'] },
        createdAt: { $lt: threshold }
      })
        .sort({ createdAt: 1 })
        .populate('userId', 'phoneNumber email')
        .lean();

      return stuckTxs;
    } catch (error) {
      logger.error('Error getting stuck transactions:', error);
      return [];
    }
  }

  /**
   * Log transaction metrics to console
   */
  async logMetrics(): Promise<void> {
    try {
      const metrics = await this.getMetrics('day');
      
      logger.info('📊 Stellar Transaction Metrics (24h)');
      logger.info(`   Total Transactions: ${metrics.totalTransactions}`);
      logger.info(`   Success Rate: ${metrics.successRate}%`);
      logger.info(`   Avg Time: ${metrics.averageTransactionTime}s`);
      logger.info(`   Volume - XLM: ${metrics.totalVolume.XLM}`);
      logger.info(`   Volume - USDC: ${metrics.totalVolume.USDC}`);
      logger.info(`   Pending: ${metrics.pendingTransactions}`);
      logger.info(`   Failed: ${metrics.failedTransactions}`);
    } catch (error) {
      logger.error('Error logging metrics:', error);
    }
  }

  /**
   * Check for alerts and log them
   */
  async checkAlerts(): Promise<void> {
    try {
      // Check health
      const health = await this.checkHealth();
      if (!health.isHealthy) {
        logger.error('⚠️  Stellar Service Health Issues:', health.issues);
      }

      // Check stuck transactions
      const stuckTxs = await this.getStuckTransactions(30);
      if (stuckTxs.length > 0) {
        logger.warn(`⚠️  ${stuckTxs.length} stuck transactions found`);
      }

      // Check failed transactions
      const failedTxs = await this.getFailedTransactions(10);
      if (failedTxs.length > 5) {
        logger.warn(`⚠️  High failure rate: ${failedTxs.length} failed transactions in last 24h`);
      }
    } catch (error) {
      logger.error('Error checking alerts:', error);
    }
  }
}

// Export singleton instance
export const stellarMonitoring = new StellarMonitoringService();

