import pino from 'pino';
import { stellarWalletService } from './stellarWallet';
import { stellarPriceService } from './stellarPrice';
import { recordTransaction, TransactionType } from './transactionLogger';
import { generateUUID } from '../utils';
import { redis, isRedisConnected } from '../config/redis';

// Configure logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty'
  }
});

export interface StellarMpesaDepositRequest {
  userId: string;
  phoneNumber: string;
  amountKES: number;
  asset: string; // XLM or USDC
  memo?: string;
}

export interface StellarMpesaWithdrawalRequest {
  userId: string;
  phoneNumber: string;
  amountAsset: string; // Amount in Stellar asset
  asset: string; // XLM or USDC
  memo?: string;
}

export interface StellarMpesaTransaction {
  id: string;
  userId: string;
  phoneNumber: string;
  type: 'deposit' | 'withdrawal';
  amountKES: number;
  amountAsset: string;
  asset: string;
  exchangeRate: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  mpesaTransactionId?: string;
  stellarTransactionHash?: string;
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}

export class StellarMpesaService {
  private readonly CACHE_DURATION = 3600; // 1 hour
  private readonly EXCHANGE_RATE_CACHE_KEY = 'stellar:exchange_rate:kes_to_usd';

  /**
   * Convert KES to Stellar asset amount
   */
  async convertKesToStellarAsset(amountKES: number, asset: string): Promise<{
    amountAsset: string;
    exchangeRate: number;
    usdValue: number;
  }> {
    try {
      // Get KES to USD exchange rate
      const kesToUsdRate = await this.getKesToUsdRate();
      
      // Get Stellar asset price in USD
      const assetPriceUSD = await stellarPriceService.getAssetPrice(asset);
      
      if (assetPriceUSD === 0) {
        throw new Error(`Unable to get price for ${asset}`);
      }

      // Convert KES -> USD -> Stellar Asset
      const usdValue = amountKES * kesToUsdRate;
      const amountAsset = (usdValue / assetPriceUSD).toFixed(7); // 7 decimal places for precision
      
      const exchangeRate = kesToUsdRate / assetPriceUSD; // KES per Stellar asset unit

      return {
        amountAsset,
        exchangeRate,
        usdValue
      };
    } catch (error) {
      logger.error('Error converting KES to Stellar asset:', error);
      throw new Error('Failed to convert currency');
    }
  }

  /**
   * Convert Stellar asset amount to KES
   */
  async convertStellarAssetToKes(amountAsset: string, asset: string): Promise<{
    amountKES: number;
    exchangeRate: number;
    usdValue: number;
  }> {
    try {
      // Get KES to USD exchange rate
      const kesToUsdRate = await this.getKesToUsdRate();
      
      // Get Stellar asset price in USD
      const assetPriceUSD = await stellarPriceService.getAssetPrice(asset);
      
      if (assetPriceUSD === 0) {
        throw new Error(`Unable to get price for ${asset}`);
      }

      // Convert Stellar Asset -> USD -> KES
      const usdValue = parseFloat(amountAsset) * assetPriceUSD;
      const amountKES = usdValue / kesToUsdRate;
      
      const exchangeRate = assetPriceUSD / kesToUsdRate; // Stellar asset units per KES

      return {
        amountKES: Math.round(amountKES * 100) / 100, // Round to 2 decimal places
        exchangeRate,
        usdValue
      };
    } catch (error) {
      logger.error('Error converting Stellar asset to KES:', error);
      throw new Error('Failed to convert currency');
    }
  }

  /**
   * Get KES to USD exchange rate
   */
  private async getKesToUsdRate(): Promise<number> {
    try {
      // Check cache first
      if (isRedisConnected()) {
        const cached = await redis.get(this.EXCHANGE_RATE_CACHE_KEY);
        if (cached) {
          return parseFloat(cached);
        }
      }

      // Fetch from exchange rate API
      const response = await fetch('https://api.exchangerate-api.com/v4/latest/KES');
      if (!response.ok) {
        throw new Error('Failed to fetch exchange rate');
      }

      const data = await response.json();
      const rate = data.rates.USD;

      // Cache the rate
      if (isRedisConnected()) {
        await redis.setex(this.EXCHANGE_RATE_CACHE_KEY, this.CACHE_DURATION, rate.toString());
      }

      return rate;
    } catch (error) {
      logger.error('Error getting KES to USD rate:', error);
      // Fallback rate (approximate)
      return 0.0065; // 1 KES ≈ 0.0065 USD
    }
  }

  /**
   * Initiate Stellar deposit via MPESA
   */
  async initiateDeposit(request: StellarMpesaDepositRequest): Promise<{
    transactionId: string;
    status: string;
    message: string;
  }> {
    try {
      const transactionId = generateUUID();
      
      // Convert KES to Stellar asset
      const conversion = await this.convertKesToStellarAsset(request.amountKES, request.asset);
      
      // Create transaction record
      const transaction: StellarMpesaTransaction = {
        id: transactionId,
        userId: request.userId,
        phoneNumber: request.phoneNumber,
        type: 'deposit',
        amountKES: request.amountKES,
        amountAsset: conversion.amountAsset,
        asset: request.asset,
        exchangeRate: conversion.exchangeRate,
        status: 'pending',
        createdAt: new Date()
      };

      // Store transaction
      await this.storeTransaction(transaction);

      // Here you would integrate with your existing MPESA service
      // For now, we'll simulate the MPESA STK Push
      logger.info(`Stellar deposit initiated: ${transactionId}`);
      
      // In a real implementation, you would:
      // 1. Call your existing MPESA STK Push service
      // 2. Handle the MPESA callback
      // 3. Convert the MPESA payment to Stellar assets
      // 4. Send Stellar assets to user's wallet

      return {
        transactionId,
        status: 'pending',
        message: `Deposit initiated. You will receive ${conversion.amountAsset} ${request.asset} for ${request.amountKES} KES`
      };
    } catch (error) {
      logger.error('Error initiating Stellar deposit:', error);
      throw new Error('Failed to initiate deposit');
    }
  }

