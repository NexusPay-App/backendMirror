import pino from 'pino';
import { stellarWalletService } from './stellarWallet';
import { stellarPriceService } from './stellarPrice';
import { recordTransaction, TransactionType } from './transactionLogger';
import { generateUUID } from '../utils';
import { redis, isRedisConnected } from '../config/redis';
import { StellarTransaction } from '../models/stellarTransaction';
import mongoose from 'mongoose';

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
      
      // Create transaction record in database
      const stellarTx = new StellarTransaction({
        transactionId,
        userId: new mongoose.Types.ObjectId(request.userId),
        type: 'deposit',
        status: 'pending',
        asset: request.asset,
        amount: conversion.amountAsset,
        fee: '0',
        memo: request.memo,
        phoneNumber: request.phoneNumber,
        amountKES: request.amountKES,
        exchangeRate: conversion.exchangeRate,
        metadata: {
          conversion,
          initiatedAt: new Date()
        }
      });

      await stellarTx.save();
      logger.info(`Stellar deposit transaction created in database: ${transactionId}`);

      // Import M-Pesa service and config
      const { initiateSTKPush } = await import('./mpesa');
      const config = (await import('../config/env')).default;
      
      // Format phone number for M-Pesa
      let formattedPhone = request.phoneNumber.replace(/\D/g, '');
      if (formattedPhone.startsWith('0')) {
        formattedPhone = '254' + formattedPhone.substring(1);
      } else if (!formattedPhone.startsWith('254')) {
        formattedPhone = '254' + formattedPhone;
      }

      // Initiate M-Pesa STK Push
      logger.info(`Initiating M-Pesa STK Push for Stellar deposit: ${transactionId}`);
      const mpesaResponse = await initiateSTKPush(
        formattedPhone,
        config.MPESA_SHORTCODE!,
        request.amountKES,
        `NexusPay Stellar ${request.asset}`,
        request.userId
      );

      if (!mpesaResponse) {
        stellarTx.status = 'failed';
        stellarTx.error = 'M-Pesa STK Push failed';
        await stellarTx.save();
        throw new Error('Failed to initiate M-Pesa STK Push');
      }

      // Update transaction with M-Pesa checkout request ID
      stellarTx.mpesaCheckoutRequestId = mpesaResponse.checkoutRequestId;
      stellarTx.status = 'processing';
      await stellarTx.save();

      // Also store in cache for quick lookup
      const cacheKey = `stellar:mpesa:checkout:${mpesaResponse.checkoutRequestId}`;
      if (isRedisConnected()) {
        await redis.setex(cacheKey, 3600, transactionId);
      }

      logger.info(`Stellar deposit initiated: ${transactionId}, M-Pesa checkout: ${mpesaResponse.checkoutRequestId}`);

      return {
        transactionId,
        status: 'processing',
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

      // Get user wallet
      const userWallet = await stellarWalletService.getUserWallet(request.userId);
      if (!userWallet) {
        throw new Error('Stellar wallet not found');
      }

      // Create transaction record in database
      const stellarTx = new StellarTransaction({
        transactionId,
        userId: new mongoose.Types.ObjectId(request.userId),
        type: 'withdrawal',
        status: 'processing',
        asset: request.asset,
        amount: request.amountAsset,
        fee: '0',
        memo: request.memo,
        fromAccountId: userWallet.accountId,
        phoneNumber: request.phoneNumber,
        amountKES: conversion.amountKES,
        exchangeRate: conversion.exchangeRate,
        metadata: {
          conversion,
          initiatedAt: new Date()
        }
      });

      await stellarTx.save();
      logger.info(`Stellar withdrawal transaction created in database: ${transactionId}`);

      // Transfer Stellar assets from user to platform wallet
      const { stellarService } = await import('./stellar');
      const { getStellarConfig } = await import('../config/stellar');
      const stellarConfig = getStellarConfig();

      if (!stellarConfig.platformWalletSecret) {
        throw new Error('Platform wallet not configured');
      }

      const { Keypair } = await import('stellar-sdk');
      const platformKeypair = Keypair.fromSecret(stellarConfig.platformWalletSecret);
      const platformAccountId = platformKeypair.publicKey();

      // Get asset issuer
      const assetIssuer = request.asset === 'USDC' ? stellarConfig.usdcIssuer 
        : request.asset === 'USDT' ? stellarConfig.usdtIssuer
        : request.asset === 'BTC' ? stellarConfig.btcIssuer
        : undefined;

      // Send Stellar payment from user to platform
      const transferResult = await stellarService.sendPayment(
        userWallet.secretKey,
        platformAccountId,
        request.amountAsset,
        request.asset,
        assetIssuer,
        `Withdrawal to M-Pesa: ${transactionId}`
      );

      // Update transaction with Stellar hash
      stellarTx.stellarTransactionHash = transferResult.transactionHash;
      stellarTx.toAccountId = platformAccountId;
      await stellarTx.save();

      logger.info(`Stellar assets transferred to platform: ${transferResult.transactionHash}`);

      // Initiate M-Pesa B2C payment
      // Note: B2C payment will be initiated via the callback system
      // For now, mark as processing and wait for manual B2C trigger
      stellarTx.status = 'processing';
      await stellarTx.save();
      
      logger.info(`Stellar withdrawal ready for B2C payment: ${transactionId}`);

      logger.info(`Stellar withdrawal initiated: ${transactionId}`);
      
      return {
        transactionId,
        status: 'processing',
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
      // Query database
      const stellarTx = await StellarTransaction.findOne({ transactionId }).lean() as any;
      
      if (!stellarTx) {
        return null;
      }

      // Map to StellarMpesaTransaction interface
      const transaction: StellarMpesaTransaction = {
        id: stellarTx.transactionId,
        userId: stellarTx.userId.toString(),
        phoneNumber: stellarTx.phoneNumber || '',
        type: stellarTx.type as 'deposit' | 'withdrawal',
        amountKES: stellarTx.amountKES || 0,
        amountAsset: stellarTx.amount,
        asset: stellarTx.asset,
        exchangeRate: stellarTx.exchangeRate || 0,
        status: stellarTx.status as 'pending' | 'processing' | 'completed' | 'failed',
        mpesaTransactionId: stellarTx.mpesaReceiptNumber,
        stellarTransactionHash: stellarTx.stellarTransactionHash,
        createdAt: stellarTx.createdAt,
        completedAt: stellarTx.completedAt,
        error: stellarTx.error
      };

      return transaction;
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
      // Query database for user's transactions
      const stellarTxs = await StellarTransaction.find({
        userId: new mongoose.Types.ObjectId(userId),
        type: { $in: ['deposit', 'withdrawal'] }
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean() as any[];

      // Map to StellarMpesaTransaction interface
      const transactions: StellarMpesaTransaction[] = stellarTxs.map(tx => ({
        id: tx.transactionId,
        userId: tx.userId.toString(),
        phoneNumber: tx.phoneNumber || '',
        type: tx.type as 'deposit' | 'withdrawal',
        amountKES: tx.amountKES || 0,
        amountAsset: tx.amount,
        asset: tx.asset,
        exchangeRate: tx.exchangeRate || 0,
        status: tx.status as 'pending' | 'processing' | 'completed' | 'failed',
        mpesaTransactionId: tx.mpesaReceiptNumber,
        stellarTransactionHash: tx.stellarTransactionHash,
        createdAt: tx.createdAt,
        completedAt: tx.completedAt,
        error: tx.error
      }));

      return transactions;
    } catch (error) {
      logger.error('Error getting user transaction history:', error);
      return [];
    }
  }

  /**
   * Store transaction in cache/database (deprecated - now using StellarTransaction model directly)
   */
  private async storeTransaction(transaction: StellarMpesaTransaction): Promise<void> {
    // This method is deprecated - transactions are now stored directly in the database
    // Keeping for backwards compatibility
    logger.warn('storeTransaction is deprecated - use StellarTransaction model directly');
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
      const stellarTx = await StellarTransaction.findOne({ transactionId });
      if (!stellarTx) {
        throw new Error('Transaction not found');
      }

      // Update status
      stellarTx.status = status;
      
      // Update additional data
      if (additionalData) {
        if (additionalData.mpesaTransactionId) {
          stellarTx.mpesaReceiptNumber = additionalData.mpesaTransactionId;
        }
        if (additionalData.stellarTransactionHash) {
          stellarTx.stellarTransactionHash = additionalData.stellarTransactionHash;
        }
        if (additionalData.error) {
          stellarTx.error = additionalData.error;
        }
      }
      
      // Set completion timestamp
      if (status === 'completed' || status === 'failed') {
        stellarTx.completedAt = new Date();
      }

      await stellarTx.save();
      
      // Log the transaction update
      await recordTransaction({
        type: TransactionType.STELLAR_MPESA_UPDATE,
        txHash: stellarTx.stellarTransactionHash || 'status_update',
        status: status === 'completed' ? 'completed' : 'failed',
        amount: stellarTx.amountKES || 0,
        tokenType: stellarTx.asset,
        chainName: 'stellar',
        userId: stellarTx.userId.toString(),
        metadata: {
          from: 'system',
          to: stellarTx.userId.toString(),
          asset: stellarTx.asset
        }
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
