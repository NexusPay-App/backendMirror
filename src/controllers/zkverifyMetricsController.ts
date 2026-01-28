import { Request, Response } from 'express';
import LiquidityProvider from '../models/LiquidityProvider';
import { logger } from '../config/logger';

/**
 * zkVerify Metrics Controller (backendMirror)
 * Tracks liquidity proof volume for grant reporting
 */
export class ZkVerifyMetricsController {
  
  /**
   * GET /api/liquidity/zkverify/metrics
   * Get zkVerify proof metrics for liquidity track
   */
  static async getLiquidityProofMetrics(req: Request, res: Response) {
    try {
      const { startDate, endDate } = req.query;
      
      const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate as string) : new Date();
      
      // Get all provisions with zkVerify proofs in date range
      const provisions = await LiquidityProvider.find({
        'zkVerifyProofs.submittedAt': {
          $gte: start,
          $lte: end,
        },
      });
      
      // Calculate metrics
      const totalProofs = provisions.reduce((sum, p) => {
        const proofsInRange = p.zkVerifyProofs?.filter(proof => 
          proof.submittedAt && 
          proof.submittedAt >= start && 
          proof.submittedAt <= end
        ) || [];
        return sum + proofsInRange.length;
      }, 0);
      
      // Unique users (wallet addresses)
      const uniqueUsers = new Set(
        provisions.map(p => p.walletAddress)
      ).size;
      
      // Proofs by type
      const proofsByType: Record<string, number> = {};
      provisions.forEach(p => {
        p.zkVerifyProofs?.forEach(proof => {
          if (proof.submittedAt && proof.submittedAt >= start && proof.submittedAt <= end) {
            proofsByType[proof.proofType] = (proofsByType[proof.proofType] || 0) + 1;
          }
        });
      });
      
      // Proofs by status
      const proofsByStatus: Record<string, number> = {};
      provisions.forEach(p => {
        p.zkVerifyProofs?.forEach(proof => {
          if (proof.submittedAt && proof.submittedAt >= start && proof.submittedAt <= end) {
            const status = proof.verificationStatus || 'unknown';
            proofsByStatus[status] = (proofsByStatus[status] || 0) + 1;
          }
        });
      });
      
      // Tier distribution
      const tierDistribution: Record<string, number> = {};
      provisions.forEach(p => {
        const tier = p.tier || 'bronze';
        tierDistribution[tier] = (tierDistribution[tier] || 0) + 1;
      });
      
      res.json({
        success: true,
        data: {
          period: {
            start: start.toISOString(),
            end: end.toISOString(),
          },
          totalProofs,
          uniqueUsers,
          avgProofsPerUser: uniqueUsers > 0 ? (totalProofs / uniqueUsers).toFixed(2) : 0,
          proofsByType: Object.entries(proofsByType).map(([type, count]) => ({ type, count })),
          proofsByStatus: Object.entries(proofsByStatus).map(([status, count]) => ({ status, count })),
          tierDistribution: Object.entries(tierDistribution).map(([tier, count]) => ({ tier, count })),
        },
        meta: {
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
      });
    } catch (error: any) {
      logger.error('Error fetching liquidity proof metrics', { error });
      res.status(500).json({
        success: false,
        error: {
          message: error.message || 'Failed to fetch metrics',
        },
      });
    }
  }
  
  /**
   * GET /api/liquidity/zkverify/milestone-report
   * Generate milestone report for Thrive Protocol
   */
  static async getMilestoneReport(req: Request, res: Response) {
    try {
      const { milestone } = req.query; // '1', '2', or '3'
      
      let days: number;
      switch (milestone) {
        case '1':
          days = 45;
          break;
        case '2':
          days = 90;
          break;
        case '3':
          days = 150;
          break;
        default:
          days = 90;
      }
      
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const endDate = new Date();
      
      const provisions = await LiquidityProvider.find({
        'zkVerifyProofs.submittedAt': {
          $gte: startDate,
          $lte: endDate,
        },
      });
      
      const totalProofs = provisions.reduce((sum, p) => {
        const proofsInRange = p.zkVerifyProofs?.filter(proof => 
          proof.submittedAt && 
          proof.submittedAt >= startDate && 
          proof.submittedAt <= endDate
        ) || [];
        return sum + proofsInRange.length;
      }, 0);
      
      const uniqueUsers = new Set(
        provisions.map(p => p.walletAddress)
      ).size;
      
      // Milestone thresholds
      const thresholds = {
        '1': { proofs: 1000, users: 50 },
        '2': { proofs: 25000, users: 250 },
        '3': { proofs: 250000, users: 2500 },
      };
      
      const threshold = thresholds[milestone as keyof typeof thresholds] || thresholds['2'];
      
      res.json({
        success: true,
        data: {
          track: 'liquidity',
          milestone: milestone || '2',
          period: {
            start: startDate.toISOString(),
            end: endDate.toISOString(),
            days,
          },
          achievements: {
            totalProofs,
            uniqueUsers,
            proofTarget: threshold.proofs,
            userTarget: threshold.users,
            proofProgress: ((totalProofs / threshold.proofs) * 100).toFixed(2) + '%',
            userProgress: ((uniqueUsers / threshold.users) * 100).toFixed(2) + '%',
          },
          milestoneCompleted: totalProofs >= threshold.proofs || uniqueUsers >= threshold.users,
        },
        meta: {
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
      });
    } catch (error: any) {
      logger.error('Error generating milestone report', { error });
      res.status(500).json({
        success: false,
        error: {
          message: error.message || 'Failed to generate report',
        },
      });
    }
  }
}
