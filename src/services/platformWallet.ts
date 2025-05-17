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

// Initialize Redis client for caching
const redis = new Redis(config.REDIS_URL);

/**
 * Platform wallet structure which maintains separate wallets for different purposes
 */
interface PlatformWallets {
  main: {
    address: string;
    privateKey: string;
  };
  fees: {
    address: string;
    privateKey: string;
  };
}

// Cache keys
const PLATFORM_WALLETS_CACHE_KEY = 'platform:wallets';
const WALLET_BALANCE_CACHE_PREFIX = 'wallet:balance:';

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
  const mainWallet = {
    address: config.PLATFORM_WALLET_ADDRESS,
    privateKey: config.PLATFORM_WALLET_PRIVATE_KEY
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
 * @returns The wallet balance in token units
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
    
    const balance = await balanceOf({
      contract,
      address: walletAddress
    });
    
    // Cache for 2 minutes (adjust as needed)
    await redis.set(cacheKey, balance.toString(), 'EX', 120);
    
    return parseFloat(balance.toString());
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
    
    // Create wallet from private key
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
 * Send tokens from the platform wallet to a user
 * @param toAddress User wallet address
 * @param amount Amount to send in human-readable format (e.g., 1.0 USDC)
 * @param chainName Which chain to use
 * @param tokenType Token symbol (USDC, USDT, etc)
 * @returns Transaction hash
 */
export async function sendTokenToUser(
  toAddress: string,
  amount: number,
  chainName: string = 'celo',
  tokenType: TokenSymbol = 'USDC'
): Promise<{ transactionHash: string }> {
  try {
    // Get platform wallets
    const platformWallets = await initializePlatformWallets();
    
    // Validate input
    if (!toAddress) {
      throw new Error('Recipient address is required');
    }
    if (!amount || amount <= 0) {
      throw new Error('Valid amount is required');
    }
    
    // Log the outgoing transfer attempt
    console.log(`🔍 Platform-to-User Transfer Initiated:`);
    console.log(`- User Wallet: ${toAddress.substring(0, 8)}...`);
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
    const tokenDecimals = tokenConfig.decimals;
    
    // Convert human-readable amount to raw amount with decimals
    // e.g., 1.0 USDC with 6 decimals becomes 1000000
    const rawAmount = amount * Math.pow(10, tokenDecimals);
    
    console.log(`Token info: ${tokenType} on ${chainName}`);
    console.log(`- Token address: ${tokenAddress}`);
    console.log(`- Token decimals: ${tokenDecimals}`);
    console.log(`- Human amount: ${amount}`);
    console.log(`- Raw amount: ${rawAmount}`);
    
    // Initialize accounts
    const personalAccount = privateKeyToAccount({
      client,
      privateKey: platformWallets.main.privateKey
    });
    
    // Connect the smart wallet
    const wallet = smartWallet({
      chain,
      sponsorGas: false,
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
    console.log(`Executing token transfer of ${amount} ${tokenType} to ${toAddress.substring(0, 8)}...`);
    const transaction = transfer({
      contract,
      to: toAddress,
      amount: rawAmount, // Use the raw amount with decimals here
    });
    
    // Execute transaction
    const tx = await sendTransaction({
      transaction,
      account: smartAccount,
    });
    
    const txHash = tx.transactionHash;
    
    // Log transaction success with all details
    console.log(`✅ Platform-to-User Transfer Successful:`);
    console.log(`- Transaction Hash: ${txHash}`);
    console.log(`- Platform Wallet: ${smartAccount.address.substring(0, 8)}...`);
    console.log(`- User Wallet: ${toAddress.substring(0, 8)}...`);
    console.log(`- Amount: ${amount} ${tokenType} on ${chainName}`);
    console.log(`- USD Value: ~$${amount} USD`);
    console.log(`- Token Address: ${tokenAddress.substring(0, 10)}...`);
    console.log(`- Timestamp: ${new Date().toISOString()}`);
    
    // Invalidate cache for affected addresses
    await Promise.all([
      redis.del(WALLET_BALANCE_CACHE_PREFIX + platformWallets.main.address),
      redis.del(WALLET_BALANCE_CACHE_PREFIX + toAddress)
    ]);
    
    return { transactionHash: txHash };
  } catch (error: any) {
    console.error(`❌ Error sending token from platform to user:`, {
      error: error.message,
      stack: error.stack,
      details: error.details || 'No additional details'
    });
    throw error;
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
      sponsorGas: false,
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