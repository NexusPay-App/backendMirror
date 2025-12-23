import config from './env';

export interface StellarConfig {
  network: 'testnet' | 'mainnet';
  horizonUrl: string;
  friendbotUrl?: string;
  usdcIssuer: string;
  usdtIssuer: string;
  btcIssuer: string;
  xlmAssetCode: string;
  platformWalletSecret?: string;
}

export interface StellarAsset {
  code: string;
  issuer?: string;
  type: 'native' | 'credit_alphanum4' | 'credit_alphanum12';
}

export interface StellarTransaction {
  id: string;
  hash: string;
  source: string;
  destination: string;
  amount: string;
  asset: StellarAsset;
  fee: string;
  memo?: string;
  createdAt: string;
  status: 'pending' | 'success' | 'failed';
}

export interface StellarAccount {
  id: string;
  accountId: string;
  balances: Array<{
    asset: StellarAsset;
    balance: string;
    limit?: string;
  }>;
  sequence: string;
  subentryCount: number;
  inflationDestination?: string;
  homeDomain?: string;
  lastModifiedLedger: number;
  thresholds: {
    lowThreshold: number;
    medThreshold: number;
    highThreshold: number;
  };
  flags: {
    authRequired: boolean;
    authRevocable: boolean;
    authImmutable: boolean;
  };
}

// Get Stellar configuration based on environment
export function getStellarConfig(): StellarConfig {
  const network = process.env.STELLAR_NETWORK || 'mainnet';
  const isTestnet = network === 'testnet';
  
  return {
    network: network as 'testnet' | 'mainnet',
    horizonUrl: isTestnet 
      ? process.env.STELLAR_HORIZON_URL_TESTNET || 'https://horizon-testnet.stellar.org'
      : process.env.STELLAR_HORIZON_URL_MAINNET || 'https://horizon.stellar.org',
    friendbotUrl: isTestnet 
      ? process.env.STELLAR_FRIENDBOT_URL || 'https://friendbot.stellar.org'
      : undefined,
    usdcIssuer: isTestnet
      ? process.env.STELLAR_USDC_ISSUER_TESTNET || 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
      : process.env.STELLAR_USDC_ISSUER_MAINNET || 'GA24LJXFG73JGARIBG2GP6V5TNUUOS6BD23KOFCW3INLDY5KPKS7GACZ',
    usdtIssuer: isTestnet
      ? process.env.STELLAR_USDT_ISSUER_TESTNET || 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
      : process.env.STELLAR_USDT_ISSUER_MAINNET || 'GA24LJXFG73JGARIBG2GP6V5TNUUOS6BD23KOFCW3INLDY5KPKS7GACZ',
    btcIssuer: isTestnet
      ? process.env.STELLAR_BTC_ISSUER_TESTNET || 'GA23XTUUTBEW2ULZWZY4PRN6JUX7YLMARUHNUXJ347JPWFHN5GN2H3IX'
      : process.env.STELLAR_BTC_ISSUER_MAINNET || 'GA23XTUUTBEW2ULZWZY4PRN6JUX7YLMARUHNUXJ347JPWFHN5GN2H3IX',
    xlmAssetCode: process.env.STELLAR_XLM_ASSET_CODE || 'XLM',
    platformWalletSecret: process.env.STELLAR_PLATFORM_WALLET_SECRET
  };
}

// Stellar asset definitions
export const STELLAR_ASSETS = {
  XLM: {
    code: 'XLM',
    type: 'native' as const
  },
  USDC: {
    code: 'USDC',
    issuer: getStellarConfig().usdcIssuer,
    type: 'credit_alphanum4' as const
  },
  USDT: {
    code: 'USDT',
    issuer: getStellarConfig().usdtIssuer,
    type: 'credit_alphanum4' as const
  },
  BTC: {
    code: 'BTC',
    issuer: getStellarConfig().btcIssuer,
    type: 'credit_alphanum4' as const
  }
} as const;

// Cache keys for Stellar operations
export const STELLAR_CACHE_KEYS = {
  ACCOUNT_BALANCE: 'stellar:balance:',
  ACCOUNT_INFO: 'stellar:account:',
  TRANSACTION_HISTORY: 'stellar:tx_history:',
  PLATFORM_WALLET: 'stellar:platform_wallet',
  FEE_POOL: 'stellar:fee_pool',
  LEDGER_INFO: 'stellar:ledger_info'
} as const;

// Stellar network constants
export const STELLAR_CONSTANTS = {
  BASE_FEE: 100, // stroops (0.00001 XLM)
  MIN_BALANCE: 0.5, // XLM minimum balance for account
  MAX_MEMO_LENGTH: 28,
  TRANSACTION_TIMEOUT: 300000, // 5 minutes in milliseconds
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000 // 1 second
} as const;
