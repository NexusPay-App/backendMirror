import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import mongoose from 'mongoose';
import LiquidityProvider from '../models/LiquidityProvider';
import LiquidityProofService from '../services/liquidityProofService';

describe('Liquidity zkVerify Integration Tests', () => {
  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nexuspay_test');
    }
  });

  afterAll(async () => {
    // Cleanup and disconnect
    await mongoose.connection.close();
  });

  describe('Tier Proof Generation', () => {
    it('should generate tier proof for bronze tier', async () => {
      const mockProvision = new LiquidityProvider({
        userId: new mongoose.Types.ObjectId(),
        walletAddress: '0xtest123',
        token: 'USDC',
        amount: 500,
        chain: 'arbitrum',
        transactionHash: '0xtesthash',
        blockNumber: 123456,
        blockTimestamp: new Date(),
        transactionStatus: 'confirmed',
        zkVerifyProofs: [],
      });

      await mockProvision.save();

      const result = await LiquidityProofService.generateTierProof(mockProvision, 'bronze');

      expect(result).toBeDefined();
      expect(result.verificationId || result.status).toBeDefined();

      // Cleanup
      await LiquidityProvider.deleteOne({ _id: mockProvision._id });
    });

    it('should generate tier proof for platinum tier', async () => {
      const mockProvision = new LiquidityProvider({
        userId: new mongoose.Types.ObjectId(),
        walletAddress: '0xtest456',
        token: 'USDC',
        amount: 50000,
        chain: 'arbitrum',
        transactionHash: '0xtesthash2',
        blockNumber: 123457,
        blockTimestamp: new Date(),
        transactionStatus: 'confirmed',
        zkVerifyProofs: [],
      });

      await mockProvision.save();

      const result = await LiquidityProofService.generateTierProof(mockProvision, 'platinum');

      expect(result).toBeDefined();

      // Cleanup
      await LiquidityProvider.deleteOne({ _id: mockProvision._id });
    });
  });

  describe('Duration Proof Generation', () => {
    it('should generate duration proof for 30-day stake', async () => {
      const mockProvision = new LiquidityProvider({
        userId: new mongoose.Types.ObjectId(),
        walletAddress: '0xtest789',
        token: 'USDC',
        amount: 5000,
        chain: 'arbitrum',
        transactionHash: '0xtesthash3',
        blockNumber: 123458,
        blockTimestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        transactionStatus: 'confirmed',
        zkVerifyProofs: [],
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      });

      await mockProvision.save();

      const result = await LiquidityProofService.generateDurationProof(mockProvision, 7);

      expect(result).toBeDefined();

      // Cleanup
      await LiquidityProvider.deleteOne({ _id: mockProvision._id });
    });
  });

  describe('Reward Claim Proof Generation', () => {
    it('should verify eligible reward claims', async () => {
      const mockProvision = new LiquidityProvider({
        userId: new mongoose.Types.ObjectId(),
        walletAddress: '0xtestabc',
        token: 'USDC',
        amount: 10000,
        chain: 'arbitrum',
        transactionHash: '0xtesthash4',
        blockNumber: 123459,
        blockTimestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        transactionStatus: 'confirmed',
        zkVerifyProofs: [],
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        lastYieldCalculation: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      });

      await mockProvision.save();

      const result = await LiquidityProofService.generateRewardClaimProof(mockProvision, 1000, 7);

      expect(result).toBeDefined();
      expect(result.eligible).toBe(true);

      // Cleanup
      await LiquidityProvider.deleteOne({ _id: mockProvision._id });
    });

    it('should reject ineligible reward claims', async () => {
      const mockProvision = new LiquidityProvider({
        userId: new mongoose.Types.ObjectId(),
        walletAddress: '0xtestdef',
        token: 'USDC',
        amount: 500, // Below threshold
        chain: 'arbitrum',
        transactionHash: '0xtesthash5',
        blockNumber: 123460,
        blockTimestamp: new Date(),
        transactionStatus: 'confirmed',
        zkVerifyProofs: [],
        createdAt: new Date(),
        lastYieldCalculation: new Date(),
      });

      await mockProvision.save();

      const result = await LiquidityProofService.generateRewardClaimProof(mockProvision, 1000, 7);

      expect(result.eligible).toBe(false);

      // Cleanup
      await LiquidityProvider.deleteOne({ _id: mockProvision._id });
    });
  });

  describe('Tier Verification and Update', () => {
    it('should verify and update user tier based on amount', async () => {
      const userId = new mongoose.Types.ObjectId();
      const mockProvision = new LiquidityProvider({
        userId,
        walletAddress: '0xtestghi',
        token: 'USDC',
        amount: 7500, // Gold tier
        chain: 'arbitrum',
        transactionHash: '0xtesthash6',
        blockNumber: 123461,
        blockTimestamp: new Date(),
        transactionStatus: 'confirmed',
        zkVerifyProofs: [],
        isActive: true,
      });

      await mockProvision.save();

      const tier = await LiquidityProofService.verifyAndUpdateTier(userId.toString(), 'USDC');

      expect(tier).toBe('gold');

      // Cleanup
      await LiquidityProvider.deleteOne({ _id: mockProvision._id });
    });
  });
});
