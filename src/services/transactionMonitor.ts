import pino from 'pino';
import Redis from 'ioredis';
import config from '../config/env';
import { TokenSymbol } from '../types/token';

// Configure logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty'
  }
});

// Initialize Redis client for monitoring data
import { redis, isRedisConnected } from '../config/redis';

// Monitoring configuration
const MONITORING_CONFIG = {
  ALERT_THRESHOLDS: {
    FAILURE_RATE: 0.15,           // Alert if > 15% of transactions fail
    SLOW_TRANSACTION_MS: 45000,   // Alert if transaction > 45 seconds
    QUEUE_SIZE: 100,              // Alert if queue size > 100
    LOW_BALANCE_USD: 100,         // Alert if platform balance < $100
    PROCESSING_TIME_MS: 30000     // Alert if processing time > 30 seconds
  },
  METRICS_WINDOW_MS: 60 * 60 * 1000, // 1 hour window for metrics
  CACHE_TTL: 300 // 5 minutes cache for metrics
};

interface TransactionMetrics {
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  failureRate: number;
  averageProcessingTime: number;
  slowTransactions: number;
  queueSize: number;
  timestamp: number;
}

interface SecurityAlert {
  type: 'HIGH_FAILURE_RATE' | 'SLOW_PROCESSING' | 'LARGE_QUEUE' | 'LOW_BALANCE' | 'SUSPICIOUS_ACTIVITY';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  data: any;
  timestamp: number;
}

/**
 * Monitor transaction performance and generate alerts
 */
export class TransactionMonitor {
  private metrics: Map<string, TransactionMetrics> = new Map();
  private alerts: SecurityAlert[] = [];

  /**
   * Record a transaction completion
   */
  async recordTransaction(
    txId: string,
    success: boolean,
    processingTimeMs: number,
    chainName: string,
    tokenType: TokenSymbol,
    amount: number
  ): Promise<void> {
    try {
      const timestamp = Date.now();
      const key = `tx_metric:${Math.floor(timestamp / 60000)}`; // 1-minute buckets

      // Store in Redis for persistence
      await redis.hincrby(key, 'total', 1);
      if (success) {
        await redis.hincrby(key, 'successful', 1);
      } else {
        await redis.hincrby(key, 'failed', 1);
      }
      
      await redis.hset(key, {
        [`processing_time_${txId}`]: processingTimeMs,
        [`chain_${txId}`]: chainName,
        [`token_${txId}`]: tokenType,
        [`amount_${txId}`]: amount
      });

      // Set expiry
      await redis.expire(key, MONITORING_CONFIG.METRICS_WINDOW_MS / 1000);

      // Check for alerts
      await this.checkAlerts(chainName, tokenType);

      logger.info(`📊 Transaction recorded: ${txId} (${success ? '✅' : '❌'}) - ${processingTimeMs}ms`);
    } catch (error) {
      logger.error('Error recording transaction metrics:', error);
    }
  }

