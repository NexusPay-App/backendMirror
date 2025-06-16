import { Request, Response } from 'express';
import { transactionMonitor } from '../services/transactionMonitor';
import { standardResponse } from '../services/utils';
import pino from 'pino';

// Configure logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty'
  }
});

/**
 * Get system health status
 */
export const getSystemHealth = async (req: Request, res: Response) => {
  try {
    const health = await transactionMonitor.getHealthStatus();
    
    return res.status(200).json(standardResponse(
      true,
      "System health retrieved successfully",
      health
    ));
  } catch (error: any) {
    logger.error('Error getting system health:', error);
    return res.status(500).json(standardResponse(
      false,
      "Failed to retrieve system health",
      null,
      { code: 'HEALTH_CHECK_FAILED', message: error.message }
    ));
  }
};

/**
 * Get transaction metrics
 */
export const getTransactionMetrics = async (req: Request, res: Response) => {
  try {
    const { windowMs } = req.query;
    const window = windowMs ? parseInt(windowMs as string) : undefined;
    
    const metrics = await transactionMonitor.getMetrics(window);
    
    return res.status(200).json(standardResponse(
      true,
      "Transaction metrics retrieved successfully",
      {
        metrics,
        windowMs: window || 3600000, // Default 1 hour
        timestamp: Date.now()
      }
    ));
  } catch (error: any) {
    logger.error('Error getting transaction metrics:', error);
    return res.status(500).json(standardResponse(
      false,
      "Failed to retrieve transaction metrics",
      null,
      { code: 'METRICS_RETRIEVAL_FAILED', message: error.message }
    ));
  }
};

/**
 * Get recent alerts
 */
export const getRecentAlerts = async (req: Request, res: Response) => {
  try {
    const { limit } = req.query;
    const alertLimit = limit ? parseInt(limit as string) : 20;
    
    const alerts = await transactionMonitor.getRecentAlerts(alertLimit);
    
    return res.status(200).json(standardResponse(
      true,
      "Recent alerts retrieved successfully",
      {
        alerts,
        count: alerts.length,
        limit: alertLimit,
        timestamp: Date.now()
      }
    ));
  } catch (error: any) {
    logger.error('Error getting recent alerts:', error);
    return res.status(500).json(standardResponse(
      false,
      "Failed to retrieve recent alerts",
      null,
      { code: 'ALERTS_RETRIEVAL_FAILED', message: error.message }
    ));
  }
};

/**
 * Clear old alerts (admin only)
 */
export const clearOldAlerts = async (req: Request, res: Response) => {
  try {
    const { olderThanMs } = req.body;
    const cutoff = olderThanMs || (24 * 60 * 60 * 1000); // Default 24 hours
    
    const cleared = await transactionMonitor.clearOldAlerts(cutoff);
    
    return res.status(200).json(standardResponse(
      true,
      "Old alerts cleared successfully",
      {
        clearedCount: cleared,
        cutoffMs: cutoff,
        timestamp: Date.now()
      }
    ));
  } catch (error: any) {
    logger.error('Error clearing old alerts:', error);
    return res.status(500).json(standardResponse(
      false,
      "Failed to clear old alerts",
      null,
      { code: 'ALERT_CLEANUP_FAILED', message: error.message }
    ));
  }
};

/**
 * Get comprehensive system dashboard data
 */
export const getSystemDashboard = async (req: Request, res: Response) => {
  try {
    const [health, metrics, alerts] = await Promise.all([
      transactionMonitor.getHealthStatus(),
      transactionMonitor.getMetrics(),
      transactionMonitor.getRecentAlerts(10)
    ]);

    const dashboard = {
      overview: {
        status: health.status,
        statusMessage: getStatusMessage(health.status),
        lastUpdate: new Date().toISOString()
      },
      metrics: {
        totalTransactions: metrics.totalTransactions,
        successRate: metrics.totalTransactions > 0 
          ? ((metrics.successfulTransactions / metrics.totalTransactions) * 100).toFixed(1) 
          : '0.0',
        failureRate: (metrics.failureRate * 100).toFixed(1),
        averageProcessingTime: Math.round(metrics.averageProcessingTime),
        queueSize: metrics.queueSize,
        slowTransactions: metrics.slowTransactions
      },
      alerts: {
        recent: alerts.slice(0, 5),
        criticalCount: alerts.filter(a => a.severity === 'CRITICAL').length,
        highCount: alerts.filter(a => a.severity === 'HIGH').length,
        mediumCount: alerts.filter(a => a.severity === 'MEDIUM').length,
        total: alerts.length
      },
      recommendations: health.recommendations,
      performance: {
        isPerformingWell: health.status !== 'CRITICAL' && metrics.averageProcessingTime < 30000,
        bottlenecks: identifyBottlenecks(metrics, alerts),
        suggestions: generateSuggestions(health.status, metrics)
      }
    };

    return res.status(200).json(standardResponse(
      true,
      "System dashboard retrieved successfully",
      dashboard
    ));
  } catch (error: any) {
    logger.error('Error getting system dashboard:', error);
    return res.status(500).json(standardResponse(
      false,
      "Failed to retrieve system dashboard",
      null,
      { code: 'DASHBOARD_FAILED', message: error.message }
    ));
  }
};

// Helper functions
function getStatusMessage(status: string): string {
  switch (status) {
    case 'HEALTHY':
      return '✅ All systems operational';
    case 'WARNING':
      return '⚠️ Minor issues detected';
    case 'CRITICAL':
      return '🚨 Critical issues require attention';
    default:
      return '❓ Unknown status';
  }
}

function identifyBottlenecks(metrics: any, alerts: any[]): string[] {
  const bottlenecks: string[] = [];
  
  if (metrics.queueSize > 50) {
    bottlenecks.push('High transaction queue size');
  }
  
  if (metrics.averageProcessingTime > 30000) {
    bottlenecks.push('Slow transaction processing');
  }
  
  if (metrics.failureRate > 0.1) {
    bottlenecks.push('High failure rate');
  }
  
  if (alerts.some(a => a.type === 'LOW_BALANCE')) {
    bottlenecks.push('Low platform wallet balance');
  }
  
  return bottlenecks;
}

function generateSuggestions(status: string, metrics: any): string[] {
  const suggestions: string[] = [];
  
  if (status === 'CRITICAL') {
    suggestions.push('Immediate investigation required');
    suggestions.push('Check platform wallet balances');
    suggestions.push('Verify network connectivity');
  }
  
  if (metrics.queueSize > 100) {
    suggestions.push('Consider increasing processing capacity');
    suggestions.push('Review queue processing intervals');
  }
  
  if (metrics.averageProcessingTime > 45000) {
    suggestions.push('Optimize transaction timeout settings');
    suggestions.push('Check blockchain network conditions');
  }
  
  if (suggestions.length === 0) {
    suggestions.push('System is operating optimally');
  }
  
  return suggestions;
} 