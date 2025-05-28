import { privateKeyToAccount, smartWallet } from "thirdweb/wallets";
import { defineChain, getContract, sendTransaction } from "thirdweb";
import { transfer, balanceOf } from "thirdweb/extensions/erc20";
import { client } from './auth';
import config from "../config/env";
import { randomUUID } from "crypto";
import Redis from 'ioredis';
import { ethers } from 'ethers';
import { Chain, TokenSymbol } from "../types/token";
import { getTokenConfig } from "../config/tokens";
import { generateUUID, maskAddress } from '../utils';
import { createClient } from 'redis';
import { recordTransaction, TransactionType } from './transactionLogger';
import pino from 'pino';
import { promiseWithTimeout } from '../utils/promises';
import mongoose from 'mongoose';
import { logTransactionForReconciliation } from './reconciliation';

// Initialize Redis client for caching
const redis = new Redis(config.REDIS_URL);

// Configure logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty'
  }
});

// Connect to Redis
redis.connect().catch(err => {
  logger.error('Redis connection error:', err);
});

/**
 * Platform wallet structure which maintains separate wallets for different purposes
 */
interface PlatformWallets {
  main: {
    address: string;
    privateKey: string | null; // Smart wallets don't need private keys
  };
  fees: {
    address: string;
    privateKey: string;
  };
}

// Cache keys
const PLATFORM_WALLETS_CACHE_KEY = 'platform:wallets';
const WALLET_BALANCE_CACHE_PREFIX = 'wallet:balance:';
const TOKEN_PRICE_CACHE_PREFIX = 'token_price:';
const GAS_PRICE_CACHE_PREFIX = 'gas_price:';
const TRANSACTION_HISTORY_CACHE_PREFIX = 'tx_history:';

// Transaction queue management
interface QueuedTransaction {
  id: string;
  toAddress: string;
  amount: number;
  chainName: string;
  tokenType: TokenSymbol;
  timestamp: number;
  attempts: number;
  lastAttempt?: number;
  error?: string;
  priority?: 'high' | 'normal' | 'low';
  batchId?: string;
  isProcessing?: boolean;
  escrowId?: string;
  originalTransactionId?: string;
}

const TRANSACTION_QUEUE_KEY = 'tx_queue';
const HIGH_PRIORITY_QUEUE_KEY = 'tx_queue:high';
const NORMAL_PRIORITY_QUEUE_KEY = 'tx_queue:normal';
const LOW_PRIORITY_QUEUE_KEY = 'tx_queue:low';
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAY_MS = 30000; // 30 seconds

// Increased batch size for better throughput
const BATCH_SIZE = 10;
// Maximum gas limit factor for batched transactions
const MAX_BATCH_GAS_LIMIT_FACTOR = 0.8;

/**
 * Initialize platform wallets
 * This creates or loads both the main platform wallet and the fees wallet
 */
export async function initializePlatformWallets(): Promise<PlatformWallets> {
  // Try to get from cache first
  const cachedWallets = await redis.get(PLATFORM_WALLETS_CACHE_KEY);
  
  if (cachedWallets) {
    try {
      return JSON.parse(cachedWallets);
    } catch (error) {
      console.error('Error parsing cached wallets:', error);
      // Continue to create new wallets if parsing fails
    }
  }
  
  // Main wallet is configured in env variables
  // For smart wallets, we need the controlling EOA private key
  const mainWallet = {
    address: '0x182d87B8cb79D792d8E9bd9227cA645CA9F9263e', // Hardcoded smart wallet address
    privateKey: process.env.DEV_PLATFORM_WALLET_PRIVATE_KEY || null // The EOA that controls the smart wallet
  };
  
  // Check if we have the fees wallet stored in the database
  // If not, create a new one
  let feesWallet;
  
  try {
    // Try to retrieve fees wallet from database or create a new one
    feesWallet = await getOrCreateFeesWallet();
  } catch (error) {
    console.error('Error getting/creating fees wallet:', error);
    throw error;
  }
  
  const platformWallets: PlatformWallets = {
    main: mainWallet,
    fees: feesWallet
  };
  
  // Cache the wallets
  await redis.set(PLATFORM_WALLETS_CACHE_KEY, JSON.stringify(platformWallets));
  
  return platformWallets;
}

/**
 * Get or create a fees wallet
 * This function should check a database for an existing fees wallet
 * or create a new one if it doesn't exist
 */
async function getOrCreateFeesWallet(): Promise<{ address: string; privateKey: string }> {
  // In a production environment, this should retrieve from a secure database
  // For now, we'll generate a new wallet if not configured
  
  // Check if fees wallet is configured in env (recommended for production)
  if (process.env.FEES_WALLET_ADDRESS && process.env.FEES_WALLET_PRIVATE_KEY) {
    return {
      address: process.env.FEES_WALLET_ADDRESS,
      privateKey: process.env.FEES_WALLET_PRIVATE_KEY
    };
  }
  
  // For development, create a new wallet using ethers
  // In production, this should be securely stored
  console.warn('CREATING NEW FEES WALLET - In production, this should be configured and secured');
  const wallet = ethers.Wallet.createRandom();
  
  return {
    address: wallet.address,
    privateKey: wallet.privateKey
  };
}

/**
 * Get wallet balances with caching
 * @param walletAddress The wallet address to check
 * @param chainName The blockchain to check on
 * @returns The wallet balance in human-readable token units (adjusted for decimals)
 */
