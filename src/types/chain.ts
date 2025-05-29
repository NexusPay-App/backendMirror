export type Chain = 'arbitrum' | 'polygon' | 'base' | 'optimism' | 'celo' | 'scroll' | 'fuse' | 'gnosis' | 'aurora';

export type TokenSymbol = 'USDC' | 'cUSD';

export interface TokenConfig {
  address: `0x${string}`;
  decimals: number;
}

export interface ChainConfig {
  id: number;
  name: string;
  network: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: {
    default: {
      http: string[];
    };
  };
  blockExplorers: {
    default: {
      name: string;
      url: string;
    };
  };
}

export interface CacheKeys {
  WALLET_CACHE_KEY: string;
  OWNER_CACHE_PREFIX: string;
  WALLET_BALANCE_CACHE_PREFIX: string;
  TOKEN_PRICE_CACHE_PREFIX: string;
  GAS_PRICE_CACHE_PREFIX: string;
  TRANSACTION_HISTORY_CACHE_PREFIX: string;
  QUEUE_PREFIX: string;
  WALLETS_CACHE_KEY: string;
} 