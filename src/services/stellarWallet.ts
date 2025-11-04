import { Keypair, Asset, Operation, TransactionBuilder, Networks, BASE_FEE } from 'stellar-sdk';
import pino from 'pino';
import { stellarService } from './stellar';
import { getStellarConfig, STELLAR_ASSETS } from '../config/stellar';
import { redis, isRedisConnected } from '../config/redis';
import { recordTransaction, TransactionType } from './transactionLogger';
import { generateUUID } from '../utils';

// Configure logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty'
  }
});

export interface StellarWalletInfo {
  accountId: string;
  secretKey: string;
  balances: Array<{
    asset: string;
    balance: string;
    usdValue?: number;
  }>;
  sequence: string;
  isActive: boolean;
  createdAt: Date;
  lastActivity?: Date;
}

export interface StellarTransactionRequest {
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  asset: string;
  memo?: string;
  fee?: number;
}

export interface StellarTransactionResult {
  transactionId: string;
  transactionHash: string;
  status: 'pending' | 'success' | 'failed';
  fee: string;
  timestamp: Date;
}

export class StellarWalletService {
  private config = getStellarConfig();

  /**
   * Create a new Stellar wallet for a user
   */
  async createWallet(userId: string, phoneNumber?: string): Promise<StellarWalletInfo> {
    try {
      // Check if user already has a Stellar wallet
      const existingWallet = await this.getUserWallet(userId);
      if (existingWallet) {
        logger.info(`User ${userId} already has a Stellar wallet: ${existingWallet.accountId}`);
        return existingWallet;
      }

      // Generate new keypair
      const keypair = Keypair.random();
      const accountId = keypair.publicKey();
      const secretKey = keypair.secret();

      // Fund account on testnet
      if (this.config.network === 'testnet') {
        try {
          await stellarService.createAccount(secretKey);
          logger.info(`Funded testnet account: ${accountId}`);
          // Wait a moment for the account to be available on the network
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          logger.warn('Failed to fund testnet account, user will need to fund manually:', error);
        }
      }

      // Get initial account info with retry logic
      let accountInfo;
      let retries = 3;
      let retryDelay = 1000;
      
      while (retries > 0) {
        try {
          accountInfo = await stellarService.getAccountInfo(accountId);
          break; // Success, exit retry loop
        } catch (error: any) {
          retries--;
          if (retries === 0) {
            // If account info can't be fetched, create wallet with minimal info
            logger.warn(`Could not fetch account info for ${accountId}, creating wallet with minimal info`);
            accountInfo = {
              id: accountId,
              accountId: accountId,
              balances: [],
              sequence: '0',
              subentryCount: 0,
              lastModifiedLedger: 0,
              thresholds: {
                lowThreshold: 0,
                medThreshold: 0,
                highThreshold: 0
              },
              flags: {
                authRequired: false,
                authRevocable: false,
                authImmutable: false
              }
            };
            break;
          }
          logger.info(`Retrying account info fetch for ${accountId}, ${retries} retries left...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          retryDelay *= 2; // Exponential backoff
        }
      }
      
      // Ensure accountInfo is defined (should always be set by now, but TypeScript needs this)
      if (!accountInfo) {
        throw new Error('Failed to get account info after all retries');
      }
      
      const walletInfo: StellarWalletInfo = {
        accountId,
        secretKey,
        balances: accountInfo.balances.map(balance => ({
          asset: balance.asset.code,
          balance: balance.balance,
          usdValue: 0 // Will be calculated separately
        })),
        sequence: accountInfo.sequence,
        isActive: true,
        createdAt: new Date()
      };

      // Store wallet in cache and database
      await this.storeUserWallet(userId, walletInfo);

      // Log wallet creation
      await recordTransaction({
        type: TransactionType.STELLAR_WALLET_CREATION,
        txHash: 'wallet_creation',
        status: 'completed',
        fromAddress: 'system',
        toAddress: accountId,
        amount: 0,
        tokenType: 'XLM',
        chainName: 'stellar',
        userId,
        metadata: {
          accountId,
          createdAt: new Date()
        }
      });

      logger.info(`Created Stellar wallet for user ${userId}: ${accountId}`);
      return walletInfo;
    } catch (error) {
      logger.error('Error creating Stellar wallet:', error);
      throw new Error('Failed to create Stellar wallet');
    }
  }

  /**
   * Get user's Stellar wallet
   */
  async getUserWallet(userId: string): Promise<StellarWalletInfo | null> {
    try {
      const cacheKey = `stellar:wallet:${userId}`;
      
      // Check cache first
      if (isRedisConnected()) {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      // Query database for user's Stellar wallet
      const { User } = await import('../models/user');
      const user = await User.findById(userId).select('+stellarSecretKey'); // Include secret key
      
      if (!user || !user.stellarAccountId || !user.stellarSecretKey) {
        return null;
      }

      // Get current account info
      const accountInfo = await stellarService.getAccountInfo(user.stellarAccountId);
      
      const walletInfo: StellarWalletInfo = {
        accountId: user.stellarAccountId,
        secretKey: user.stellarSecretKey,
        balances: accountInfo.balances.map(balance => ({
          asset: balance.asset.code,
          balance: balance.balance,
          usdValue: 0
        })),
        sequence: accountInfo.sequence,
        isActive: true,
        createdAt: user.createdAt || new Date(),
        lastActivity: user.updatedAt || new Date()
      };

      // Cache the wallet info
      if (isRedisConnected()) {
        await redis.setex(cacheKey, 3600, JSON.stringify(walletInfo));
      }

      return walletInfo;
    } catch (error) {
      logger.error('Error getting user Stellar wallet:', error);
      return null;
    }
  }

  /**
   * Store user wallet information
   */
  private async storeUserWallet(userId: string, walletInfo: StellarWalletInfo): Promise<void> {
    try {
      const cacheKey = `stellar:wallet:${userId}`;
      
      // Store in database
      const { User } = await import('../models/user');
      await User.findByIdAndUpdate(userId, {
        stellarAccountId: walletInfo.accountId,
        stellarSecretKey: walletInfo.secretKey,
        stellarWalletCreated: true
      });

      // Store in cache
      if (isRedisConnected()) {
        await redis.setex(cacheKey, 3600, JSON.stringify(walletInfo)); // Cache for 1 hour
      }

      logger.info(`Stored Stellar wallet for user ${userId} in database`);
    } catch (error) {
      logger.error('Error storing user Stellar wallet:', error);
      throw error;
    }
  }

  /**
   * Get wallet balance for a specific asset
   */
  async getWalletBalance(userId: string, asset: string = 'XLM'): Promise<string> {
    try {
      const wallet = await this.getUserWallet(userId);
      if (!wallet) {
        throw new Error('Stellar wallet not found');
      }

      const balance = await stellarService.getBalance(wallet.accountId, asset);
      return balance;
    } catch (error) {
      logger.error('Error getting wallet balance:', error);
      throw new Error('Failed to get wallet balance');
    }
  }

  /**
   * Get all wallet balances
   */
  async getAllBalances(userId: string): Promise<Array<{ asset: string; balance: string; usdValue?: number }>> {
    try {
      const wallet = await this.getUserWallet(userId);
      if (!wallet) {
        throw new Error('Stellar wallet not found');
      }

      const accountInfo = await stellarService.getAccountInfo(wallet.accountId);
      
      return accountInfo.balances.map(balance => ({
        asset: balance.asset.code,
        balance: balance.balance,
        usdValue: 0 // Will be calculated with price service
      }));
    } catch (error) {
      logger.error('Error getting all balances:', error);
      throw new Error('Failed to get wallet balances');
    }
  }

  /**
   * Send payment from user's wallet
   */
  async sendPayment(
    userId: string,
    toAccountId: string,
    amount: string,
    asset: string = 'XLM',
    memo?: string
  ): Promise<StellarTransactionResult> {
    try {
      const wallet = await this.getUserWallet(userId);
      if (!wallet) {
        throw new Error('Stellar wallet not found');
      }

      // Validate recipient address
      if (!stellarService.validateAddress(toAccountId)) {
        throw new Error('Invalid recipient address');
      }

      // Check if user has sufficient balance
      const currentBalance = await this.getWalletBalance(userId, asset);
      if (parseFloat(currentBalance) < parseFloat(amount)) {
        throw new Error('Insufficient balance');
      }

      // Get network fee
      const networkFee = await stellarService.getNetworkFee();
      
      // Send payment
      const result = await stellarService.sendPayment(
        wallet.secretKey,
        toAccountId,
        amount,
        asset,
        undefined, // issuer - will be determined by asset
        memo
      );

      const transactionResult: StellarTransactionResult = {
        transactionId: result.transactionId,
        transactionHash: result.transactionHash,
        status: 'success',
        fee: networkFee.toString(),
        timestamp: new Date()
      };

      // Update wallet last activity
      wallet.lastActivity = new Date();
      await this.storeUserWallet(userId, wallet);

      logger.info(`Payment sent from ${wallet.accountId} to ${toAccountId}: ${amount} ${asset}`);
      return transactionResult;
    } catch (error) {
      logger.error('Error sending payment:', error);
      throw new Error('Failed to send payment');
    }
  }

  /**
   * Get transaction history for user's wallet
   */
  async getTransactionHistory(
    userId: string,
    limit: number = 10,
    cursor?: string
  ): Promise<{ transactions: any[]; nextCursor?: string }> {
    try {
      const wallet = await this.getUserWallet(userId);
      if (!wallet) {
        throw new Error('Stellar wallet not found');
      }

      return await stellarService.getTransactionHistory(wallet.accountId, limit, cursor);
    } catch (error) {
      logger.error('Error getting transaction history:', error);
      throw new Error('Failed to get transaction history');
    }
  }

  /**
   * Create trustline for an asset
   */
  async createTrustline(
    userId: string,
    assetCode: string,
    issuer: string,
    limit?: string
  ): Promise<{ transactionHash: string }> {
    try {
      const wallet = await this.getUserWallet(userId);
      if (!wallet) {
        throw new Error('Stellar wallet not found');
      }

      const result = await stellarService.createTrustline(
        wallet.secretKey,
        assetCode,
        issuer,
        limit
      );

      logger.info(`Trustline created for ${assetCode} by user ${userId}`);
      return result;
    } catch (error) {
      logger.error('Error creating trustline:', error);
      throw new Error('Failed to create trustline');
    }
  }

  /**
   * Get wallet address for user
   */
  async getWalletAddress(userId: string): Promise<string | null> {
    try {
      const wallet = await this.getUserWallet(userId);
      return wallet ? wallet.accountId : null;
    } catch (error) {
      logger.error('Error getting wallet address:', error);
      return null;
    }
  }

  /**
   * Validate Stellar address
   */
  validateAddress(address: string): boolean {
    return stellarService.validateAddress(address);
  }

  /**
   * Get network information
   */
  async getNetworkInfo(): Promise<{ network: string; horizonUrl: string; passphrase: string }> {
    return await stellarService.getNetworkInfo();
  }

  /**
   * Fund wallet with testnet XLM (testnet only)
   */
  async fundWallet(userId: string): Promise<{ success: boolean; message: string }> {
    try {
      if (this.config.network !== 'testnet') {
        return {
          success: false,
          message: 'Wallet funding is only available on testnet'
        };
      }

      const wallet = await this.getUserWallet(userId);
      if (!wallet) {
        throw new Error('Stellar wallet not found');
      }

      // Use friendbot to fund the account
      if (this.config.friendbotUrl) {
        const response = await fetch(this.config.friendbotUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            addr: wallet.accountId
          })
        });

        if (response.ok) {
          return {
            success: true,
            message: 'Wallet funded successfully with testnet XLM'
          };
        } else {
          return {
            success: false,
            message: 'Failed to fund wallet with friendbot'
          };
        }
      }

      return {
        success: false,
        message: 'Friendbot URL not configured'
      };
    } catch (error) {
      logger.error('Error funding wallet:', error);
      return {
        success: false,
        message: 'Failed to fund wallet'
      };
    }
  }
}

// Export singleton instance
export const stellarWalletService = new StellarWalletService();