export async function getWalletBalance(
  walletAddress: string, 
  chainName: string = 'celo'
): Promise<number> {
  const cacheKey = `${WALLET_BALANCE_CACHE_PREFIX}${chainName}:${walletAddress}`;
  
  // Try to get from cache
  const cachedBalance = await redis.get(cacheKey);
  if (cachedBalance) {
    return parseFloat(cachedBalance);
  }
  
  try {
    const chainConfig = config[chainName];
    if (!chainConfig || !chainConfig.chainId || !chainConfig.tokenAddress) {
      throw new Error(`Invalid chain configuration for ${chainName}`);
    }
    
    const chain = defineChain(chainConfig.chainId);
    const tokenAddress = chainConfig.tokenAddress;
    
    const contract = getContract({
      client,
      chain,
      address: tokenAddress,
    });
    
    // Get balance in raw units
    const rawBalance = await balanceOf({
      contract,
      address: walletAddress
    });
    
    // Get token configuration to determine decimals
    // For legacy chains, we need to determine the token type
    let decimals = 18; // Default
    
    // Try to get token config for the default token on this chain
    try {
      const tokenConfig = getTokenConfig(chainName as Chain, 'USDC');
      if (tokenConfig && tokenConfig.address.toLowerCase() === tokenAddress.toLowerCase()) {
        decimals = tokenConfig.decimals || 6; // USDC typically has 6 decimals
      }
    } catch (error) {
      // If we can't get token config, try USDT or use default
      try {
        const tokenConfig = getTokenConfig(chainName as Chain, 'USDT');
        if (tokenConfig && tokenConfig.address.toLowerCase() === tokenAddress.toLowerCase()) {
          decimals = tokenConfig.decimals || 6; // USDT typically has 6 decimals
        }
      } catch (error) {
        // Use default 18 decimals
      }
    }
    
    // Convert to human-readable format
    const humanReadableBalance = parseFloat(rawBalance.toString()) / Math.pow(10, decimals);
    
    // Cache the human-readable balance for 2 minutes
    await redis.set(cacheKey, humanReadableBalance.toString(), 'EX', 120);
    
    return humanReadableBalance;
  } catch (error) {
    console.error(`Error getting balance for ${walletAddress} on ${chainName}:`, error);
    throw error;
  }
}

/**
 * Transfer tokens between platform wallets
 * @param from Source wallet (main or fees)
 * @param to Destination wallet (main or fees)
 * @param amount Amount to transfer
 * @param chainName Blockchain to use
 * @returns Transaction hash
 */
export async function transferBetweenPlatformWallets(
  from: 'main' | 'fees',
  to: 'main' | 'fees',
  amount: number,
  chainName: string = 'celo'
): Promise<{ transactionHash: string }> {
  // Get platform wallets
  const platformWallets = await initializePlatformWallets();
  
  const sourceWallet = platformWallets[from];
  const destinationWallet = platformWallets[to];
  
  // Validate amount
  if (!amount || amount <= 0) {
    throw new Error('Invalid transfer amount');
  }
  
  // Validate wallets
  if (!sourceWallet || !destinationWallet) {
    throw new Error(`Invalid wallet(s) specified: ${from} to ${to}`);
  }
  
  try {
    const chainConfig = config[chainName];
    if (!chainConfig || !chainConfig.chainId || !chainConfig.tokenAddress) {
      throw new Error(`Invalid chain configuration for ${chainName}`);
    }
    
    const chain = defineChain(chainConfig.chainId);
    const tokenAddress = chainConfig.tokenAddress;
    
    // Check if we have a controller private key for the smart wallet
    if (sourceWallet.privateKey === null) {
      throw new Error('DEV_PLATFORM_WALLET_PRIVATE_KEY environment variable is required to control the smart wallet. Please set this to the private key of the EOA that controls your smart wallet.');
    }
    
    // Create wallet from private key (this is the controlling EOA for smart wallets)
    const personalAccount = privateKeyToAccount({
      client,
      privateKey: sourceWallet.privateKey
    });
    
    // Connect the smart wallet
    const wallet = smartWallet({
      chain,
      sponsorGas: true,
    });
    
    const smartAccount = await wallet.connect({
      client,
      personalAccount,
    });
    
    // Get contract
    const contract = getContract({
      client,
      chain,
      address: tokenAddress,
    });
    
    // Transfer tokens
    const transaction = transfer({
      contract,
      to: destinationWallet.address,
      amount,
    });
    
    // Execute transaction
    const tx = await sendTransaction({
      transaction,
      account: smartAccount,
    });
    
    // Invalidate cache
    await redis.del(`${WALLET_BALANCE_CACHE_PREFIX}${chainName}:${sourceWallet.address}`);
    await redis.del(`${WALLET_BALANCE_CACHE_PREFIX}${chainName}:${destinationWallet.address}`);
    
    return { transactionHash: tx.transactionHash };
  } catch (error) {
    console.error(`Error transferring between platform wallets (${from} to ${to}):`, error);
    throw error;
  }
}

/**
 * Process transaction fee
 * This collects fees to the fees wallet during user transactions
 * @param amount Transaction amount
 * @param userPrivateKey User's private key to authorize the transaction
 * @param userAddress User's wallet address
 * @param chainName Blockchain to use
 * @returns Transaction hash
 */
export async function collectTransactionFee(
  amount: number,
  userPrivateKey: string,
  userAddress: string,
  chainName: string = 'celo'
): Promise<{ transactionHash: string | null }> {
  // Calculate fee based on amount
  const fee = calculateTransactionFee(amount);
  
  if (fee <= 0) {
    return { transactionHash: null }; // No fee to collect
  }
  
  try {
    // Get platform wallets
    const platformWallets = await initializePlatformWallets();
    
    // Send fee from user wallet to fees wallet
    const txResult = await sendTokenFromUser(
      platformWallets.fees.address,
      fee,
      userPrivateKey,
      chainName
    );
    
    return { transactionHash: txResult.transactionHash };
  } catch (error) {
    console.error('Error collecting transaction fee:', error);
    // Don't fail the main transaction if fee collection fails
    return { transactionHash: null };
  }
}

/**
 * Calculate transaction fee based on transaction amount
 * This implements a tiered fee structure
 */
function calculateTransactionFee(amount: number): number {
  if (amount <= 1) return 0;
  if (amount <= 5) return 0.05;
  if (amount <= 10) return 0.1;
  if (amount <= 15) return 0.2;
  if (amount <= 25) return 0.3;
  if (amount <= 35) return 0.45;
  if (amount <= 50) return 0.5;
  if (amount <= 75) return 0.68;
  if (amount <= 100) return 0.79;
  if (amount <= 150) return 0.88;
  return 0.95; // For amounts above $150.01
}

