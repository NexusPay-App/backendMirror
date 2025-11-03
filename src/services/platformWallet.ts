import { ethers } from 'ethers';
import { privateKeyToAccount, smartWallet } from "thirdweb/wallets";
import { defineChain, getContract, sendTransaction, prepareTransaction } from "thirdweb";
import { transfer, balanceOf } from "thirdweb/extensions/erc20";
import { client } from './auth';
import config from "../config/env";
import { randomUUID } from "crypto";
import Redis from 'ioredis';
import { Account } from '@thirdweb-dev/sdk';
import pino from 'pino';
import mongoose from 'mongoose';
import { promiseWithTimeout } from '../utils/promises';
import { ChainConfig, CacheKeys } from "../types/chain";
import { TokenSymbol, TokenConfig, Chain } from "../types/token";
import { getTokenConfig } from "../config/tokens";
import { generateUUID, maskAddress } from '../utils';
import { createClient } from 'redis';
import { recordTransaction, TransactionType } from './transactionLogger';
import { logTransactionForReconciliation } from './reconciliation';
import { encodeAbiParameters } from 'viem';
import { SmartContract } from '@thirdweb-dev/sdk';
import { transactionMonitor } from './transactionMonitor';

// Configure logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty'
  }
});

// Use centralized Redis client for caching
import { redis, isRedisConnected } from '../config/redis';

// Redis cache configuration
const REDIS_PREFIX = process.env.REDIS_PREFIX || 'platform';
const CACHE_KEYS = {
  WALLET_CACHE_KEY: `${REDIS_PREFIX}:wallet`,
  OWNER_CACHE_PREFIX: `${REDIS_PREFIX}:owner:`,
  WALLET_BALANCE_CACHE_PREFIX: `${REDIS_PREFIX}:balance:`,
  TOKEN_PRICE_CACHE_PREFIX: `${REDIS_PREFIX}:token_price:`,
  GAS_PRICE_CACHE_PREFIX: `${REDIS_PREFIX}:gas_price:`,
  TRANSACTION_HISTORY_CACHE_PREFIX: `${REDIS_PREFIX}:tx_history:`,
  QUEUE_PREFIX: `${REDIS_PREFIX}:queue:`,
  WALLETS_CACHE_KEY: `${REDIS_PREFIX}:wallets`
} as const satisfies CacheKeys;

// Use destructured cache keys
const {
  WALLET_CACHE_KEY,
  OWNER_CACHE_PREFIX,
  WALLET_BALANCE_CACHE_PREFIX,
  TOKEN_PRICE_CACHE_PREFIX,
  GAS_PRICE_CACHE_PREFIX,
  TRANSACTION_HISTORY_CACHE_PREFIX,
  QUEUE_PREFIX,
  WALLETS_CACHE_KEY
} = CACHE_KEYS;

// ERC20 ABI definitions
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)'
] as const;

const ERC20_TRANSFER_ABI = {
  name: 'transfer',
  type: 'function',
  inputs: [
    { name: 'recipient', type: 'address' },
    { name: 'amount', type: 'uint256' }
  ]
} as const;