  /**
   * Initiate Stellar withdrawal to MPESA
   */
  async initiateWithdrawal(request: StellarMpesaWithdrawalRequest): Promise<{
    transactionId: string;
    status: string;
    message: string;
  }> {
    try {
      const transactionId = generateUUID();
      
      // Convert Stellar asset to KES
      const conversion = await this.convertStellarAssetToKes(request.amountAsset, request.asset);
      
      // Check user's Stellar wallet balance
      const userBalance = await stellarWalletService.getWalletBalance(request.userId, request.asset);
      if (parseFloat(userBalance) < parseFloat(request.amountAsset)) {
        throw new Error('Insufficient Stellar balance');
      }

      // Create transaction record
      const transaction: StellarMpesaTransaction = {
        id: transactionId,
        userId: request.userId,
        phoneNumber: request.phoneNumber,
        type: 'withdrawal',
        amountKES: conversion.amountKES,
        amountAsset: request.amountAsset,
        asset: request.asset,
        exchangeRate: conversion.exchangeRate,
        status: 'pending',
        createdAt: new Date()
      };

      // Store transaction
      await this.storeTransaction(transaction);

      // Here you would:
      // 1. Send Stellar assets from user's wallet to platform wallet
      // 2. Initiate MPESA B2C payment to user's phone number
      // 3. Handle the MPESA callback

      logger.info(`Stellar withdrawal initiated: ${transactionId}`);
      
      return {
        transactionId,
        status: 'pending',
        message: `Withdrawal initiated. You will receive ${conversion.amountKES} KES for ${request.amountAsset} ${request.asset}`
      };
    } catch (error) {
      logger.error('Error initiating Stellar withdrawal:', error);
      throw new Error('Failed to initiate withdrawal');
    }
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus(transactionId: string): Promise<StellarMpesaTransaction | null> {
    try {
      const cacheKey = `stellar:mpesa:transaction:${transactionId}`;
      
      if (isRedisConnected()) {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      // In a real implementation, you would query your database
      return null;
    } catch (error) {
      logger.error('Error getting transaction status:', error);
      return null;
    }
  }

  /**
   * Get user's transaction history
   */
  async getUserTransactionHistory(
    userId: string, 
    limit: number = 10
  ): Promise<StellarMpesaTransaction[]> {
    try {
      // In a real implementation, you would query your database
      // For now, return empty array
      logger.info(`Transaction history requested for user ${userId}`);
      return [];
    } catch (error) {
      logger.error('Error getting user transaction history:', error);
      return [];
    }
  }

  /**
   * Store transaction in cache/database
   */
  private async storeTransaction(transaction: StellarMpesaTransaction): Promise<void> {
    try {
      const cacheKey = `stellar:mpesa:transaction:${transaction.id}`;
      
      if (isRedisConnected()) {
        await redis.setex(cacheKey, this.CACHE_DURATION, JSON.stringify(transaction));
      }

      // In a real implementation, you would also store in your database
      logger.info(`Stored Stellar MPESA transaction: ${transaction.id}`);
    } catch (error) {
      logger.error('Error storing transaction:', error);
      throw error;
    }
  }

  /**
   * Update transaction status
   */
  async updateTransactionStatus(
    transactionId: string, 
    status: StellarMpesaTransaction['status'],
    additionalData?: {
      mpesaTransactionId?: string;
      stellarTransactionHash?: string;
      error?: string;
    }
  ): Promise<void> {
    try {
      const transaction = await this.getTransactionStatus(transactionId);
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      transaction.status = status;
      if (additionalData) {
        Object.assign(transaction, additionalData);
      }
      
      if (status === 'completed' || status === 'failed') {
        transaction.completedAt = new Date();
      }

      await this.storeTransaction(transaction);
      
      // Log the transaction update
      await recordTransaction({
        id: generateUUID(),
        type: TransactionType.STELLAR_MPESA_UPDATE,
        from: 'system',
        to: transaction.userId,
        amount: transaction.amountKES,
        asset: transaction.asset,
        chain: 'stellar',
        transactionHash: transaction.stellarTransactionHash || 'status_update',
        status: status === 'completed' ? 'success' : 'failed',
        timestamp: new Date()
      });

      logger.info(`Updated transaction ${transactionId} status to ${status}`);
    } catch (error) {
      logger.error('Error updating transaction status:', error);
      throw error;
    }
  }

  /**
   * Get exchange rate information
   */
  async getExchangeRates(): Promise<{
    kesToUsd: number;
    xlmPrice: number;
    usdcPrice: number;
    lastUpdated: Date;
  }> {
    try {
      const kesToUsd = await this.getKesToUsdRate();
      const xlmPrice = await stellarPriceService.getAssetPrice('XLM');
      const usdcPrice = await stellarPriceService.getAssetPrice('USDC');

      return {
        kesToUsd,
        xlmPrice,
        usdcPrice,
        lastUpdated: new Date()
      };
    } catch (error) {
      logger.error('Error getting exchange rates:', error);
      throw new Error('Failed to get exchange rates');
    }
  }
}

// Export singleton instance
export const stellarMpesaService = new StellarMpesaService();