/**
 * Queue a transaction for processing with deduplication and balance validation
 */
export async function queueTransaction(
  toAddress: string,
  amount: number,
  chainName: string = 'celo',
  tokenType: TokenSymbol = 'USDC',
  priority: 'high' | 'normal' | 'low' = 'normal',
  escrowId?: string,
  originalTransactionId?: string
): Promise<string> {
  try {
    // Check if this escrow transaction is already queued
    if (escrowId) {
      const existingTx = await checkIfTransactionQueued(escrowId);
      if (existingTx) {
        logger.info(`Transaction for escrow ${escrowId} already queued with ID ${existingTx.id}`);
        return existingTx.id;
      }
    }

    // Validate platform wallet balance before queueing
    const platformWallets = await initializePlatformWallets();
    const currentBalance = await getTokenBalanceOnChain(
      platformWallets.main.address, 
      chainName, 
      tokenType
    );
    
    // Get token configuration for decimals
    const tokenConfig = getTokenConfig(chainName as Chain, tokenType);
    if (!tokenConfig) {
      throw new Error(`Token ${tokenType} not supported on chain ${chainName}`);
    }
    
    // Convert both amounts to raw format for accurate comparison
    const decimals = tokenConfig.decimals || 18;
    const rawRequestedAmount = Math.floor(amount * Math.pow(10, decimals));
    const rawCurrentBalance = Math.floor(currentBalance * Math.pow(10, decimals));
    
    logger.info(`Balance validation: ${currentBalance} ${tokenType} (${rawCurrentBalance} raw) vs ${amount} ${tokenType} (${rawRequestedAmount} raw)`);
    
    if (rawCurrentBalance < rawRequestedAmount) {
      const error = `Insufficient platform wallet balance: ${currentBalance} ${tokenType} (${rawCurrentBalance} raw) < ${amount} ${tokenType} (${rawRequestedAmount} raw) on ${chainName}`;
      logger.error(error);
      
      // If this is for an escrow, mark it as failed due to insufficient funds
      if (escrowId) {
        try {
          await mongoose.model('Escrow').findByIdAndUpdate(escrowId, {
            $set: {
              status: 'failed',
              completedAt: new Date(),
              'metadata.error': error,
              'metadata.errorCode': 'INSUFFICIENT_PLATFORM_BALANCE',
              'metadata.needsManualReview': true
            }
          });
          logger.info(`Marked escrow ${escrowId} as failed due to insufficient platform balance`);
        } catch (escrowError) {
          logger.error(`Error updating escrow ${escrowId}:`, escrowError);
        }
      }
      
      throw new Error(error);
    }

    // Generate a transaction ID
    const txId = generateUUID();
    
    // Determine which queue to use based on priority
    let queueKey = TRANSACTION_QUEUE_KEY;
    switch (priority) {
      case 'high':
        queueKey = HIGH_PRIORITY_QUEUE_KEY;
        break;
      case 'normal':
        queueKey = NORMAL_PRIORITY_QUEUE_KEY;
        break;
      case 'low':
        queueKey = LOW_PRIORITY_QUEUE_KEY;
        break;
    }
    
    // Create the queued transaction object
    const queuedTx: QueuedTransaction = {
      id: txId,
      toAddress,
      amount,
      chainName,
      tokenType,
      timestamp: Date.now(),
      attempts: 0,
      priority,
      isProcessing: false,
      escrowId,
      originalTransactionId
    };
    
    // Add to the appropriate queue
    await redis.lpush(queueKey, JSON.stringify(queuedTx));
    
    // Store in a separate index for deduplication
    if (escrowId) {
      await redis.set(`tx_queue_index:${escrowId}`, JSON.stringify(queuedTx), 'EX', 3600); // 1 hour expiry
    }
    
    logger.info(`Transaction ${txId} queued with ${priority} priority for escrow ${escrowId} (Balance: ${currentBalance} ${tokenType})`);
    
    return txId;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to add transaction to queue: ${errorMessage}`);
    throw new Error(`Failed to queue transaction: ${errorMessage}`);
  }
}

/**
 * Check if a transaction for this escrow is already queued
 */
async function checkIfTransactionQueued(escrowId: string): Promise<QueuedTransaction | null> {
  try {
    const existingTx = await redis.get(`tx_queue_index:${escrowId}`);
    if (existingTx) {
      return JSON.parse(existingTx);
    }
    return null;
  } catch (error) {
    logger.error(`Error checking queued transaction for escrow ${escrowId}:`, error);
    return null;
  }
}

/**
 * Clear duplicate transactions from queue
 */
export async function clearDuplicateTransactions(): Promise<number> {
  let clearedCount = 0;
  const seenEscrows = new Set<string>();
  
  const queues = [HIGH_PRIORITY_QUEUE_KEY, NORMAL_PRIORITY_QUEUE_KEY, LOW_PRIORITY_QUEUE_KEY, TRANSACTION_QUEUE_KEY];
  
  for (const queueKey of queues) {
    try {
      const queueItems = await redis.lrange(queueKey, 0, -1);
      const uniqueItems: string[] = [];
      
      for (const item of queueItems) {
        try {
          const tx = JSON.parse(item) as QueuedTransaction;
          
          if (tx.escrowId) {
            if (!seenEscrows.has(tx.escrowId)) {
              seenEscrows.add(tx.escrowId);
              uniqueItems.push(item);
            } else {
              clearedCount++;
              logger.info(`Removed duplicate transaction for escrow ${tx.escrowId}`);
            }
          } else {
            // Keep transactions without escrow ID
            uniqueItems.push(item);
          }
        } catch (parseError) {
          // Keep malformed items for manual review
          uniqueItems.push(item);
        }
      }
      
      // Replace queue with unique items
      if (uniqueItems.length !== queueItems.length) {
        await redis.del(queueKey);
        if (uniqueItems.length > 0) {
          await redis.lpush(queueKey, ...uniqueItems);
        }
        logger.info(`Cleaned ${queueKey}: ${queueItems.length} -> ${uniqueItems.length} items`);
      }
    } catch (error) {
      logger.error(`Error cleaning queue ${queueKey}:`, error);
    }
  }
  
  return clearedCount;
}

/**
 * Process the transaction queue with the given priority
 */
async function processQueueWithPriority(queueKey: string): Promise<void> {
  try {
    // Try to acquire a lock to prevent multiple instances processing the same queue
    const lockAcquired = await redis.set(
      `${queueKey}:lock`,
      'processing',
      'EX',
      30,
      'NX'
    );
    
    if (!lockAcquired) {
      // Another process is already handling this queue
      return;
    }
    
    // Get a batch of transactions to process
    const batch = await redis.lrange(queueKey, 0, BATCH_SIZE * 2 - 1); // Get more to allow for better batching
    
    if (!batch || batch.length === 0) {
      // No transactions in the queue
      return;
    }
    
    // Parse transactions from the queue
    const transactions: QueuedTransaction[] = batch.map((item: string) => JSON.parse(item));
    
    // Process transactions in batches where possible
    await processBatch(transactions, queueKey);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Error processing ${queueKey}: ${errorMessage}`);
  } finally {
    // Release the lock
    await redis.del(`${queueKey}:lock`);
  }
}