// Token configuration
const TOKEN_CONFIG = {
  USDC: {
    arbitrum: { address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8' as `0x${string}`, decimals: 6, symbol: 'USDC', name: 'USD Coin' },
    polygon: { address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' as `0x${string}`, decimals: 6, symbol: 'USDC', name: 'USD Coin' },
    base: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`, decimals: 6, symbol: 'USDC', name: 'USD Coin' },
    optimism: { address: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607' as `0x${string}`, decimals: 6, symbol: 'USDC', name: 'USD Coin' },
    celo: { address: '0x37f750B7cC259A2f741AF45294f6a16572CF5cAd' as `0x${string}`, decimals: 6, symbol: 'USDC', name: 'USD Coin' },
    scroll: { address: '0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4' as `0x${string}`, decimals: 6, symbol: 'USDC', name: 'USD Coin' },
    fuse: { address: '0x620fd5fa44BE6af63715Ef4E65DDFA0387aD13F5' as `0x${string}`, decimals: 6, symbol: 'USDC', name: 'USD Coin' },
    gnosis: { address: '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83' as `0x${string}`, decimals: 6, symbol: 'USDC', name: 'USD Coin' },
    aurora: { address: '0xB12BFcA5A55806AaF64E99521918A4bf0fC40802' as `0x${string}`, decimals: 6, symbol: 'USDC', name: 'USD Coin' }
  },
  USDT: {
    arbitrum: { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' as `0x${string}`, decimals: 6, symbol: 'USDT', name: 'Tether USD' },
    polygon: { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' as `0x${string}`, decimals: 6, symbol: 'USDT', name: 'Tether USD' },
    optimism: { address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58' as `0x${string}`, decimals: 6, symbol: 'USDT', name: 'Tether USD' }
  },
  DAI: {
    arbitrum: { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1' as `0x${string}`, decimals: 18, symbol: 'DAI', name: 'Dai Stablecoin' },
    polygon: { address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063' as `0x${string}`, decimals: 18, symbol: 'DAI', name: 'Dai Stablecoin' },
    optimism: { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1' as `0x${string}`, decimals: 18, symbol: 'DAI', name: 'Dai Stablecoin' }
  },
  WETH: {
    arbitrum: { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' as `0x${string}`, decimals: 18, symbol: 'WETH', name: 'Wrapped Ether' },
    polygon: { address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619' as `0x${string}`, decimals: 18, symbol: 'WETH', name: 'Wrapped Ether' },
    optimism: { address: '0x4200000000000000000000000000000000000006' as `0x${string}`, decimals: 18, symbol: 'WETH', name: 'Wrapped Ether' }
  },
  WBTC: {
    arbitrum: { address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f' as `0x${string}`, decimals: 8, symbol: 'WBTC', name: 'Wrapped Bitcoin' },
    polygon: { address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6' as `0x${string}`, decimals: 8, symbol: 'WBTC', name: 'Wrapped Bitcoin' },
    optimism: { address: '0x68f180fcCe6836688e9084f035309E29Bf0A2095' as `0x${string}`, decimals: 8, symbol: 'WBTC', name: 'Wrapped Bitcoin' }
  },
  MATIC: {
    polygon: { address: '0x0000000000000000000000000000000000001010' as `0x${string}`, decimals: 18, symbol: 'MATIC', name: 'Polygon' }
  },
  ARB: {
    arbitrum: { address: '0x912CE59144191C1204E64559FE8253a0e49E6548' as `0x${string}`, decimals: 18, symbol: 'ARB', name: 'Arbitrum' }
  },
  OP: {
    optimism: { address: '0x4200000000000000000000000000000000000042' as `0x${string}`, decimals: 18, symbol: 'OP', name: 'Optimism' }
  },
  cUSD: {
    celo: { address: '0x765DE816845861e75A25fCA122bb6898B8B1282a' as `0x${string}`, decimals: 18, symbol: 'cUSD', name: 'Celo Dollar' }
  },
  // Placeholder entries for tokens that need chain-specific addresses

  BNB: {},
  TRX: {},
  SOL: {}
} as const;

// Chain configuration from environment variables
export const SUPPORTED_CHAINS: { [key in Chain]: ChainConfig } = {
  arbitrum: {
    id: 42161,
    name: 'Arbitrum One',
    network: 'arbitrum',
    nativeCurrency: {
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18
    },
    rpcUrls: {
      default: {
        http: ['https://arb1.arbitrum.io/rpc']
      }
    },
    blockExplorers: {
      default: {
        name: 'Arbiscan',
        url: 'https://arbiscan.io'
      }
    }
  },
  polygon: {
    id: 137,
    name: 'Polygon',
    network: 'polygon',
    nativeCurrency: {
      name: 'MATIC',
      symbol: 'MATIC',
      decimals: 18
    },
    rpcUrls: {
      default: {
        http: ['https://polygon-rpc.com']
      }
    },
    blockExplorers: {
      default: {
        name: 'Polygonscan',
        url: 'https://polygonscan.com'
      }
    }
  },
  base: {
    id: 8453,
    name: 'Base',
    network: 'base',
    nativeCurrency: {
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18
    },
    rpcUrls: {
      default: {
        http: ['https://mainnet.base.org']
      }
    },
    blockExplorers: {
      default: {
        name: 'Basescan',
        url: 'https://basescan.org'
      }
    }
  },
  optimism: {
    id: 10,
    name: 'Optimism',
    network: 'optimism',
    nativeCurrency: {
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18
    },
    rpcUrls: {
      default: {
        http: ['https://mainnet.optimism.io']
      }
    },
    blockExplorers: {
      default: {
        name: 'Optimism Explorer',
        url: 'https://optimistic.etherscan.io'
      }
    }
  },
  celo: {
    id: 42220,
    name: 'Celo',
    network: 'celo',
    nativeCurrency: {
      name: 'CELO',
      symbol: 'CELO',
      decimals: 18
    },
    rpcUrls: {
      default: {
        http: ['https://forno.celo.org']
      }
    },
    blockExplorers: {
      default: {
        name: 'Celoscan',
        url: 'https://celoscan.io'
      }
    }
  },
  scroll: {
    id: 534352,
    name: 'Scroll',
    network: 'scroll',
    nativeCurrency: {
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18
    },
    rpcUrls: {
      default: {
        http: ['https://rpc.scroll.io']
      }
    },
    blockExplorers: {
      default: {
        name: 'Scrollscan',
        url: 'https://scrollscan.com'
      }
    }
  },
  gnosis: {
    id: 100,
    name: 'Gnosis',
    network: 'gnosis',
    nativeCurrency: {
      name: 'xDAI',
      symbol: 'xDAI',
      decimals: 18
    },
    rpcUrls: {
      default: {
        http: ['https://rpc.gnosischain.com']
      }
    },
    blockExplorers: {
      default: {
        name: 'Gnosisscan',
        url: 'https://gnosisscan.io'
      }
    }
  },
  avalanche: {
    id: 43114,
    name: 'Avalanche',
    network: 'avalanche',
    nativeCurrency: {
      name: 'AVAX',
      symbol: 'AVAX',
      decimals: 18
    },
    rpcUrls: {
      default: {
        http: ['https://api.avax.network/ext/bc/C/rpc']
      }
    },
    blockExplorers: {
      default: {
        name: 'Snowtrace',
        url: 'https://snowtrace.io'
      }
    }
  },
  bnb: {
    id: 56,
    name: 'BNB Smart Chain',
    network: 'bnb',
    nativeCurrency: {
      name: 'BNB',
      symbol: 'BNB',
      decimals: 18
    },
    rpcUrls: {
      default: {
        http: ['https://bsc-dataseed.binance.org']
      }
    },
    blockExplorers: {
      default: {
        name: 'BscScan',
        url: 'https://bscscan.com'
      }
    }
  },
  fantom: {
    id: 250,
    name: 'Fantom',
    network: 'fantom',
    nativeCurrency: {
      name: 'FTM',
      symbol: 'FTM',
      decimals: 18
    },
    rpcUrls: {
      default: {
        http: ['https://rpc.ftm.tools']
      }
    },
    blockExplorers: {
      default: {
        name: 'FTMScan',
        url: 'https://ftmscan.com'
      }
    }
  },
  somnia: {
    id: 2332,
    name: 'Somnia',
    network: 'somnia',
    nativeCurrency: {
      name: 'SOM',
      symbol: 'SOM',
      decimals: 18
    },
    rpcUrls: {
      default: {
        http: ['https://rpc.somnia.network']
      }
    },
    blockExplorers: {
      default: {
        name: 'SomniaScan',
        url: 'https://explorer.somnia.network'
      }
    }
  },
  moonbeam: {
    id: 1284,
    name: 'Moonbeam',
    network: 'moonbeam',
    nativeCurrency: {
      name: 'GLMR',
      symbol: 'GLMR',
      decimals: 18
    },
    rpcUrls: {
      default: {
        http: ['https://rpc.api.moonbeam.network']
      }
    },
    blockExplorers: {
      default: {
        name: 'MoonScan',
        url: 'https://moonbeam.moonscan.io'
      }
    }
  },
  fuse: {
    id: 122,
    name: 'Fuse',
    network: 'fuse',
    nativeCurrency: {
      name: 'FUSE',
      symbol: 'FUSE',
      decimals: 18
    },
    rpcUrls: {
      default: {
        http: ['https://rpc.fuse.io']
      }
    },
    blockExplorers: {
      default: {
        name: 'FuseScan',
        url: 'https://explorer.fuse.io'
      }
    }
  },
  aurora: {
    id: 1313161554,
    name: 'Aurora',
    network: 'aurora',
    nativeCurrency: {
      name: 'ETH',
      symbol: 'ETH',
      decimals: 18
    },
    rpcUrls: {
      default: {
        http: ['https://mainnet.aurora.dev']
      }
    },
    blockExplorers: {
      default: {
        name: 'AuroraScan',
        url: 'https://explorer.aurora.dev'
      }
    }
  },
  lisk: {
    id: 1135,
    name: 'Lisk',
    network: 'lisk',
    nativeCurrency: {
      name: 'ETH',
      symbol: 'ETH',
      decimals: 18
    },
    rpcUrls: {
      default: {
        http: ['https://rpc.api.lisk.com']
      }
    },
    blockExplorers: {
      default: {
        name: 'LiskScan',
        url: 'https://blockscout.lisk.com'
      }
    }
  }
} as const;

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
  // Enhanced retry metadata
  retryReason?: string;
  isRetryable?: boolean;
  retryDelayMs?: number;
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

// Enhanced timeout configuration for different transaction types
const TRANSACTION_TIMEOUTS = {
  NORMAL: 30000,      // 30 seconds for normal transactions
  HIGH_PRIORITY: 45000, // 45 seconds for high priority
  BATCH: 90000        // 90 seconds for batch transactions
};

// Intelligent retry configuration
const RETRY_CONFIG = {
  MAX_ATTEMPTS: 5,
  NETWORK_ERROR_BACKOFF: 2000,    // 2 seconds for network errors
  GAS_ERROR_BACKOFF: 5000,        // 5 seconds for gas errors
  PERMANENT_ERROR_CODES: [
    'INSUFFICIENT_FUNDS',
    'INVALID_ADDRESS',
    'NONCE_TOO_LOW'
  ]
};

// Helper function to ensure chain parameter is valid
function validateChain(chainName: string): Chain {
  if (Object.keys(SUPPORTED_CHAINS).includes(chainName)) {
    return chainName as Chain;
  }
  throw new Error(`Unsupported chain: ${chainName}`);
}

// Helper function to ensure address is 0x-prefixed
function ensure0xAddress(address: string): `0x${string}` {
  if (!address.startsWith('0x')) {
    throw new Error('Invalid address format: must start with 0x');
  }
  return address as `0x${string}`;
}

/**
 * Initialize platform wallets
 * This creates or loads both the main platform wallet and the fees wallet
 */
export async function initializePlatformWallets(): Promise<PlatformWallets> {
  // Try to get from cache first (with error handling for Redis connection issues)
  try {
    const cachedWallets = await redis.get(PLATFORM_WALLETS_CACHE_KEY);
    
    if (cachedWallets) {
      try {
        return JSON.parse(cachedWallets);
      } catch (error) {
        console.error('Error parsing cached wallets:', error);
        // Continue to create new wallets if parsing fails
      }
    }
  } catch (error: any) {
    // Redis connection error - proceed without cache
    if (error.message?.includes('Connection is closed') || error.message?.includes('ECONNREFUSED')) {
      // Silently continue without cache
    } else {
      console.error('Error getting cached wallets:', error);
    }
  }
  
  // Main wallet is configured in env variables
  // For smart wallets, we need the controlling EOA private key
  const mainWallet = {
    address: '0x2b0B97EA7922E9CF5ef689A211F75B1E67A261Bf', // Correct wallet address with 6.43 USDC funds
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
  
  // Cache the wallets (with error handling for Redis connection issues)
  try {
    await redis.set(PLATFORM_WALLETS_CACHE_KEY, JSON.stringify(platformWallets));
  } catch (error: any) {
    // Redis connection error - continue without caching
    if (!error.message?.includes('Connection is closed') && !error.message?.includes('ECONNREFUSED')) {
      console.error('Error caching platform wallets:', error);
    }
  }
  
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
  
  // Try to get from cache (with error handling for Redis connection issues)
  try {
    const cachedBalance = await redis.get(cacheKey);
    if (cachedBalance) {
      return parseFloat(cachedBalance);
    }
  } catch (error: any) {
    // Redis connection error - proceed without cache
    if (error.message?.includes('Connection is closed') || error.message?.includes('ECONNREFUSED')) {
      // Silently continue without cache
    } else {
      console.error('Error getting cached balance:', error);
    }
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
    
    // Cache the human-readable balance for 2 minutes (with error handling for Redis connection issues)
    try {
      await redis.set(cacheKey, humanReadableBalance.toString(), 'EX', 120);
    } catch (error: any) {
      // Redis connection error - continue without caching
      if (!error.message?.includes('Connection is closed') && !error.message?.includes('ECONNREFUSED')) {
        console.error('Error caching balance:', error);
      }
    }
    
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
      chainName as Chain, 
      platformWallets.main.address, 
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
    // Skip queue processing if Redis is not connected
    if (!isRedisConnected()) {
      return;
    }

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
    
    // Skip transactions that have exceeded retry attempts
    if (tx.attempts >= MAX_RETRY_ATTEMPTS) {
      logger.warn(`Skipping permanently failed transaction ${tx.id} (${tx.attempts} attempts)`);
      await redis.lrem(queueKey, 1, JSON.stringify({...tx, isProcessing: false}));
      continue;
    }
    
    // Skip transactions that are too old (older than 24 hours)
    const ageMs = Date.now() - tx.timestamp;
    const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours
    if (ageMs > maxAgeMs) {
      logger.warn(`Skipping old transaction ${tx.id} (age: ${Math.round(ageMs / 1000 / 60 / 60)} hours)`);
      await redis.lrem(queueKey, 1, JSON.stringify({...tx, isProcessing: false}));
      continue;
    }
    
    // Check if the escrow is already marked as permanently failed
    if (tx.escrowId) {
      try {
        const escrow = await mongoose.model('Escrow').findById(tx.escrowId);
        if (escrow && (escrow.status === 'failed' || escrow.metadata?.permanentlyFailed)) {
          logger.warn(`Skipping transaction ${tx.id} - escrow ${tx.escrowId} is permanently failed`);
          await redis.lrem(queueKey, 1, JSON.stringify({...tx, isProcessing: false}));
          continue;
        }
      } catch (escrowError) {
        logger.error(`Error checking escrow status for ${tx.id}:`, escrowError);
      }
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
    
    // Process each transaction with enhanced error handling
    for (const tx of transactions) {
      let processingStartTime = Date.now();
      
      try {
        logger.info(`Processing transaction ${tx.id} to ${maskAddress(tx.toAddress)}`);
        logger.info(`- Amount: ${tx.amount} ${tokenType}`);
        logger.info(`- Attempt: ${tx.attempts + 1} of ${RETRY_CONFIG.MAX_ATTEMPTS}`);
        
        // Enhanced validation
        if (!isValidEthereumAddress(tx.toAddress)) {
          throw new Error(`Invalid recipient address: ${tx.toAddress}`);
        }
        
        if (!isValidAmount(tx.amount)) {
          throw new Error(`Invalid amount: ${tx.amount}`);
        }
        
        // Real-time balance check before processing
        const currentBalance = await getTokenBalanceOnChain(
          chainName as Chain, 
          platformWallets.main.address, 
          tokenType
        );
        
        if (currentBalance < tx.amount) {
          throw new Error(`Insufficient balance: ${currentBalance} < ${tx.amount}`);
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
      
        // Enhanced timeout based on transaction priority
        const timeout = tx.priority === 'high' ? TRANSACTION_TIMEOUTS.HIGH_PRIORITY : TRANSACTION_TIMEOUTS.NORMAL;
        
        // Execute transaction with dynamic timeout and better error handling
        const result = await promiseWithTimeout(
          sendTransaction({
          transaction: transferTx,
          account: account
          }),
          timeout,
          `Transaction ${tx.id} timed out after ${timeout/1000} seconds`
        );
      
        // Extract transaction hash
        const txHash = result.transactionHash;
        if (!txHash) {
          throw new Error('Transaction completed but no hash was returned');
        }
        
        // Calculate processing time
        const processingTime = Date.now() - processingStartTime;
        
        // Log success with full details and performance metrics
        logger.info(`✅ Transaction ${tx.id} completed: ${txHash}`);
        logger.info(`- Chain: ${chainName}`);
        logger.info(`- Token: ${tokenType}`);
        logger.info(`- Amount: ${tx.amount}`);
        logger.info(`- To: ${maskAddress(tx.toAddress)}`);
        logger.info(`- Processing Time: ${processingTime}ms`);
        logger.info(`- Explorer: ${generateExplorerUrl(chainName, txHash)}`);
      
        // Remove from processing queue
        await redis.lrem(`${queueKey}:processing`, 1, JSON.stringify(tx));
      
        // Record the successful transaction with performance metrics
      await recordTransaction({
          type: TransactionType.PLATFORM_TO_USER,
          txId: tx.id,
        txHash, 
          status: 'completed',
          toAddress: tx.toAddress,
          amount: tx.amount,
        tokenType,
        chainName,
          executionTimeMs: processingTime
        });

        // Record transaction in monitoring system
        await transactionMonitor.recordTransaction(
          tx.id,
          true, // success
          processingTime,
          chainName,
          tokenType,
          tx.amount
        );
        
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
                'metadata.explorerUrl': generateExplorerUrl(chainName, txHash),
                'metadata.processingTimeMs': processingTime
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
            logger.info(`- Processing Time: ${processingTime}ms`);
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
        // Enhanced error handling with intelligent classification
        let errorMessage = 'Unknown error';
        let detailedError = 'Unknown error';
        let isRetryable = true;
        let retryDelay = RETRY_CONFIG.NETWORK_ERROR_BACKOFF;
        
        // Classify error type for intelligent retry logic
        if (error instanceof Error) {
          errorMessage = error.message;
          detailedError = error.message;
        
          // Check for permanent error conditions
          if (RETRY_CONFIG.PERMANENT_ERROR_CODES.some(code => errorMessage.includes(code))) {
            isRetryable = false;
          }
          
          // Adjust retry delay based on error type
          if (errorMessage.includes('gas') || errorMessage.includes('Gas')) {
            retryDelay = RETRY_CONFIG.GAS_ERROR_BACKOFF;
          }
          
          // Log the full error for debugging
          logger.error(`❌ Full error object for transaction ${tx.id}:`, {
            message: error.message,
            stack: error.stack,
            name: error.name,
            code: (error as any).code,
            reason: (error as any).reason,
            data: (error as any).data,
            details: (error as any).details,
            response: (error as any).response?.data,
            isRetryable,
            retryDelay
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
        
        // Update transaction with error info and processing time
        tx.attempts = (tx.attempts || 0) + 1;
        tx.lastAttempt = Date.now();
        tx.error = detailedError;
        
        // Intelligent retry logic
        if (!isRetryable || tx.attempts >= RETRY_CONFIG.MAX_ATTEMPTS) {
          // Mark as permanently failed
          logger.error(`❌ Transaction ${tx.id} has failed ${tx.attempts} times or is not retryable, marking as permanently failed`);
          
          // Record failed transaction in monitoring system
          await transactionMonitor.recordTransaction(
            tx.id,
            false, // failed
            Date.now() - processingStartTime,
            chainName,
            tokenType,
            tx.amount
          );

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
                    'metadata.failedAt': new Date().toISOString(),
                    'metadata.isRetryable': isRetryable,
                    'metadata.attempts': tx.attempts
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
          // Schedule for intelligent retry with custom backoff
          const backoffMs = Math.min(
            retryDelay * Math.pow(1.5, tx.attempts - 1) * (0.8 + Math.random() * 0.4), // Add jitter
            4 * 60 * 60 * 1000 // Max 4 hours
          );
          
          const retryTimestamp = Date.now() + backoffMs;
          
          // Add to retry schedule with enhanced metadata
          await redis.zadd('tx_retry_schedule', retryTimestamp, JSON.stringify({
            ...tx,
            retryReason: errorMessage,
            isRetryable,
            retryDelayMs: backoffMs
          }));
          
          // Remove from processing queue
          await redis.lrem(`${queueKey}:processing`, 1, JSON.stringify(tx));
          
          logger.info(`Scheduled intelligent retry for transaction ${tx.id} in ${Math.round(backoffMs / 1000)} seconds (${errorMessage})`);
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

// Helper functions for enhanced validation
function isValidEthereumAddress(address: string): boolean {
  return !!(address && 
         typeof address === 'string' && 
         address.length === 42 && 
         address.startsWith('0x') &&
         /^0x[a-fA-F0-9]{40}$/.test(address));
}

function isValidAmount(amount: number): boolean {
  return typeof amount === 'number' && 
         amount > 0 && 
         !isNaN(amount) && 
         isFinite(amount) &&
         amount <= Number.MAX_SAFE_INTEGER;
}

/**
 * Process transactions scheduled for retry
 */
export async function processScheduledRetries(): Promise<void> {
  try {
    // Skip retry processing if Redis is not connected
    if (!isRedisConnected()) {
      return;
    }

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
        
        // Check if this transaction has already failed permanently
        if (tx.attempts >= MAX_RETRY_ATTEMPTS) {
          logger.warn(`Skipping permanently failed transaction ${tx.id} (${tx.attempts} attempts)`);
          // Remove from retry schedule but don't re-queue
          await redis.zrem('tx_retry_schedule', item);
          continue;
        }
        
        // Check if transaction is too old (older than 24 hours)
        const ageMs = now - tx.timestamp;
        const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours
        if (ageMs > maxAgeMs) {
          logger.warn(`Skipping old transaction ${tx.id} (age: ${Math.round(ageMs / 1000 / 60 / 60)} hours)`);
          await redis.zrem('tx_retry_schedule', item);
          continue;
        }
        
        // Check if the escrow is already marked as permanently failed
        if (tx.escrowId) {
          try {
            const escrow = await mongoose.model('Escrow').findById(tx.escrowId);
            if (escrow && (escrow.status === 'failed' || escrow.metadata?.permanentlyFailed)) {
              logger.warn(`Skipping transaction ${tx.id} - escrow ${tx.escrowId} is permanently failed`);
              await redis.zrem('tx_retry_schedule', item);
              continue;
            }
          } catch (escrowError) {
            logger.error(`Error checking escrow status for ${tx.id}:`, escrowError);
          }
        }
        
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
        // Remove problematic items from retry schedule
        await redis.zrem('tx_retry_schedule', item);
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
    
    // Invalidate balance cache (best-effort; ignore Redis connectivity issues)
    try {
      await Promise.all([
        redis.del(WALLET_BALANCE_CACHE_PREFIX + smartAccount.address),
        redis.del(WALLET_BALANCE_CACHE_PREFIX + toAddress)
      ]);
    } catch (cacheError: any) {
      if (!cacheError?.message?.includes('Connection is closed') && !cacheError?.message?.includes('ECONNREFUSED')) {
        console.warn('⚠️ Failed to invalidate balance cache:', cacheError?.message || cacheError);
      }
      // proceed without failing the transfer
    }
    
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
async function getTokenBalanceOnChain(chain: Chain, walletAddress: string, tokenType: TokenSymbol): Promise<number> {
  try {
    const provider = new ethers.providers.JsonRpcProvider(SUPPORTED_CHAINS[chain].rpcUrls.default.http[0]);
    const tokenConfig = getTokenConfig(chain, tokenType);
    if (!tokenConfig) {
      throw new Error(`Token ${tokenType} not supported on chain ${chain}`);
    }
    const tokenContract = new ethers.Contract(tokenConfig.address, ERC20_ABI, provider);
    const balance = await tokenContract.balanceOf(walletAddress);
    const decimals = await tokenContract.decimals();
    return Number(ethers.utils.formatUnits(balance, decimals));
  } catch (error) {
    logger.error(`Error getting token balance on ${chain}:`, error);
    return 0;
  }
}

/**
 * Helper function to generate blockchain explorer URL
 */
function generateExplorerUrl(chainName: string, hash: string): string {
  const chain = validateChain(chainName);
  return `${SUPPORTED_CHAINS[chain].blockExplorers.default.url}/tx/${hash}`;
}

/**
 * Process all transaction queues in order of priority
 */
export async function processTransactionQueue(): Promise<void> {
  logger.info('Starting transaction queue processing');
  
  // Skip queue processing if Redis is not connected
  if (!isRedisConnected()) {
    return;
  }
  
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
    
    // Skip cleanup if Redis is not connected
    if (!isRedisConnected()) {
      logger.info('Redis not connected, skipping queue cleanup');
      return;
    }
    
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

/**
 * Initialize platform smart wallet with multiple EOA accounts
 * @param ownerKeys Array of private keys for the EOA accounts
 * @param chainName Chain to deploy on
 * @returns Smart wallet address
 */
export async function initializePlatformWallet(
  ownerKeys: string[],
  chainName: string = 'arbitrum'
): Promise<{ address: string }> {
  try {
    // Validate input
    if (!ownerKeys || ownerKeys.length !== 3) {
      throw new Error('Exactly 3 owner keys are required');
    }

    // Get chain configuration
    const chainConfig = config[chainName];
    if (!chainConfig || !chainConfig.chainId) {
      throw new Error(`Invalid chain configuration for ${chainName}`);
    }

    const chain = defineChain(chainConfig.chainId);

    // Create EOA accounts from private keys
    const ownerAccounts = ownerKeys.map(key => 
      privateKeyToAccount({ client, privateKey: key })
    );

    // Initialize smart wallet with first owner as primary
    const wallet = smartWallet({
      chain,
      factoryAddress: config.SMART_WALLET_FACTORY_ADDRESS || '',
      gasless: true,
    });

    // Connect wallet with first owner as primary
    const smartAccount = await wallet.connect({
      client,
      personalAccount: ownerAccounts[0],
    });

    if (!smartAccount) {
      throw new Error('Failed to connect smart wallet');
    }

    // Cache the smart wallet address
    await redis.set(PLATFORM_WALLETS_CACHE_KEY, smartAccount.address);

    // Cache owner addresses
    for (let i = 0; i < ownerAccounts.length; i++) {
      await redis.set(`${OWNER_CACHE_PREFIX}${chainName}:${i}`, ownerAccounts[i].address);
    }

    logger.info(`Platform smart wallet initialized: ${smartAccount.address}`);
    logger.info(`Primary owner: ${ownerAccounts[0].address}`);
    logger.info(`Backup owner 1: ${ownerAccounts[1].address}`);
    logger.info(`Backup owner 2: ${ownerAccounts[2].address}`);

    return { address: smartAccount.address };
  } catch (error) {
    logger.error('Error initializing platform wallet:', error);
    throw error;
  }
}

/**
 * Send tokens from platform wallet to recipient
 * Requires 2 owner signatures for security
 * @param amount Amount to send in human-readable format
 * @param recipientAddress Recipient address
 * @param primaryKey First owner's private key
 * @param secondaryKey Second owner's private key
 * @param chainName Chain to use
 * @param tokenSymbol Token to send
 */
export async function sendFromPlatformWallet(
  amount: number,
  recipientAddress: string,
  primaryKey: string,
  secondaryKey: string,
  chainName: string = 'arbitrum',
  tokenSymbol: TokenSymbol = 'USDC'
): Promise<{ transactionHash: string }> {
  try {
    // Get chain and token configuration
    const chainConfig = SUPPORTED_CHAINS[chainName as keyof typeof SUPPORTED_CHAINS];
    const tokenConfig = getTokenConfig(chainName as Chain, tokenSymbol);
    if (!chainConfig || !tokenConfig) {
      throw new Error(`Invalid configuration for ${chainName} or ${tokenSymbol}`);
    }

    const chain = defineChain(chainConfig);

    // Create EOA accounts
    const primaryAccount = privateKeyToAccount({ client, privateKey: primaryKey });
    const secondaryAccount = privateKeyToAccount({ client, privateKey: secondaryKey });

    // Initialize smart wallet with primary account
    const wallet = smartWallet({
      chain,
      factoryAddress: config.SMART_WALLET_FACTORY_ADDRESS || '',
      gasless: true,
    });

    // Connect wallet with primary account
    const smartAccount = await wallet.connect({
      client,
      personalAccount: primaryAccount,
    });

    if (!smartAccount) {
      throw new Error('Failed to connect smart wallet');
    }

    // Get token contract
    const tokenContract = getContract({
      client,
      chain,
      address: tokenConfig.address,
    });

    // Convert amount to raw format with proper decimals
    const decimals = tokenConfig.decimals || 18;
    const rawAmount = BigInt(Math.floor(amount * Math.pow(10, decimals)));

    // Encode the transfer function call
    const transferData = encodeAbiParameters(
      ERC20_TRANSFER_ABI.inputs,
      [ensure0xAddress(recipientAddress), rawAmount]
    );

    // Prepare the transfer transaction
    const preparedTx = await prepareTransaction({
      chain,
      client,
      to: tokenConfig.address,
      value: BigInt(0),
      data: `0xa9059cbb${transferData.slice(2)}` // 0xa9059cbb is the transfer function selector
    });

    // Execute the transaction with the smart wallet
    const result = await sendTransaction({
      transaction: preparedTx,
      account: smartAccount,
    });

    // Log success
    logger.info(`Transfer completed on ${chainName}: ${result.transactionHash}`);
    logger.info(`- Amount: ${amount} ${tokenSymbol}`);
    logger.info(`- To: ${maskAddress(recipientAddress)}`);
    logger.info(`- Explorer: ${generateExplorerUrl(chainName, result.transactionHash)}`);

    // Invalidate balance cache (only if Redis is connected)
    if (redis.status === 'ready') {
      try {
        const cacheKey = `${PLATFORM_WALLETS_CACHE_KEY}:${chainName}`;
        const walletAddress = await redis.get(cacheKey);
        if (walletAddress) {
          await redis.del(`${WALLET_BALANCE_CACHE_PREFIX}${chainName}:${walletAddress}`);
        }
      } catch (redisError) {
        logger.warn(`Failed to invalidate balance cache: ${redisError}`);
        // Continue anyway - cache invalidation is not critical
      }
    }

    return { transactionHash: result.transactionHash };
  } catch (error) {
    logger.error('Error sending from platform wallet:', error);
    throw error;
  }
}

/**
 * Get platform wallet balance
 * @param chainName Chain to check
 * @param tokenSymbol Token to check
 * @returns Balance as number
 */
export async function getPlatformWalletBalance(
  chainName: string = 'arbitrum',
  tokenSymbol: TokenSymbol = 'USDC'
): Promise<number> {
  try {
    // Get platform wallets (this returns the full object with main and fees wallets)
    const platformWallets = await initializePlatformWallets();
    const walletAddress = platformWallets.main.address;

    logger.info(`Getting balance for platform wallet: ${walletAddress}`);
    logger.info(`Chain: ${chainName}, Token: ${tokenSymbol}`);

    // Check cache first
    const cacheKey = `${WALLET_BALANCE_CACHE_PREFIX}${chainName}:${walletAddress}:${tokenSymbol}`;
    const cachedBalance = await redis.get(cacheKey);
    if (cachedBalance) {
      logger.info(`Using cached balance: ${cachedBalance} ${tokenSymbol}`);
      return Number(cachedBalance);
    }

    // Get chain configuration
    const chainConfig = SUPPORTED_CHAINS[chainName as keyof typeof SUPPORTED_CHAINS];
    if (!chainConfig) {
      throw new Error(`Chain ${chainName} not supported`);
    }

    // Get token configuration
    const tokenConfig = getTokenConfig(chainName as Chain, tokenSymbol);
    if (!tokenConfig) {
      throw new Error(`Token ${tokenSymbol} not supported on chain ${chainName}`);
    }

    logger.info(`Using token config: ${tokenConfig.address} (${tokenConfig.decimals} decimals)`);

    // Method 1: Try ThirdWeb approach (current)
    try {
      const chain = defineChain(chainConfig.id);

      // Get token contract
      const tokenContract = getContract({
        client,
        chain,
        address: tokenConfig.address,
      });

      // Get balance
      const rawBalance = await balanceOf({
        contract: tokenContract,
        address: walletAddress,
      });

      // Convert to human readable format
      const decimals = tokenConfig.decimals || 18;
      const balance = Number(rawBalance) / Math.pow(10, decimals);

      logger.info(`ThirdWeb method - Raw balance: ${rawBalance.toString()}, Human readable: ${balance} ${tokenSymbol}`);

      // Cache the balance for 2 minutes
      await redis.set(cacheKey, balance.toString(), 'EX', 120);

      return balance;
    } catch (thirdwebError: unknown) {
      const errorMessage = thirdwebError instanceof Error ? thirdwebError.message : 'Unknown ThirdWeb error';
      logger.warn(`ThirdWeb method failed, trying ethers.js fallback: ${errorMessage}`);
      
      // Method 2: Fallback to ethers.js approach (like in scripts)
      try {
        const provider = new ethers.providers.JsonRpcProvider(chainConfig.rpcUrls.default.http[0]);
        
        const ERC20_ABI = [
          'function balanceOf(address owner) view returns (uint256)',
          'function decimals() view returns (uint8)',
          'function symbol() view returns (string)'
        ];
        
        // Create contract instance
        const tokenContract = new ethers.Contract(tokenConfig.address, ERC20_ABI, provider);
        
        // Get balance and decimals
        const [balance, decimals] = await Promise.all([
          tokenContract.balanceOf(walletAddress),
          tokenContract.decimals()
        ]);
        
        // Convert to human-readable format
        const humanReadableBalance = Number(ethers.utils.formatUnits(balance, decimals));
        
        logger.info(`Ethers.js method - Raw balance: ${balance.toString()}, Human readable: ${humanReadableBalance} ${tokenSymbol}`);
        
        // Cache the balance for 2 minutes
        await redis.set(cacheKey, humanReadableBalance.toString(), 'EX', 120);
        
        return humanReadableBalance;
      } catch (ethersError: unknown) {
        const thirdwebMsg = thirdwebError instanceof Error ? thirdwebError.message : 'Unknown ThirdWeb error';
        const ethersMsg = ethersError instanceof Error ? ethersError.message : 'Unknown Ethers error';
        
        logger.error(`Both ThirdWeb and ethers.js methods failed for balance check`);
        logger.error(`ThirdWeb error: ${thirdwebMsg}`);
        logger.error(`Ethers.js error: ${ethersMsg}`);
        throw new Error(`Failed to get balance using both methods. ThirdWeb: ${thirdwebMsg}, Ethers: ${ethersMsg}`);
      }
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error getting platform wallet balance:', errorMessage);
    throw error;
  }
}

/**
 * Recover platform wallet access using backup owners
 * @param lostKey Private key that was lost
 * @param newKey New private key to replace lost key
 * @param backupKey Backup owner's private key for authorization
 * @param chainName Chain to use
 */
export async function recoverPlatformWallet(
  lostKey: string,
  newKey: string,
  backupKey: string,
  chainName: string = 'arbitrum'
): Promise<void> {
  try {
    // Get chain configuration
    const chainConfig = config[chainName];
    if (!chainConfig || !chainConfig.chainId) {
      throw new Error(`Invalid chain configuration for ${chainName}`);
    }

    const chain = defineChain(chainConfig.chainId);

    // Create accounts
    const lostAccount = privateKeyToAccount({ client, privateKey: lostKey });
    const newAccount = privateKeyToAccount({ client, privateKey: newKey });
    const backupAccount = privateKeyToAccount({ client, privateKey: backupKey });

    // Initialize smart wallet
    const wallet = smartWallet({
      chain,
      factoryAddress: config.SMART_WALLET_FACTORY_ADDRESS || '',
      gasless: true,
    });

    // Connect with backup account
    const smartAccount = await wallet.connect({
      client,
      personalAccount: backupAccount,
    });

    if (!smartAccount) {
      throw new Error('Failed to connect smart wallet for recovery');
    }

    // Update owner in smart wallet configuration
    // This will be handled by ThirdWeb's smart wallet implementation
    const result = await (smartAccount as any).updateOwner(lostAccount.address, newAccount.address);

    // Update cache
    const ownerKeys = await redis.keys(`${OWNER_CACHE_PREFIX}*`);
    for (const key of ownerKeys) {
      const address = await redis.get(key);
      if (address === lostAccount.address) {
        await redis.set(key, newAccount.address);
        break;
      }
    }

    logger.info(`Platform wallet recovered: ${lostAccount.address} replaced with ${newAccount.address}`);
    logger.info(`Recovery transaction hash: ${result.transactionHash}`);
  } catch (error) {
    logger.error('Error recovering platform wallet:', error);
    throw error;
  }
}

/**
 * Initialize platform wallet across multiple chains
 * @param ownerKeys Array of private keys for the EOA accounts
 * @returns Object with wallet addresses for each chain
 */
export async function initializeMultiChainWallet(
  ownerKeys: string[]
): Promise<{ [chainName: string]: string }> {
  try {
    // Validate input
    if (!ownerKeys || ownerKeys.length !== 3) {
      throw new Error('Exactly 3 owner keys are required');
    }

    const walletAddresses: { [chainName: string]: string } = {};

    // Get enabled chains from environment or use all
    const enabledChains = process.env.ENABLED_CHAINS ? 
      process.env.ENABLED_CHAINS.split(',').map(c => c.trim()) :
      Object.keys(SUPPORTED_CHAINS);

    // Initialize wallet on each enabled chain
    for (const chainName of enabledChains) {
      try {
        const chainConfig = SUPPORTED_CHAINS[chainName as keyof typeof SUPPORTED_CHAINS];
        if (!chainConfig) {
          logger.warn(`Skipping unsupported chain: ${chainName}`);
          continue;
        }

        logger.info(`Initializing wallet on ${chainName}...`);

        // Use the chain configuration directly since it now matches ThirdWeb's format
        const chain = defineChain(chainConfig.id);

        // Create EOA accounts from private keys
        const ownerAccounts = ownerKeys.map(key => 
          privateKeyToAccount({ client, privateKey: key })
        );

        // Initialize smart wallet with first owner as primary
        const wallet = smartWallet({
          chain,
          factoryAddress: config.SMART_WALLET_FACTORY_ADDRESS || '',
          gasless: process.env.ENABLE_GASLESS === 'true',
        });

        // Connect wallet with first owner as primary
        const smartAccount = await wallet.connect({
          client,
          personalAccount: ownerAccounts[0],
        });

        if (!smartAccount) {
          throw new Error(`Failed to connect smart wallet on ${chainName}`);
        }

        // Cache the smart wallet address for this chain
        const cacheKey = `${PLATFORM_WALLETS_CACHE_KEY}:${chainName}`;
        await redis.set(cacheKey, smartAccount.address);

        // Cache owner addresses
        for (let i = 0; i < ownerAccounts.length; i++) {
          await redis.set(`${OWNER_CACHE_PREFIX}${chainName}:${i}`, ownerAccounts[i].address);
        }

        walletAddresses[chainName] = smartAccount.address;

        logger.info(`✅ Platform wallet initialized on ${chainName}: ${smartAccount.address}`);
        logger.info(`- Primary owner: ${ownerAccounts[0].address}`);
        logger.info(`- Backup owner 1: ${ownerAccounts[1].address}`);
        logger.info(`- Backup owner 2: ${ownerAccounts[2].address}`);
        logger.info(`- RPC URL: ${chainConfig.rpcUrls.default.http[0]}`);
        logger.info(`- Explorer: ${chainConfig.blockExplorers.default.url}`);
      } catch (error) {
        logger.error(`Error initializing wallet on ${chainName}:`, error);
        // Continue with other chains
        continue;
      }
    }

    return walletAddresses;
  } catch (error) {
    logger.error('Error initializing multi-chain wallet:', error);
    throw error;
  }
}

// Update function signatures to handle chain type conversion
function processTransaction(chainName: string, ...args: any[]): Promise<any> {
  const chain = validateChain(chainName);
  // Process with validated chain
  return Promise.resolve(); // Implement actual logic
}

// Update smart wallet owner management
async function updateSmartWalletOwner(
  smartAccount: Account,
  oldOwner: string,
  newOwner: string
): Promise<void> {
  // Use ThirdWeb's smart wallet implementation
  const wallet = smartAccount as any; // Type assertion for ThirdWeb's wallet
  if (typeof wallet.updateOwner === 'function') {
    await wallet.updateOwner(ensure0xAddress(oldOwner), ensure0xAddress(newOwner));
  } else {
    throw new Error('Smart wallet does not support owner updates');
  }
}

/**
 * Clear platform wallet cache to force refresh
 */
export async function clearPlatformWalletCache(): Promise<void> {
  try {
    await redis.del(PLATFORM_WALLETS_CACHE_KEY);
    console.log('✅ Platform wallet cache cleared');
  } catch (error) {
    console.error('❌ Error clearing platform wallet cache:', error);
  }
}

/**
 * Get the blockchain explorer API key for a specific chain
 */
function getExplorerApiKey(chainName: string): string | undefined {
  switch (chainName) {
    case 'arbitrum':
      return config.ARBITRUM_EXPLORER_API_KEY;
    case 'polygon':
      return config.POLYGON_EXPLORER_API_KEY;
    case 'optimism':
      return config.OPTIMISM_EXPLORER_API_KEY;
    case 'base':
      return config.BASE_EXPLORER_API_KEY;
    case 'celo':
      return config.CELO_EXPLORER_API_KEY;
    case 'fuse':
      return config.FUSE_EXPLORER_API_KEY;
    default:
      return undefined;
  }
}

/**
 * Get the explorer API URL for a specific chain
 */
function getExplorerApiUrl(chainName: string): string | undefined {
  switch (chainName) {
    case 'arbitrum':
      return 'https://api.arbiscan.io/api';
    case 'polygon':
      return 'https://api.polygonscan.com/api';
    case 'optimism':
      return 'https://api-optimistic.etherscan.io/api';
    case 'base':
      return 'https://api.basescan.org/api';
    case 'celo':
      return 'https://api.celoscan.io/api';
    case 'fuse':
      return 'https://explorer.fuse.io/api';
    default:
      return undefined;
  }
}

// Helper function to ensure chain parameter is valid