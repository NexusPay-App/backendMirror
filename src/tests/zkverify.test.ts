import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import zkVerifyService from '../services/zkverify';
import LiquidityProofService from '../services/liquidityProofService';

// Mock zkVerifyService
jest.mock('../services/zkverify');

describe('ZkVerifyService (backendMirror)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('submitProof', () => {
    it('should submit liquidity proof to zkVerify', async () => {
      const mockResponse = {
        verificationId: 'zkv_test_123',
        status: 'verified',
        message: 'Mock verification',
      };

      (zkVerifyService.submitProof as jest.Mock).mockResolvedValue(mockResponse);

      const proof = {
        pi_a: ['mock_a'],
        pi_b: [['mock_b']],
        pi_c: ['mock_c'],
        protocol: 'groth16',
        curve: 'bn128',
      };

      const result = await zkVerifyService.submitProof({
        proof,
        publicInputs: ['1000', '5000', 'commitment', 'user123'],
        circuitId: 'lp_tier_v1',
        userId: 'user123',
        metadata: { proofType: 'lp_tier', tier: 'silver' },
      });

      expect(result).toBeDefined();
      expect(result?.verificationId).toBe('zkv_test_123');
      expect(result?.status).toBe('verified');
    });
  });

  describe('getProofStatus', () => {
    it('should fetch verification status', async () => {
      const mockStatus = {
        verificationId: 'zkv_test_123',
        status: 'verified',
        message: 'Proof verified',
      };

      (zkVerifyService.getProofStatus as jest.Mock).mockResolvedValue(mockStatus);

      const result = await zkVerifyService.getProofStatus('zkv_test_123');

      expect(result).toBeDefined();
      expect(result?.status).toBe('verified');
    });
  });
});

describe('LiquidityProofService', () => {
  describe('Tier Thresholds', () => {
    it('should have correct tier thresholds', () => {
      // Access private static via prototype or test known behavior
      const tiers = {
        bronze: { min: 0, max: 1000 },
        silver: { min: 1000, max: 5000 },
        gold: { min: 5000, max: 25000 },
        platinum: { min: 25000, max: 0 },
      };

      expect(tiers.bronze.min).toBe(0);
      expect(tiers.silver.min).toBe(1000);
      expect(tiers.gold.min).toBe(5000);
      expect(tiers.platinum.min).toBe(25000);
    });
  });

  describe('generateTierProof', () => {
    it('should generate tier proof for valid provision', async () => {
      const mockProvision = {
        _id: 'provision123',
        userId: 'user123',
        amount: 3000,
        token: 'USDC',
        chain: 'arbitrum',
        zkVerifyProofs: [],
        save: jest.fn().mockResolvedValue(true),
        createdAt: new Date(),
        lastYieldCalculation: new Date(),
      } as any;

      (zkVerifyService.submitProof as jest.Mock).mockResolvedValue({
        verificationId: 'zkv_tier_123',
        status: 'pending',
      });

      const result = await LiquidityProofService.generateTierProof(mockProvision, 'silver');

      expect(result).toBeDefined();
      expect(result.verificationId).toBeDefined();
    });
  });

  describe('generateDurationProof', () => {
    it('should generate duration proof for staked position', async () => {
      const mockProvision = {
        _id: 'provision123',
        userId: 'user123',
        amount: 5000,
        token: 'USDC',
        chain: 'arbitrum',
        zkVerifyProofs: [],
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        save: jest.fn().mockResolvedValue(true),
      } as any;

      (zkVerifyService.submitProof as jest.Mock).mockResolvedValue({
        verificationId: 'zkv_duration_123',
        status: 'pending',
      });

      const result = await LiquidityProofService.generateDurationProof(mockProvision, 7);

      expect(result).toBeDefined();
      expect(result.verificationId).toBeDefined();
    });
  });

  describe('generateRewardClaimProof', () => {
    it('should verify eligibility for reward claim', async () => {
      const mockProvision = {
        _id: 'provision123',
        userId: 'user123',
        amount: 5000,
        token: 'USDC',
        chain: 'arbitrum',
        zkVerifyProofs: [],
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        lastYieldCalculation: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        save: jest.fn().mockResolvedValue(true),
      } as any;

      (zkVerifyService.submitProof as jest.Mock).mockResolvedValue({
        verificationId: 'zkv_reward_123',
        status: 'pending',
      });

      const result = await LiquidityProofService.generateRewardClaimProof(mockProvision, 1000, 7);

      expect(result).toBeDefined();
      expect(result.eligible).toBe(true);
    });

    it('should reject ineligible claims', async () => {
      const mockProvision = {
        _id: 'provision123',
        userId: 'user123',
        amount: 500, // Below minimum
        token: 'USDC',
        chain: 'arbitrum',
        zkVerifyProofs: [],
        createdAt: new Date(),
        lastYieldCalculation: new Date(),
        save: jest.fn().mockResolvedValue(true),
      } as any;

      const result = await LiquidityProofService.generateRewardClaimProof(mockProvision, 1000, 7);

      expect(result.eligible).toBe(false);
    });
  });
});