/**
 * Process a batch of transactions
 */
async function processBatch(transactions: QueuedTransaction[], queueKey: string): Promise<void> {
  if (!transactions || transactions.length === 0) {
    return;
  }
  
  // Group transactions by recipient + chain + token for potential batching
  const txGroups: Record<string, QueuedTransaction[]> = {};
    
  // Process all transactions or mark them as processing
  for (const tx of transactions) {
    if (tx.isProcessing) {
      continue; // Skip transactions already being processed
    }
    
    // Remove from queue and mark as processing
    await redis.lrem(queueKey, 1, JSON.stringify({...tx, isProcessing: false}));
    await redis.lpush(`${queueKey}:processing`, JSON.stringify(tx));
    
    // Group by chain+token+address for batch processing
    const groupKey = `${tx.chainName}:${tx.tokenType}:${tx.toAddress}`;
    if (!txGroups[groupKey]) {
      txGroups[groupKey] = [];
    }
    txGroups[groupKey].push(tx);
  }
  
  // Process each group
  for (const [groupKey, txs] of Object.entries(txGroups)) {
    if (txs.length === 0) continue;
    
    const [chainName, tokenType] = groupKey.split(':');
    
    // Check if this chain supports batch sending (multi-send contract)
    if (txs.length > 1 && supportsMultiSend(chainName)) {
      // TODO: Implement batch processing for chains that support it
      // For now, fall back to individual processing
      await processIndividualTransactions(
        txs,
        null,
        null,
      chainName,
        tokenType as TokenSymbol,
        18, // Default decimals, should be fetched from token config
        null,
        queueKey
      );
    } else {
      // Process transactions individually
      await processIndividualTransactions(
        txs,
        null,
        null,
        chainName,
        tokenType as TokenSymbol,
        18, // Default decimals, should be fetched from token config
        null,
        queueKey
      );
    }
  }
}

/**
 * Check if a chain supports multi-send contracts
 */
function supportsMultiSend(chainName: string): boolean {
  // For now, assume no chains support multi-send
  // This can be updated later with actual data
  return false;
}

/**
 * Process individual transactions one by one
 */
