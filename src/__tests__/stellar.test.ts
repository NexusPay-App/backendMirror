/**
 * Stellar Integration Tests
 * 
 * Run with: npm test -- stellar.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { stellarService } from '../services/stellar';
import { stellarWalletService } from '../services/stellarWallet';
import { stellarPriceService } from '../services/stellarPrice';
import { getStellarConfig } from '../config/stellar';

describe('Stellar Service', () => {
  describe('Configuration', () => {
    it('should load Stellar configuration', () => {
      const config = getStellarConfig();
      expect(config).toBeDefined();
      expect(config.network).toBeDefined();
      expect(config.horizonUrl).toBeDefined();
    });
  });

  describe('Keypair Generation', () => {
    it('should generate a valid Stellar keypair', () => {
      const keypair = stellarService.generateKeypair();
      expect(keypair).toBeDefined();
      expect(keypair.publicKey).toBeDefined();
      expect(keypair.secretKey).toBeDefined();
      expect(keypair.publicKey.startsWith('G')).toBe(true);
      expect(keypair.secretKey.startsWith('S')).toBe(true);
    });
  });

  describe('Address Validation', () => {
    it('should validate a correct Stellar address', () => {
      const validAddress = 'GDFJ2AWYVAYUFPPTYIDRM6GNJJS3P2OZRBEO4XEQU2CHZUOE262OYJQI';
      const isValid = stellarService.validateAddress(validAddress);
      expect(isValid).toBe(true);
    });

    it('should invalidate an incorrect Stellar address', () => {
      const invalidAddress = 'INVALID_ADDRESS';
      const isValid = stellarService.validateAddress(invalidAddress);
      expect(isValid).toBe(false);
    });

    it('should invalidate an empty address', () => {
      const isValid = stellarService.validateAddress('');
      expect(isValid).toBe(false);
    });
  });

  describe('Network Info', () => {
    it('should get network information', async () => {
      const networkInfo = await stellarService.getNetworkInfo();
      expect(networkInfo).toBeDefined();
      expect(networkInfo.network).toBeDefined();
      expect(networkInfo.horizonUrl).toBeDefined();
      expect(networkInfo.passphrase).toBeDefined();
    });
  });

  describe('Network Fee', () => {
    it('should get current network fee', async () => {
      const fee = await stellarService.getNetworkFee();
      expect(fee).toBeDefined();
      expect(typeof fee).toBe('number');
      expect(fee).toBeGreaterThan(0);
    }, 10000); // 10s timeout for network call
  });
});

describe('Stellar Price Service', () => {
  describe('Price Fetching', () => {
    it('should fetch XLM price', async () => {
      const price = await stellarPriceService.getAssetPrice('XLM');
      expect(price).toBeDefined();
      expect(typeof price).toBe('number');
      expect(price).toBeGreaterThanOrEqual(0);
    }, 15000); // 15s timeout for API call

    it('should fetch USDC price', async () => {
      const price = await stellarPriceService.getAssetPrice('USDC');
      expect(price).toBeDefined();
      expect(typeof price).toBe('number');
      expect(price).toBeGreaterThanOrEqual(0);
    }, 15000);

    it('should get all prices', async () => {
      const prices = await stellarPriceService.getAllPrices();
      expect(prices).toBeDefined();
      expect(prices.XLM).toBeDefined();
      expect(prices.USDC).toBeDefined();
      expect(typeof prices.XLM).toBe('number');
      expect(typeof prices.USDC).toBe('number');
    }, 15000);
  });

  describe('USD Value Calculation', () => {
    it('should calculate USD value for XLM', async () => {
      const usdValue = await stellarPriceService.calculateUSDValue('100', 'XLM');
      expect(usdValue).toBeDefined();
      expect(typeof usdValue).toBe('number');
      expect(usdValue).toBeGreaterThanOrEqual(0);
    }, 15000);

    it('should return 0 for zero amount', async () => {
      const usdValue = await stellarPriceService.calculateUSDValue('0', 'XLM');
      expect(usdValue).toBe(0);
    });
  });
});

describe('Stellar Wallet Service', () => {
  describe('Address Validation', () => {
    it('should validate Stellar addresses', () => {
      const validAddress = 'GDFJ2AWYVAYUFPPTYIDRM6GNJJS3P2OZRBEO4XEQU2CHZUOE262OYJQI';
      const isValid = stellarWalletService.validateAddress(validAddress);
      expect(isValid).toBe(true);
    });

    it('should invalidate wrong addresses', () => {
      const invalidAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';
      const isValid = stellarWalletService.validateAddress(invalidAddress);
      expect(isValid).toBe(false);
    });
  });

  describe('Network Info', () => {
    it('should get network info', async () => {
      const info = await stellarWalletService.getNetworkInfo();
      expect(info).toBeDefined();
      expect(info.network).toBeDefined();
      expect(info.horizonUrl).toBeDefined();
    });
  });
});

describe('Stellar Integration', () => {
  it('should have testnet configuration for testing', () => {
    const config = getStellarConfig();
    expect(config.network).toBe('testnet');
  });

  it('should have friendbot URL for testnet', () => {
    const config = getStellarConfig();
    if (config.network === 'testnet') {
      expect(config.friendbotUrl).toBeDefined();
    }
  });
});

// Note: These are basic unit tests. Integration tests with actual
// blockchain operations would require:
// 1. Test accounts with funded balances
// 2. Longer timeout settings
// 3. Proper cleanup after tests
// 4. Mocking for CI/CD environments