  /**
   * Get current transaction metrics
   */
  async getMetrics(windowMs: number = MONITORING_CONFIG.METRICS_WINDOW_MS): Promise<TransactionMetrics> {
    try {
      const cacheKey = `metrics_cache:${Math.floor(Date.now() / (MONITORING_CONFIG.CACHE_TTL * 1000))}`;
      
      // Try cache first
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const now = Date.now();
      const startTime = now - windowMs;
      const startBucket = Math.floor(startTime / 60000);
      const endBucket = Math.floor(now / 60000);

      let totalTransactions = 0;
      let successfulTransactions = 0;
      let failedTransactions = 0;
      let processingTimes: number[] = [];

      // Aggregate metrics from time buckets
      for (let bucket = startBucket; bucket <= endBucket; bucket++) {
        const key = `tx_metric:${bucket}`;
        const data = await redis.hgetall(key);
        
        if (data.total) {
          totalTransactions += parseInt(data.total);
        }
        if (data.successful) {
          successfulTransactions += parseInt(data.successful);
        }
        if (data.failed) {
          failedTransactions += parseInt(data.failed);
        }

        // Collect processing times
        for (const [field, value] of Object.entries(data)) {
          if (field.startsWith('processing_time_')) {
            processingTimes.push(parseInt(value));
          }
        }
      }

      const metrics: TransactionMetrics = {
        totalTransactions,
        successfulTransactions,
        failedTransactions,
        failureRate: totalTransactions > 0 ? failedTransactions / totalTransactions : 0,
        averageProcessingTime: processingTimes.length > 0 
          ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length 
          : 0,
        slowTransactions: processingTimes.filter(t => t > MONITORING_CONFIG.ALERT_THRESHOLDS.SLOW_TRANSACTION_MS).length,
        queueSize: await this.getQueueSizes(),
        timestamp: now
      };

      // Cache results
      await redis.setex(cacheKey, MONITORING_CONFIG.CACHE_TTL, JSON.stringify(metrics));

      return metrics;
    } catch (error) {
      logger.error('Error getting metrics:', error);
      return {
        totalTransactions: 0,
        successfulTransactions: 0,
        failedTransactions: 0,
        failureRate: 0,
        averageProcessingTime: 0,
        slowTransactions: 0,
        queueSize: 0,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Get total queue sizes across all priority levels
   */
  private async getQueueSizes(): Promise<number> {
    try {
      const queues = [
        'tx_queue:high',
        'tx_queue:normal', 
        'tx_queue:low',
        'tx_queue'
      ];

      let totalSize = 0;
      for (const queue of queues) {
        const size = await redis.llen(queue);
        totalSize += size;
      }

      return totalSize;
    } catch (error) {
      logger.error('Error getting queue sizes:', error);
      return 0;
    }
  }

  /**
   * Check for alert conditions and generate alerts
   */
  private async checkAlerts(chainName: string, tokenType: TokenSymbol): Promise<void> {
    try {
      const metrics = await this.getMetrics();

      // Check failure rate
      if (metrics.failureRate > MONITORING_CONFIG.ALERT_THRESHOLDS.FAILURE_RATE && metrics.totalTransactions >= 10) {
        await this.generateAlert({
          type: 'HIGH_FAILURE_RATE',
          severity: 'HIGH',
          message: `High transaction failure rate detected: ${(metrics.failureRate * 100).toFixed(1)}%`,
          data: { metrics, chainName, tokenType },
          timestamp: Date.now()
        });
      }

      // Check queue size
      if (metrics.queueSize > MONITORING_CONFIG.ALERT_THRESHOLDS.QUEUE_SIZE) {
        await this.generateAlert({
          type: 'LARGE_QUEUE',
          severity: 'MEDIUM',
          message: `Transaction queue is getting large: ${metrics.queueSize} pending transactions`,
          data: { queueSize: metrics.queueSize, chainName },
          timestamp: Date.now()
        });
      }

      // Check slow processing
      if (metrics.averageProcessingTime > MONITORING_CONFIG.ALERT_THRESHOLDS.PROCESSING_TIME_MS) {
        await this.generateAlert({
          type: 'SLOW_PROCESSING',
          severity: 'MEDIUM',
          message: `Slow transaction processing detected: ${metrics.averageProcessingTime.toFixed(0)}ms average`,
          data: { metrics, chainName },
          timestamp: Date.now()
        });
      }

    } catch (error) {
      logger.error('Error checking alerts:', error);
    }
  }

  /**
   * Generate and store an alert
   */
  private async generateAlert(alert: SecurityAlert): Promise<void> {
    try {
      // Store alert in Redis
      const alertKey = `alert:${alert.timestamp}:${alert.type}`;
      await redis.setex(alertKey, 24 * 60 * 60, JSON.stringify(alert)); // 24 hour expiry

      // Add to alerts list
      await redis.lpush('alerts:list', JSON.stringify(alert));
      await redis.ltrim('alerts:list', 0, 99); // Keep last 100 alerts

      // Log alert
      logger.warn(`🚨 ALERT [${alert.severity}]: ${alert.message}`, alert.data);

      // In production, this would also:
      // - Send notifications (email, Slack, etc.)
      // - Update monitoring dashboards
      // - Trigger automated responses for critical alerts

    } catch (error) {
      logger.error('Error generating alert:', error);
    }
  }

  /**
   * Get recent alerts
   */
  async getRecentAlerts(limit: number = 20): Promise<SecurityAlert[]> {
    try {
      const alertStrings = await redis.lrange('alerts:list', 0, limit - 1);
      return alertStrings.map(str => JSON.parse(str));
    } catch (error) {
      logger.error('Error getting recent alerts:', error);
      return [];
    }
  }

  /**
   * Clear old alerts
   */
  async clearOldAlerts(olderThanMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    try {
      const cutoff = Date.now() - olderThanMs;
      let cleared = 0;

      // Get pattern of alert keys
      const keys = await redis.keys('alert:*');
      
      for (const key of keys) {
        const alertData = await redis.get(key);
        if (alertData) {
          const alert = JSON.parse(alertData);
          if (alert.timestamp < cutoff) {
            await redis.del(key);
            cleared++;
          }
        }
      }

      logger.info(`🧹 Cleared ${cleared} old alerts`);
      return cleared;
    } catch (error) {
      logger.error('Error clearing old alerts:', error);
      return 0;
    }
  }

  /**
   * Get health status of the transaction system
   */
  async getHealthStatus(): Promise<{
    status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    metrics: TransactionMetrics;
    alerts: SecurityAlert[];
    recommendations: string[];
  }> {
    try {
      const metrics = await this.getMetrics();
      const recentAlerts = await this.getRecentAlerts(5);
      const recommendations: string[] = [];

      let status: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';

      // Determine overall status
      if (metrics.failureRate > MONITORING_CONFIG.ALERT_THRESHOLDS.FAILURE_RATE) {
        status = 'CRITICAL';
        recommendations.push('High failure rate detected - check platform wallet balance and network connectivity');
      }

      if (metrics.queueSize > MONITORING_CONFIG.ALERT_THRESHOLDS.QUEUE_SIZE) {
        status = status === 'CRITICAL' ? 'CRITICAL' : 'WARNING';
        recommendations.push('Large transaction queue - consider scaling processing or investigating bottlenecks');
      }

      if (metrics.averageProcessingTime > MONITORING_CONFIG.ALERT_THRESHOLDS.PROCESSING_TIME_MS) {
        status = status === 'CRITICAL' ? 'CRITICAL' : 'WARNING';
        recommendations.push('Slow processing times - check network conditions and gas prices');
      }

      if (recentAlerts.filter(a => a.severity === 'CRITICAL').length > 0) {
        status = 'CRITICAL';
        recommendations.push('Critical alerts detected - immediate attention required');
      }

      if (status === 'HEALTHY') {
        recommendations.push('System is operating normally');
      }

      return {
        status,
        metrics,
        alerts: recentAlerts,
        recommendations
      };
    } catch (error) {
      logger.error('Error getting health status:', error);
      return {
        status: 'CRITICAL',
        metrics: {
          totalTransactions: 0,
          successfulTransactions: 0,
          failedTransactions: 0,
          failureRate: 1,
          averageProcessingTime: 0,
          slowTransactions: 0,
          queueSize: 0,
          timestamp: Date.now()
        },
        alerts: [],
        recommendations: ['Error retrieving system health - check monitoring service']
      };
    }
  }
}

// Export singleton instance
export const transactionMonitor = new TransactionMonitor();

/**
 * Initialize monitoring with scheduled tasks
 */
export const initializeMonitoring = () => {
  logger.info('🔍 Initializing transaction monitoring...');

  // Clear old alerts every hour
  setInterval(async () => {
    try {
      await transactionMonitor.clearOldAlerts();
    } catch (error) {
      logger.error('Error in scheduled alert cleanup:', error);
    }
  }, 60 * 60 * 1000); // 1 hour

  // Log system health every 10 minutes
  setInterval(async () => {
    try {
      const health = await transactionMonitor.getHealthStatus();
      logger.info(`💊 System Health: ${health.status}`, {
        metrics: health.metrics,
        alertCount: health.alerts.length,
        recommendations: health.recommendations
      });
    } catch (error) {
      logger.error('Error in scheduled health check:', error);
    }
  }, 10 * 60 * 1000); // 10 minutes

  logger.info('✅ Transaction monitoring initialized');
}; 