async function processIndividualTransactions(
  transactions: QueuedTransaction[],
  smartAccount: any,
  contract: any,
  chainName: string,
  tokenType: TokenSymbol,
  tokenDecimals: number,
  gasPrice: any,
  queueKey: string
): Promise<void> {
  // Initialize platform wallets
  const platformWallets = await initializePlatformWallets();
    
  // Get chain configuration
  const chainConfig = config[chainName];
  if (!chainConfig || !chainConfig.chainId) {
    throw new Error(`Invalid chain configuration for ${chainName}`);
  }
    
  // Get token configuration
  const tokenConfig = getTokenConfig(chainName as Chain, tokenType);
  if (!tokenConfig) {
    throw new Error(`Token ${tokenType} not supported on chain ${chainName}`);
  }
  
  // Set correct token decimals from config
  const decimals = tokenConfig.decimals || 18;
    
  // Define chain
  const thirdwebChain = defineChain(chainConfig.chainId);
  
  try {
    let account: any;
    
    // Check if we have a controller private key for the smart wallet
    if (platformWallets.main.privateKey === null) {
      throw new Error('DEV_PLATFORM_WALLET_PRIVATE_KEY environment variable is required to control the smart wallet. Please set this to the private key of the EOA that controls your smart wallet.');
    }
    
    // Create the controlling EOA account
    const personalAccount = privateKeyToAccount({
      client,
      privateKey: platformWallets.main.privateKey
    });
    
    // Connect to the smart wallet using the controlling EOA
    const wallet = smartWallet({
      chain: thirdwebChain,
      sponsorGas: true,
    });
    
    account = await wallet.connect({
      client,
      personalAccount,
    });
    
    logger.info(`Smart wallet connected: ${account.address}`);
    logger.info(`Expected smart wallet address: ${platformWallets.main.address}`);
    
    // Verify that the connected smart wallet matches our expected address
    if (account.address.toLowerCase() !== platformWallets.main.address.toLowerCase()) {
      logger.warn(`Smart wallet address mismatch! Connected: ${account.address}, Expected: ${platformWallets.main.address}`);
    }
    
    // Get contract for the token
    const tokenContract = getContract({
      client,
      chain: thirdwebChain,
      address: tokenConfig.address,
    });
    
    // Log chain and token info for debugging
    logger.info(`Using chain: ${chainName} (${chainConfig.chainId})`);
    logger.info(`Token: ${tokenType} at address ${tokenConfig.address.substring(0, 10)}...`);
    logger.info(`Token decimals: ${decimals}`);
    logger.info(`Platform wallet: ${maskAddress(platformWallets.main.address)}`);
    
    // Process each transaction
    for (const tx of transactions) {
      try {
        logger.info(`Processing transaction ${tx.id} to ${maskAddress(tx.toAddress)}`);
        logger.info(`- Amount: ${tx.amount} ${tokenType}`);
        logger.info(`- Attempt: ${tx.attempts + 1} of ${MAX_RETRY_ATTEMPTS}`);
        
        // Validate the recipient address
        if (!tx.toAddress || tx.toAddress.length !== 42 || !tx.toAddress.startsWith('0x')) {
          throw new Error(`Invalid recipient address: ${tx.toAddress}`);
        }
        
        // Validate the amount
        if (!tx.amount || tx.amount <= 0) {
          throw new Error(`Invalid amount: ${tx.amount}`);
        }
        
        logger.info(`- Amount (human readable): ${tx.amount}`);
        
        // Convert to raw amount with proper decimals for thirdweb
        const rawAmount = Math.floor(tx.amount * Math.pow(10, decimals));
        logger.info(`- Raw amount (with decimals): ${rawAmount}`);
        
        // Create transaction with raw amount (thirdweb expects this format)
        const transferTx = transfer({
          contract: tokenContract,
          to: tx.toAddress,
          amount: rawAmount // Use raw amount with decimals
        });
        
        logger.info(`Sending transaction...`);
      
        // Execute transaction with timeout and better error handling
        const result = await promiseWithTimeout(
          sendTransaction({
            transaction: transferTx,
            account: account
          }),
          60000, // 60 second timeout
          `Transaction ${tx.id} timed out after 60 seconds`
        );
      
        // Extract transaction hash
        const txHash = result.transactionHash;
        if (!txHash) {
          throw new Error('Transaction completed but no hash was returned');
        }
        
        // Log success with full details
        logger.info(`✅ Transaction ${tx.id} completed: ${txHash}`);
        logger.info(`- Chain: ${chainName}`);
        logger.info(`- Token: ${tokenType}`);
        logger.info(`- Amount: ${tx.amount}`);
        logger.info(`- To: ${maskAddress(tx.toAddress)}`);
        logger.info(`- Explorer: ${generateExplorerUrl(chainName, txHash)}`);
      
        // Remove from processing queue
        await redis.lrem(`${queueKey}:processing`, 1, JSON.stringify(tx));
      
        // Record the successful transaction
        await recordTransaction({
          type: TransactionType.PLATFORM_TO_USER,
          txId: tx.id,
          txHash, 
          status: 'completed',
          toAddress: tx.toAddress,
          amount: tx.amount,
          tokenType,
          chainName,
          executionTimeMs: Date.now() - tx.timestamp
        });
        
        // Update any associated escrow record with the transaction hash
        try {
          // Find escrow by transaction ID and update
          const escrow = await mongoose.model('Escrow').findOneAndUpdate(
            { 'metadata.queuedTxId': tx.id },
            { 
              $set: {
                status: 'completed',
                cryptoTransactionHash: txHash,
                completedAt: new Date(),
                'metadata.cryptoTransferComplete': true,
                'metadata.txHash': txHash,
                'metadata.explorerUrl': generateExplorerUrl(chainName, txHash)
              }
            },
            { new: true }
          );
          
          if (escrow) {
            logger.info(`✅ Updated escrow record for transaction ${tx.id}`);
            logger.info(`🎉 CRYPTO TRANSFER SUCCESSFUL!`);
            logger.info(`- User: ${escrow.userId}`);
            logger.info(`- Amount: ${tx.amount} ${tokenType} on ${chainName}`);
            logger.info(`- Transaction: ${txHash}`);
            logger.info(`- Explorer: ${generateExplorerUrl(chainName, txHash)}`);
          } else {
            logger.warn(`No escrow found for transaction ${tx.id}`);
          }
        } catch (escrowError: any) {
          // Log but don't fail the transaction processing
          logger.error(`❌ Error updating escrow for transaction ${tx.id}: ${escrowError.message}`);
        }
        
        // Clear the transaction from deduplication index
        if (tx.escrowId) {
          await redis.del(`tx_queue_index:${tx.escrowId}`);
        }
        
      } catch (error: any) {
        // Handle transaction error with detailed logging
        let errorMessage = 'Unknown error';
        let detailedError = 'Unknown error';
        
        // Extract detailed error information
        if (error instanceof Error) {
          errorMessage = error.message;
          detailedError = error.message;
          
          // Log the full error for debugging
          logger.error(`❌ Full error object for transaction ${tx.id}:`, {
            message: error.message,
            stack: error.stack,
            name: error.name,
            code: (error as any).code,
            reason: (error as any).reason,
            data: (error as any).data,
            details: (error as any).details,
            response: (error as any).response?.data
          });
          
          // Extract more specific error info
          if ((error as any).reason) {
            detailedError = `Blockchain Error: ${(error as any).reason}`;
          } else if ((error as any).code) {
            detailedError = `Error Code: ${(error as any).code} - ${errorMessage}`;
          } else if ((error as any).data) {
            detailedError = `Data Error: ${JSON.stringify((error as any).data)}`;
          } else if ((error as any).response) {
            detailedError = `API Error: ${(error as any).response.status} - ${JSON.stringify((error as any).response.data || {})}`;
          }
        } else if (typeof error === 'string') {
          errorMessage = error;
          detailedError = error;
        } else if (error && typeof error === 'object') {
          errorMessage = JSON.stringify(error);
          detailedError = JSON.stringify(error);
          
          // Log the full error object
          logger.error(`❌ Non-Error object for transaction ${tx.id}:`, error);
        }
        
        // Log detailed error information
        logger.error(`❌ Transaction ${tx.id} failed (attempt ${tx.attempts + 1}): ${detailedError}`);
        
        // Update transaction with error info
        tx.attempts = (tx.attempts || 0) + 1;
        tx.lastAttempt = Date.now();
        tx.error = detailedError;
        
        if (tx.attempts >= MAX_RETRY_ATTEMPTS) {
          // Mark as permanently failed
          logger.error(`❌ Transaction ${tx.id} has failed ${tx.attempts} times, marking as permanently failed`);
          try {
            await markTransactionFailed(tx.id, errorMessage, queueKey);
            
            // Update escrow to reflect the permanent failure
            try {
              const escrow = await mongoose.model('Escrow').findOneAndUpdate(
                { 'metadata.queuedTxId': tx.id },
                { 
                  $set: {
                    status: 'failed',
                    completedAt: new Date(),
                    'metadata.cryptoTransferFailed': true,
                    'metadata.error': detailedError,
                    'metadata.failedAt': new Date().toISOString()
                  }
                },
                { new: true }
              );
              
              if (escrow) {
                logger.info(`Updated escrow record for failed transaction ${tx.id}`);
              }
            } catch (escrowError) {
              logger.error(`Failed to update escrow for failed transaction: ${escrowError}`);
            }
          } catch (markError) {
            // If marking failed doesn't work, remove from processing queue
            logger.error(`Error marking transaction as failed: ${markError}`);
            await redis.lrem(`${queueKey}:processing`, 1, JSON.stringify(tx));
          }
        } else {
          // Schedule for retry with exponential backoff
          const backoffMs = Math.min(
            RETRY_DELAY_MS * Math.pow(2, tx.attempts - 1) * (0.5 + Math.random()), // Add jitter
            24 * 60 * 60 * 1000 // Max 24 hours
          );
          
          const retryTimestamp = Date.now() + backoffMs;
          
          // Add to retry schedule
          await redis.zadd('tx_retry_schedule', retryTimestamp, JSON.stringify(tx));
          
          // Remove from processing queue
          await redis.lrem(`${queueKey}:processing`, 1, JSON.stringify(tx));
          
          logger.info(`Scheduled retry for transaction ${tx.id} in ${Math.round(backoffMs / 1000)} seconds`);
        }
      }
    }
  } catch (globalError: any) {
    // This catches errors outside the transaction loop
    logger.error(`❌ Critical error processing transactions: ${globalError.message}`);
    logger.error(globalError.stack);
    
    // Remove all transactions from processing queue and return them to the main queue
    for (const tx of transactions) {
      try {
        // Put back in the original queue
        await redis.lpush(queueKey, JSON.stringify({...tx, isProcessing: false}));
        // Remove from processing queue
        await redis.lrem(`${queueKey}:processing`, 1, JSON.stringify(tx));
      } catch (err) {
        logger.error(`Failed to requeue transaction ${tx.id}`);
      }
    }
    
    // Rethrow to notify calling code
    throw globalError;
  }
}

