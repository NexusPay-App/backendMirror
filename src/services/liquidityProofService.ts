import { logger } from '../config/logger';
import { TokenSymbol } from '../types/token';
import { ILiquidityProvision } from '../models/LiquidityProvider';
import LiquidityProvider from '../models/LiquidityProvider';
import zkVerifyService from './zkverify';

/**
 * Liquidity Proof Service
 * Generates and manages ZK proofs for liquidity positions
 * Integrates with zkVerify for verification
 */
export class LiquidityProofService {
  
  /**
   * Tier thresholds in USD
   */
  private static readonly TIER_THRESHOLDS = {
    bronze: { min: 0, max: 1000 },
    silver: { min: 1000, max: 5000 },
    gold: { min: 5000, max: 25000 },
    platinum: { min: 25000, max: 0 }, // No max
  };
  
  /**
   * Generate and submit LP tier proof to zkVerify
   */
  static async generateTierProof(
    provision: ILiquidityProvision,
    tier: 'bronze' | 'silver' | 'gold' | 'platinum'
  ): Promise<{ verificationId?: string; status?: string }> {
    try {
      const threshold = this.TIER_THRESHOLDS[tier];
      
      logger.info(`Generating LP tier proof for ${tier}`, {
        userId: provision.userId,
        amount: provision.amount,
        token: provision.token,
      });
      
      // In production, this would generate actual ZK proof using Circom circuit
      // For now, we create a mock proof structure
      const proof = {
        pi_a: ['mock_a'],
        pi_b: [['mock_b']],
        pi_c: ['mock_c'],
        protocol: 'groth16',
        curve: 'bn128',
      };
      
      const publicInputs = [
        threshold.min.toString(),
        threshold.max.toString(),
        'commitment_hash',
        provision.userId.toString(),
      ];
      
      // Submit to zkVerify
      const result = await zkVerifyService.submitProof({
        proof,
        publicInputs,
        circuitId: 'lp_tier_v1',
        userId: provision.userId.toString(),
        metadata: {
          proofType: 'lp_tier',
          tier,
          token: provision.token,
          chain: provision.chain,
          threshold: threshold.min,
        },
      });
      
      if (result) {
        // Update provision with verification ID
        await LiquidityProvider.findByIdAndUpdate(provision._id, {
          tierVerificationId: result.verificationId,
          tierLastVerified: new Date(),
          tier,
        });
        
        logger.info(`LP tier proof submitted to zkVerify`, {
          verificationId: result.verificationId,
          tier,
        });
      }
      
      return result || {};
    } catch (error) {
      logger.error('Failed to generate tier proof', { error });
      return {};
    }
  }
  
  /**
   * Generate and submit LP duration proof to zkVerify
   */
  static async generateDurationProof(
    provision: ILiquidityProvision,
    minDays: number
  ): Promise<{ verificationId?: string; status?: string }> {
    try {
      const daysStaked = Math.floor(
        (Date.now() - provision.createdAt.getTime()) / (24 * 60 * 60 * 1000)
      );
      
      logger.info(`Generating LP duration proof`, {
        userId: provision.userId,
        daysStaked,
        minDays,
      });
      
      const proof = {
        pi_a: ['mock_a'],
        pi_b: [['mock_b']],
        pi_c: ['mock_c'],
        protocol: 'groth16',
        curve: 'bn128',
      };
      
      const publicInputs = [
        Date.now().toString(),
        minDays.toString(),
        'duration_commitment',
        provision.userId.toString(),
      ];
      
      const result = await zkVerifyService.submitProof({
        proof,
        publicInputs,
        circuitId: 'lp_duration_v1',
        userId: provision.userId.toString(),
        metadata: {
          proofType: 'lp_duration',
          daysStaked,
          minDays,
          token: provision.token,
        },
      });
      
      if (result && provision.zkVerifyProofs) {
        provision.zkVerifyProofs.push({
          proofType: 'lp_duration',
          verificationId: result.verificationId,
          verificationStatus: result.status || 'pending',
          submittedAt: new Date(),
        });
        await provision.save();
      }
      
      return result || {};
    } catch (error) {
      logger.error('Failed to generate duration proof', { error });
      return {};
    }
  }
  
  /**
   * Generate and submit LP reward claim proof to zkVerify
   */
  static async generateRewardClaimProof(
    provision: ILiquidityProvision,
    minAmount: number,
    minDaysBetweenClaims: number = 7
  ): Promise<{ verificationId?: string; status?: string; eligible: boolean }> {
    try {
      const lastClaimTimestamp = provision.lastYieldCalculation?.getTime() || provision.createdAt.getTime();
      const daysSinceClaim = Math.floor(
        (Date.now() - lastClaimTimestamp) / (24 * 60 * 60 * 1000)
      );
      
      const eligible = provision.amount >= minAmount && daysSinceClaim >= minDaysBetweenClaims;
      
      logger.info(`Generating LP reward claim proof`, {
        userId: provision.userId,
        amount: provision.amount,
        eligible,
        daysSinceClaim,
      });
      
      const proof = {
        pi_a: ['mock_a'],
        pi_b: [['mock_b']],
        pi_c: ['mock_c'],
        protocol: 'groth16',
        curve: 'bn128',
      };
      
      const publicInputs = [
        Date.now().toString(),
        minAmount.toString(),
        minDaysBetweenClaims.toString(),
        'reward_commitment',
        provision.userId.toString(),
      ];
      
      const result = await zkVerifyService.submitProof({
        proof,
        publicInputs,
        circuitId: 'lp_reward_claim_v1',
        userId: provision.userId.toString(),
        metadata: {
          proofType: 'lp_reward_claim',
          eligible,
          amount: provision.amount,
          daysSinceClaim,
        },
      });
      
      if (result && provision.zkVerifyProofs) {
        provision.zkVerifyProofs.push({
          proofType: 'lp_reward_claim',
          verificationId: result.verificationId,
          verificationStatus: result.status || 'pending',
          submittedAt: new Date(),
        });
        await provision.save();
      }
      
      return { ...result, eligible } || { eligible };
    } catch (error) {
      logger.error('Failed to generate reward claim proof', { error });
      return { eligible: false };
    }
  }
  
  /**
   * Verify user's tier and update if needed
   */
  static async verifyAndUpdateTier(userId: string, token: TokenSymbol): Promise<string> {
    try {
      const provision = await LiquidityProvider.findOne({
        userId,
        token,
        isActive: true,
      });
      
      if (!provision) {
        return 'bronze';
      }
      
      // Determine tier based on amount
      let newTier: 'bronze' | 'silver' | 'gold' | 'platinum' = 'bronze';
      
      if (provision.amount >= this.TIER_THRESHOLDS.platinum.min) {
        newTier = 'platinum';
      } else if (provision.amount >= this.TIER_THRESHOLDS.gold.min) {
        newTier = 'gold';
      } else if (provision.amount >= this.TIER_THRESHOLDS.silver.min) {
        newTier = 'silver';
      }
      
      // Generate proof and update tier
      if (newTier !== provision.tier) {
        await this.generateTierProof(provision, newTier);
      }
      
      return newTier;
    } catch (error) {
      logger.error('Failed to verify tier', { error });
      return 'bronze';
    }
  }
}

export default LiquidityProofService;
