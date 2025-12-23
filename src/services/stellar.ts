import StellarSdk from 'stellar-sdk';
import pino from 'pino';
import { 
  getStellarConfig, 
  StellarConfig, 
  StellarAccount, 
  StellarTransaction, 
  StellarAsset,
  STELLAR_ASSETS,
  STELLAR_CACHE_KEYS,
  STELLAR_CONSTANTS
} from '../config/stellar';
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

export class StellarService {
  public server: any; // Horizon.Server type from stellar-sdk - public for advanced operations
  private config: StellarConfig;
  private networkPassphrase: string;

  constructor() {
    this.config = getStellarConfig();
    this.server = new StellarSdk.Horizon.Server(this.config.horizonUrl);
    this.networkPassphrase = this.config.network === 'mainnet' 
      ? StellarSdk.Networks.PUBLIC 
      : StellarSdk.Networks.TESTNET;
  }

  /**
   * Generate a new Stellar keypair
   */
  generateKeypair(): { publicKey: string; secretKey: string } {
    try {
      const keypair = StellarSdk.Keypair.random();
      return {
        publicKey: keypair.publicKey(),
        secretKey: keypair.secret()
      };
    } catch (error) {
      logger.error('Error generating Stellar keypair:', error);
      throw new Error('Failed to generate Stellar keypair');
    }
  }