/**
 * Process transactions scheduled for retry
 */
export async function processScheduledRetries(): Promise<void> {
  try {
    const now = Date.now();
    
    // Get all transactions scheduled for retry before now
    const retryItems = await redis.zrangebyscore('tx_retry_schedule', '-inf', now);
    
    if (!retryItems || retryItems.length === 0) {
      return;
    }
    
    logger.info(`Processing ${retryItems.length} scheduled retries`);
    
    // Process each retry item
    for (const item of retryItems) {
      try {
        const tx = JSON.parse(item) as QueuedTransaction;
        
        // Determine which queue to use based on priority
        let queueKey = NORMAL_PRIORITY_QUEUE_KEY;
        if (tx.priority === 'high') queueKey = HIGH_PRIORITY_QUEUE_KEY;
        if (tx.priority === 'low') queueKey = LOW_PRIORITY_QUEUE_KEY;
        
        // Add back to the appropriate queue
        await redis.lpush(queueKey, JSON.stringify(tx));
        
        // Remove from retry schedule
        await redis.zrem('tx_retry_schedule', item);
        
        logger.info(`Retry for transaction ${tx.id} queued (attempt ${tx.attempts + 1})`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Error processing retry item: ${errorMessage}`);
      }
    }

    // Also clean up any stalled processing transactions
    // This handles cases where a process crashed while processing
    for (const queueKey of [HIGH_PRIORITY_QUEUE_KEY, NORMAL_PRIORITY_QUEUE_KEY, LOW_PRIORITY_QUEUE_KEY]) {
      const processingItems = await redis.lrange(`${queueKey}:processing`, 0, -1);
      
      for (const item of processingItems) {
        try {
          await redis.lrem(`${queueKey}:processing`, 1, item);
          await redis.lpush(queueKey, item);
        } catch (err) {
          // Ignore errors during cleanup
        }
      }
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Error processing scheduled retries: ${errorMessage}`);
  }
}

/**
 * Mark a transaction as permanently failed
 */
async function markTransactionFailed(txId: string, errorMessage: string, queueKey: string): Promise<void> {
  try {
    logger.warn(`Transaction ${txId} marked as permanently failed: ${errorMessage}`);
    
    // Update escrow record with failure
    try {
      const escrow = await mongoose.model('Escrow').findOneAndUpdate(
        { 'metadata.queuedTxId': txId },
        { 
          $set: {
            status: 'failed',
            completedAt: new Date(),
            'metadata.cryptoTransferFailed': true,
            'metadata.error': errorMessage,
            'metadata.failedAt': new Date().toISOString(),
            'metadata.failureReason': 'Crypto transfer failed after multiple attempts'
          }
        },
        { new: true }
      );
      
      if (escrow) {
        logger.info(`Updated escrow record for permanently failed transaction ${txId}`);
        
        // Log transaction for reconciliation
        const escrowData = escrow.toObject();
        const reconciliationData = {
          transactionId: escrow.transactionId,
          userId: escrow.userId.toString(),
          type: escrow.type,
          status: 'failed',
          fiatAmount: escrow.amount,
          cryptoAmount: escrow.cryptoAmount,
          tokenType: escrowData.metadata?.tokenType || 'USDC',
          chain: escrowData.metadata?.chain || 'arbitrum',
          mpesaReceiptNumber: escrow.mpesaReceiptNumber,
          error: errorMessage,
          errorCode: 'PERMANENT_TRANSFER_FAILURE',
          needsManualReview: true
        };
        
        // If we have a logTransactionForReconciliation function available
        if (typeof logTransactionForReconciliation === 'function') {
          logTransactionForReconciliation(reconciliationData);
        } else {
          logger.info('Reconciliation data for failed transaction:', reconciliationData);
        }
      } else {
        logger.warn(`No escrow found for failed transaction ${txId}`);
      }
    } catch (escrowError: any) {
      logger.error(`Failed to update escrow for failed transaction: ${escrowError.message}`);
    }
    
    // Remove from processing queue
    await redis.lrem(`${queueKey}:processing`, 1, JSON.stringify({ id: txId }));
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Error marking transaction as failed: ${errorMessage}`);
  }
}

/**
 * Send tokens from user to another address
 * @param toAddress Recipient address
 * @param amount Amount to send
 * @param userPrivateKey User's private key
 * @param chainName Chain to use
 * @param tokenType Token symbol (USDC, USDT, etc)
 * @returns Transaction hash
 */
export async function sendTokenFromUser(
  toAddress: string,
  amount: number,
  userPrivateKey: string,
  chainName: string = 'celo',
  tokenType: TokenSymbol = 'USDC'
): Promise<{ transactionHash: string }> {
  try {
    // Validate input
    if (!toAddress) {
      throw new Error('Recipient address is required');
    }
    if (!amount || amount <= 0) {
      throw new Error('Valid amount is required');
    }
    if (!userPrivateKey) {
      throw new Error('User private key is required');
    }
    
    // Log the outgoing transfer attempt (without revealing private key)
    console.log(`🔍 User-to-Platform Transfer Initiated:`);
    console.log(`- Recipient: ${toAddress.substring(0, 8)}...`);
    console.log(`- Amount: ${amount} ${tokenType} on ${chainName}`);
    console.log(`- USD Value: ~$${amount} USD`);
    
    // Get chain configuration
    const chainConfig = config[chainName];
    if (!chainConfig || !chainConfig.chainId) {
      throw new Error(`Invalid chain configuration for ${chainName}`);
    }
    
    const chain = defineChain(chainConfig.chainId);
    
    // Get token configuration
    const tokenConfig = getTokenConfig(chainName as Chain, tokenType);
    if (!tokenConfig) {
      throw new Error(`Token ${tokenType} not supported on chain ${chainName}`);
    }
    
    const tokenAddress = tokenConfig.address;
    
    // Create wallet from private key
    const personalAccount = privateKeyToAccount({
      client,
      privateKey: userPrivateKey
    });
    
    // Connect the smart wallet
    const wallet = smartWallet({
      chain,
      sponsorGas: true,
    });
    
    const smartAccount = await wallet.connect({
      client,
      personalAccount,
    });
    
    // Get contract
    const contract = getContract({
      client,
      chain,
      address: tokenAddress,
    });
    
    // Transfer tokens
    console.log(`Executing token transfer of ${amount} ${tokenType} from user to ${toAddress.substring(0, 8)}...`);
    const transaction = transfer({
      contract,
      to: toAddress,
      amount,
    });
    
    // Execute transaction
    const tx = await sendTransaction({
      transaction,
      account: smartAccount,
    });
    
    const txHash = tx.transactionHash;
    
    // Log transaction success with all details
    console.log(`✅ User-to-Platform Transfer Successful:`);
    console.log(`- Transaction Hash: ${txHash}`);
    console.log(`- User Wallet: ${smartAccount.address.substring(0, 8)}...`);
    console.log(`- To: ${toAddress.substring(0, 8)}...`);
    console.log(`- Amount: ${amount} ${tokenType} on ${chainName}`);
    console.log(`- USD Value: ~$${amount} USD`);
    console.log(`- Token Address: ${tokenAddress.substring(0, 10)}...`);
    console.log(`- Timestamp: ${new Date().toISOString()}`);
    
    // Invalidate cache for affected addresses
    await Promise.all([
      redis.del(WALLET_BALANCE_CACHE_PREFIX + smartAccount.address),
      redis.del(WALLET_BALANCE_CACHE_PREFIX + toAddress)
    ]);
    
    return { transactionHash: txHash };
  } catch (error: any) {
    console.error(`❌ Error sending token from user:`, {
      error: error.message,
      stack: error.stack,
      details: error.details || 'No additional details'
    });
    throw error;
  }
}

/**
 * Withdraw collected fees to main platform wallet
 * @param amount Amount to withdraw, or null to withdraw all
 * @param chainName Blockchain to use
 * @returns Transaction hash
 */
export async function withdrawFeesToMainWallet(
  amount: number | null = null,
  chainName: string = 'celo'
): Promise<{ transactionHash: string }> {
  try {
    // Get platform wallets
    const platformWallets = await initializePlatformWallets();
    
    // If amount is null, get the balance and withdraw all
    if (amount === null) {
      amount = await getWalletBalance(platformWallets.fees.address, chainName);
      
      // If balance is 0, nothing to withdraw
      if (amount <= 0) {
        throw new Error('No funds available to withdraw');
      }
    }
    
    // Transfer from fees wallet to main wallet
    return transferBetweenPlatformWallets('fees', 'main', amount, chainName);
  } catch (error) {
    console.error('Error withdrawing fees to main wallet:', error);
    throw error;
  }
}

/**
 * Get the platform wallet status including balances
 * @returns Wallet addresses and balances
 */
export async function getPlatformWalletStatus(
  chainName: string = 'celo'
): Promise<{
  main: { address: string; balance: number };
  fees: { address: string; balance: number };
}> {
  try {
    // Get platform wallets
    const platformWallets = await initializePlatformWallets();
    
    // Get balances
    const mainBalance = await getWalletBalance(platformWallets.main.address, chainName);
    const feesBalance = await getWalletBalance(platformWallets.fees.address, chainName);
    
    return {
      main: {
        address: platformWallets.main.address,
        balance: mainBalance
      },
      fees: {
        address: platformWallets.fees.address,
        balance: feesBalance
      }
    };
  } catch (error) {
    console.error('Error getting platform wallet status:', error);
    throw error;
  }
}

/**
 * Helper function to get token balance for a specific token on a specific chain
 * Returns the balance in human-readable format (adjusted for decimals)
 */
export async function getTokenBalanceOnChain(
  walletAddress: string,
  chain: string,
  tokenSymbol: TokenSymbol
): Promise<number> {
  try {
    // Get chain configuration
    const chainConfig = config[chain];
    if (!chainConfig || !chainConfig.chainId) {
      throw new Error(`Invalid chain configuration for ${chain}`);
    }
    
    // Get token configuration
    const tokenConfig = getTokenConfig(chain as Chain, tokenSymbol);
    if (!tokenConfig) {
      throw new Error(`Token ${tokenSymbol} not supported on chain ${chain}`);
    }
    
    // Define chain
    const thirdwebChain = defineChain(chainConfig.chainId);
    
    // Get contract for the specific token
    const contract = getContract({
      client,
      chain: thirdwebChain,
      address: tokenConfig.address,
    });
    
    // Get balance in raw units
    const rawBalance = await balanceOf({
      contract,
      address: walletAddress
    });
    
    // Convert to human-readable format using token decimals
    const decimals = tokenConfig.decimals || 18;
    const humanReadableBalance = parseFloat(rawBalance.toString()) / Math.pow(10, decimals);
    
    logger.info(`Balance check: ${walletAddress.substring(0, 8)}... has ${humanReadableBalance} ${tokenSymbol} (${rawBalance.toString()} raw units, ${decimals} decimals)`);
    
    return humanReadableBalance;
  } catch (error) {
    console.error(`Error getting ${tokenSymbol} balance on ${chain}:`, error);
    return 0; // Return 0 on error to avoid breaking the flow
  }
}

/**
 * Helper function to generate blockchain explorer URL
 */
export function generateExplorerUrl(chain: string, txHash: string): string {
  const explorers: {[key: string]: string} = {
    'celo': 'https://explorer.celo.org/mainnet/tx/',
    'polygon': 'https://polygonscan.com/tx/',
    'arbitrum': 'https://arbiscan.io/tx/',
    'base': 'https://basescan.org/tx/',
    'optimism': 'https://optimistic.etherscan.io/tx/',
    'ethereum': 'https://etherscan.io/tx/',
    'binance': 'https://bscscan.com/tx/',
    'bnb': 'https://bscscan.com/tx/',
    'avalanche': 'https://snowtrace.io/tx/',
    'fantom': 'https://ftmscan.com/tx/',
    'gnosis': 'https://gnosisscan.io/tx/',
    'scroll': 'https://scrollscan.com/tx/',
    'moonbeam': 'https://moonbeam.moonscan.io/tx/',
    'fuse': 'https://explorer.fuse.io/tx/',
    'aurora': 'https://explorer.aurora.dev/tx/'
  };
  
  const baseUrl = explorers[chain] || explorers['celo']; // Default to Celo if chain not found
  return `${baseUrl}${txHash}`;
}

/**
 * Process all transaction queues in order of priority
 */
export async function processTransactionQueue(): Promise<void> {
  logger.info('Starting transaction queue processing');
  
  try {
    // Process high priority transactions first
    await processQueueWithPriority(HIGH_PRIORITY_QUEUE_KEY);
    
    // Then process normal priority
    await processQueueWithPriority(NORMAL_PRIORITY_QUEUE_KEY);
    
    // Then low priority
    await processQueueWithPriority(LOW_PRIORITY_QUEUE_KEY);
    
    // Finally process any legacy transactions (from old version)
    await processQueueWithPriority(TRANSACTION_QUEUE_KEY);
    
    logger.info('Transaction queue processing completed');
  } catch (error) {
    logger.error('Error processing transaction queue:', error);
    throw error;
  }
}

/**
 * Schedule periodic transaction queue processing
 * @param intervalMs Interval in milliseconds between processing cycles
 * @returns Array of timers that were created
 */
export function scheduleQueueProcessing(intervalMs: number = 60000): NodeJS.Timeout[] {
  const timers: NodeJS.Timeout[] = [];
  
  // Schedule main processor that handles all queues
  const mainTimer = setInterval(async () => {
    try {
      await processTransactionQueue();
    } catch (error) {
      logger.error('Error in scheduled transaction queue processing:', error);
    }
  }, intervalMs);
  
  timers.push(mainTimer);
  
  // We also set up separate processors for high priority transactions
  // that run more frequently to ensure they're processed quickly
  const highPriorityTimer = setInterval(async () => {
    try {
      await processQueueWithPriority(HIGH_PRIORITY_QUEUE_KEY);
    } catch (error) {
      logger.error('Error in high priority queue processing:', error);
    }
  }, Math.floor(intervalMs / 2)); // Process high priority twice as often
  
  timers.push(highPriorityTimer);
  
  return timers;
}

/**
 * Clear all failed transactions and restart queue processing
 */
export async function clearFailedTransactionsAndRestart(): Promise<void> {
  try {
    logger.info('🧹 Clearing failed transactions and restarting queue...');
    
    // Clear all processing queues
    const processingQueues = [
      `${HIGH_PRIORITY_QUEUE_KEY}:processing`,
      `${NORMAL_PRIORITY_QUEUE_KEY}:processing`,
      `${LOW_PRIORITY_QUEUE_KEY}:processing`,
      `${TRANSACTION_QUEUE_KEY}:processing`
    ];
    
    for (const queue of processingQueues) {
      const count = await redis.llen(queue);
      if (count > 0) {
        await redis.del(queue);
        logger.info(`Cleared ${count} items from ${queue}`);
      }
    }
    
    // Clear retry schedule
    const retryCount = await redis.zcard('tx_retry_schedule');
    if (retryCount > 0) {
      await redis.del('tx_retry_schedule');
      logger.info(`Cleared ${retryCount} items from retry schedule`);
    }
    
    // Clear deduplication indexes
    const keys = await redis.keys('tx_queue_index:*');
    if (keys.length > 0) {
      await redis.del(...keys);
      logger.info(`Cleared ${keys.length} deduplication indexes`);
    }
    
    logger.info('✅ Queue cleanup completed');
  } catch (error) {
    logger.error('Error clearing failed transactions:', error);
    throw error;
  }
} 