  /**
   * Create a new Stellar account (fund with friendbot on testnet)
   */
  async createAccount(secretKey?: string): Promise<{ accountId: string; secretKey: string }> {
    try {
      let keypair: typeof StellarSdk.Keypair.prototype;
      
      if (secretKey) {
        keypair = StellarSdk.Keypair.fromSecret(secretKey);
      } else {
        keypair = StellarSdk.Keypair.random();
      }

      const accountId = keypair.publicKey();

      // Fund account with friendbot on testnet
      if (this.config.network === 'testnet' && this.config.friendbotUrl) {
        try {
          const response = await fetch(this.config.friendbotUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              addr: accountId
            })
          });

          if (!response.ok) {
            throw new Error(`Friendbot funding failed: ${response.statusText}`);
          }

          logger.info(`Account ${accountId} funded with friendbot`);
        } catch (error) {
          logger.warn('Friendbot funding failed, account may need manual funding:', error);
        }
      }

      return {
        accountId,
        secretKey: keypair.secret()
      };
    } catch (error) {
      logger.error('Error creating Stellar account:', error);
      throw new Error('Failed to create Stellar account');
    }
  }

  /**
   * Get account information and balances
   */
  async getAccountInfo(accountId: string): Promise<StellarAccount> {
    try {
      // Check cache first
      const cacheKey = `${STELLAR_CACHE_KEYS.ACCOUNT_INFO}${accountId}`;
      if (isRedisConnected()) {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      const account = await this.server.loadAccount(accountId);
      
      const stellarAccount: StellarAccount = {
        id: accountId,
        accountId: accountId,
        balances: account.balances.map((balance: any) => ({
          asset: {
            code: balance.asset_code || 'XLM',
            issuer: balance.asset_issuer,
            type: balance.asset_type === 'native' ? 'native' : 'credit_alphanum4'
          },
          balance: balance.balance,
          limit: balance.limit
        })),
        sequence: account.sequenceNumber(),
        subentryCount: account.subentry_count,
        inflationDestination: account.inflation_destination,
        homeDomain: account.home_domain,
        lastModifiedLedger: account.last_modified_ledger,
        thresholds: {
          lowThreshold: account.thresholds.low_threshold,
          medThreshold: account.thresholds.med_threshold,
          highThreshold: account.thresholds.high_threshold
        },
        flags: {
          authRequired: account.flags.auth_required,
          authRevocable: account.flags.auth_revocable,
          authImmutable: account.flags.auth_immutable
        }
      };

      // Cache the result
      if (isRedisConnected()) {
        await redis.setex(cacheKey, 60, JSON.stringify(stellarAccount)); // Cache for 1 minute
      }

      return stellarAccount;
    } catch (error) {
      logger.error('Error getting Stellar account info:', error);
      throw new Error('Failed to get account information');
    }
  }

  /**
   * Get account balance for a specific asset
   */
  async getBalance(accountId: string, assetCode: string = 'XLM', issuer?: string): Promise<string> {
    try {
      const account = await this.getAccountInfo(accountId);
      
      const balance = account.balances.find(b => {
        if (assetCode === 'XLM') {
          return b.asset.type === 'native';
        }
        return b.asset.code === assetCode && b.asset.issuer === issuer;
      });

      return balance ? balance.balance : '0';
    } catch (error) {
      logger.error('Error getting Stellar balance:', error);
      throw new Error('Failed to get account balance');
    }
  }

  /**
   * Send a payment transaction
   */
  async sendPayment(
    fromSecretKey: string,
    toAccountId: string,
    amount: string,
    assetCode: string = 'XLM',
    issuer?: string,
    memo?: string
  ): Promise<{ transactionHash: string; transactionId: string }> {
    try {
      const sourceKeypair = StellarSdk.Keypair.fromSecret(fromSecretKey);
      const sourceAccount = await this.server.loadAccount(sourceKeypair.publicKey());

      // Create asset
      const asset = assetCode === 'XLM' 
        ? StellarSdk.Asset.native() 
        : new StellarSdk.Asset(assetCode, issuer!);

      // Check if destination account exists
      let destinationAccountExists = false;
      try {
        await this.server.loadAccount(toAccountId);
        destinationAccountExists = true;
      } catch (error) {
        // Account doesn't exist
        destinationAccountExists = false;
      }

      // Build transaction
      const transactionBuilder = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.networkPassphrase
      });

      // For XLM payments to non-existent accounts, use createAccount operation
      // For other assets, the account must exist (they need trustlines)
      if (!destinationAccountExists && assetCode === 'XLM') {
        // Use createAccount operation to create the account with the XLM amount
        // The amount must be at least 1 XLM (minimum balance requirement)
        const amountNum = parseFloat(amount);
        if (amountNum < 1.0) {
          throw new Error(`Cannot create Stellar account: Amount (${amount} XLM) is less than minimum required balance of 1 XLM`);
        }
        
        transactionBuilder.addOperation(
          StellarSdk.Operation.createAccount({
            destination: toAccountId,
            startingBalance: amount
          })
        );
      } else if (!destinationAccountExists && assetCode !== 'XLM') {
        throw new Error(`Cannot send ${assetCode} to non-existent account ${toAccountId}. Account must exist and have trustline for ${assetCode}.`);
      } else {
        // Account exists, use regular payment
        transactionBuilder.addOperation(
          StellarSdk.Operation.payment({
            destination: toAccountId,
            asset: asset,
            amount: amount
          })
        );
      }

      const transaction = transactionBuilder.setTimeout(STELLAR_CONSTANTS.TRANSACTION_TIMEOUT);

      // Add memo if provided
      if (memo) {
        transaction.addMemo(StellarSdk.Memo.text(memo));
      }

      const transactionXDR = transaction.build();
      transactionXDR.sign(sourceKeypair);

      // Submit transaction
      const result = await this.server.submitTransaction(transactionXDR);
      
      const transactionId = generateUUID();
      
      // Log transaction
      await recordTransaction({
        type: TransactionType.STELLAR_PAYMENT,
        txHash: result.hash,
        status: 'completed',
        fromAddress: sourceKeypair.publicKey(),
        toAddress: toAccountId,
        amount: parseFloat(amount),
        tokenType: assetCode,
        chainName: 'stellar',
        metadata: {
          transactionId,
          timestamp: new Date()
        }
      });

      logger.info(`Stellar payment successful: ${result.hash}`);

      return {
        transactionHash: result.hash,
        transactionId
      };
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      const errorDetails = error?.response?.data || error?.extras || error;
      logger.error('Error sending Stellar payment:', {
        message: errorMessage,
        details: errorDetails,
        fromAccount: fromSecretKey ? StellarSdk.Keypair.fromSecret(fromSecretKey).publicKey() : 'unknown',
        toAccount: toAccountId,
        amount,
        assetCode,
        issuer
      });
      throw new Error(`Failed to send payment: ${errorMessage}`);
    }
  }

  /**
   * Get transaction history for an account
   */
  async getTransactionHistory(
    accountId: string, 
    limit: number = 10,
    cursor?: string
  ): Promise<{ transactions: StellarTransaction[]; nextCursor?: string }> {
    try {
      const cacheKey = `${STELLAR_CACHE_KEYS.TRANSACTION_HISTORY}${accountId}:${limit}:${cursor || 'latest'}`;
      
      // Check cache first
      if (isRedisConnected()) {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      const records = await this.server
        .transactions()
        .forAccount(accountId)
        .order('desc')
        .limit(limit);

      if (cursor) {
        records.cursor(cursor);
      }

      const response = await records.call();
      
      const transactions: StellarTransaction[] = response.records.map((record: any) => ({
        id: record.id,
        hash: record.hash,
        source: record.source_account,
        destination: record.to || record.from,
        amount: record.amount || '0',
        asset: {
          code: record.asset_code || 'XLM',
          issuer: record.asset_issuer,
          type: record.asset_type === 'native' ? 'native' : 'credit_alphanum4'
        },
        fee: record.fee_paid,
        memo: record.memo,
        createdAt: record.created_at,
        status: record.successful ? 'success' : 'failed'
      }));

      const result = {
        transactions,
        nextCursor: response.records.length === limit ? response.records[response.records.length - 1].paging_token : undefined
      };

      // Cache the result
      if (isRedisConnected()) {
        await redis.setex(cacheKey, 300, JSON.stringify(result)); // Cache for 5 minutes
      }

      return result;
    } catch (error) {
      logger.error('Error getting Stellar transaction history:', error);
      throw new Error('Failed to get transaction history');
    }
  }

  /**
   * Create a trustline for an asset
   */
  async createTrustline(
    accountSecretKey: string,
    assetCode: string,
    issuer: string,
    limit?: string
  ): Promise<{ transactionHash: string }> {
    try {
      const sourceKeypair = StellarSdk.Keypair.fromSecret(accountSecretKey);
      const sourceAccount = await this.server.loadAccount(sourceKeypair.publicKey());

      const asset = new StellarSdk.Asset(assetCode, issuer);

      const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.networkPassphrase
      })
        .addOperation(
          StellarSdk.Operation.changeTrust({
            asset: asset,
            limit: limit
          })
        )
        .setTimeout(STELLAR_CONSTANTS.TRANSACTION_TIMEOUT)
        .build();

      transaction.sign(sourceKeypair);

      const result = await this.server.submitTransaction(transaction);
      
      logger.info(`Trustline created for ${assetCode}: ${result.hash}`);

      return {
        transactionHash: result.hash
      };
    } catch (error) {
      logger.error('Error creating Stellar trustline:', error);
      throw new Error('Failed to create trustline');
    }
  }

  /**
   * Create multiple trustlines in a single transaction (faster, more efficient)
   */
  async createTrustlinesBatch(
    accountSecretKey: string,
    assets: Array<{ code: string; issuer: string; limit?: string }>
  ): Promise<{ transactionHash: string }> {
    try {
      if (assets.length === 0) {
        throw new Error('No assets provided for trustline creation');
      }

      const sourceKeypair = StellarSdk.Keypair.fromSecret(accountSecretKey);
      const sourceAccount = await this.server.loadAccount(sourceKeypair.publicKey());

      const transactionBuilder = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: StellarSdk.BASE_FEE * assets.length, // Fee per operation
        networkPassphrase: this.networkPassphrase
      });

      // Add all trustline operations to single transaction
      for (const asset of assets) {
        const stellarAsset = new StellarSdk.Asset(asset.code, asset.issuer);
        transactionBuilder.addOperation(
          StellarSdk.Operation.changeTrust({
            asset: stellarAsset,
            limit: asset.limit
          })
        );
      }

      const transaction = transactionBuilder
        .setTimeout(STELLAR_CONSTANTS.TRANSACTION_TIMEOUT)
        .build();

      transaction.sign(sourceKeypair);

      const result = await this.server.submitTransaction(transaction);
      
      logger.info(`Batch trustlines created (${assets.length} assets): ${result.hash}`);

      return {
        transactionHash: result.hash
      };
    } catch (error: any) {
      logger.error('Error creating batch trustlines:', error);
      // If batch fails, fall back to individual creation
      throw new Error(`Failed to create trustlines: ${error?.message || error}`);
    }
  }

  /**
   * Get current network fee
   */
  async getNetworkFee(): Promise<number> {
    try {
      const cacheKey = STELLAR_CACHE_KEYS.FEE_POOL;
      
      // Check cache first
      if (isRedisConnected()) {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return parseInt(cached);
        }
      }

      const feeStats = await this.server.feeStats();
      const fee = parseInt(feeStats.fee_charged.mode);

      // Cache the result
      if (isRedisConnected()) {
        await redis.setex(cacheKey, 300, fee.toString()); // Cache for 5 minutes
      }

      return fee;
    } catch (error) {
      logger.error('Error getting Stellar network fee:', error);
      return STELLAR_CONSTANTS.BASE_FEE;
    }
  }

  /**
   * Validate Stellar address
   */
  validateAddress(address: string): boolean {
    try {
      StellarSdk.Keypair.fromPublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get network information
   */
  async getNetworkInfo(): Promise<{ network: string; horizonUrl: string; passphrase: string }> {
    return {
      network: this.config.network,
      horizonUrl: this.config.horizonUrl,
      passphrase: this.networkPassphrase
    };
  }
}

// Export singleton instance
export const stellarService = new StellarService();
