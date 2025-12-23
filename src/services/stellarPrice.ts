import pino from 'pino';
import { redis, isRedisConnected } from '../config/redis';
import config from '../config/env';

// Configure logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty'
  }
});

export interface StellarPriceData {
  asset: string;
  priceUSD: number;
  priceChange24h: number;
  marketCap?: number;
  volume24h?: number;
  lastUpdated: Date;
}

export interface StellarAssetPrice {
  XLM: number;
  USDC: number;
  USDT: number;
  BTC: number;
  [key: string]: number;
}

export class StellarPriceService {
  private readonly CACHE_DURATION = 300; // 5 minutes
  private readonly CACHE_KEY = 'stellar:prices';

  /**
   * Get current price for Stellar assets
   */
  async getAssetPrice(asset: string): Promise<number> {
    try {
      const prices = await this.getAllPrices();
      return prices[asset.toUpperCase()] || 0;
    } catch (error) {
      logger.error('Error getting asset price:', error);
      return 0;
    }
  }

  /**
   * Get all Stellar asset prices
   */
  async getAllPrices(): Promise<StellarAssetPrice> {
    try {
      // Check cache first
      if (isRedisConnected()) {
        const cached = await redis.get(this.CACHE_KEY);
        if (cached) {
          const data = JSON.parse(cached);
          return data.prices;
        }
      }

      // Fetch from multiple sources
      const prices = await this.fetchPricesFromSources();
      
      // Cache the result
      if (isRedisConnected()) {
        await redis.setex(
          this.CACHE_KEY, 
          this.CACHE_DURATION, 
          JSON.stringify({ 
            prices, 
            lastUpdated: new Date().toISOString() 
          })
        );
      }

      return prices;
    } catch (error) {
      logger.error('Error getting all prices:', error);
      // Return fallback prices
      return {
        XLM: 0.1, // Fallback price
        USDC: 1.0,
        USDT: 1.0,
        BTC: 0
      };
    }
  }

  /**
   * Fetch prices from multiple sources
   */
  private async fetchPricesFromSources(): Promise<StellarAssetPrice> {
    const prices: StellarAssetPrice = {
      XLM: 0,
      USDC: 1.0,
      USDT: 1.0,
      BTC: 0
    };

    try {
      // Try CoinGecko first
      const coinGeckoPrices = await this.fetchFromCoinGecko();
      if (coinGeckoPrices.XLM > 0) {
        prices.XLM = coinGeckoPrices.XLM;
      }
      if (coinGeckoPrices.BTC > 0) {
        prices.BTC = coinGeckoPrices.BTC;
      }

      // Try CoinMarketCap if available
      if (config.COINMARKETCAP_API_KEY) {
        const cmcPrices = await this.fetchFromCoinMarketCap();
        if (cmcPrices.XLM > 0) {
          prices.XLM = cmcPrices.XLM;
        }
        if (cmcPrices.BTC > 0) {
          prices.BTC = cmcPrices.BTC;
        }
      }

      // Fallback to Binance API
      if (prices.XLM === 0 || prices.BTC === 0) {
        const binancePrices = await this.fetchFromBinance();
        if (prices.XLM === 0 && binancePrices.XLM > 0) {
          prices.XLM = binancePrices.XLM;
        }
        if (prices.BTC === 0 && binancePrices.BTC > 0) {
          prices.BTC = binancePrices.BTC;
        }
      }

      logger.info('Fetched Stellar prices:', prices);
      return prices;
    } catch (error) {
      logger.error('Error fetching prices from sources:', error);
      return prices;
    }
  }

  /**
   * Fetch prices from CoinGecko
   */
  private async fetchFromCoinGecko(): Promise<StellarAssetPrice> {
    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd&include_24hr_change=true'
      );

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        XLM: data.stellar?.usd || 0,
        USDC: 1.0,
        USDT: 1.0,
        BTC: data.bitcoin?.usd || 0
      };
    } catch (error) {
      logger.error('Error fetching from CoinGecko:', error);
      return { XLM: 0, USDC: 1.0, USDT: 1.0, BTC: 0 };
    }
  }

  /**
   * Fetch prices from CoinMarketCap
   */
  private async fetchFromCoinMarketCap(): Promise<StellarAssetPrice> {
    try {
      if (!config.COINMARKETCAP_API_KEY) {
        throw new Error('CoinMarketCap API key not configured');
      }

      const response = await fetch(
        'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=XLM,BTC',
        {
          headers: {
            'X-CMC_PRO_API_KEY': config.COINMARKETCAP_API_KEY,
            'Accept': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`CoinMarketCap API error: ${response.statusText}`);
      }

      const data = await response.json();
      const xlmData = data.data?.XLM?.quote?.USD;
      const btcData = data.data?.BTC?.quote?.USD;
      
      return {
        XLM: xlmData?.price || 0,
        USDC: 1.0,
        USDT: 1.0,
        BTC: btcData?.price || 0
      };
    } catch (error) {
      logger.error('Error fetching from CoinMarketCap:', error);
      return { XLM: 0, USDC: 1.0, USDT: 1.0, BTC: 0 };
    }
  }

  /**
   * Fetch prices from Binance
   */
  private async fetchFromBinance(): Promise<StellarAssetPrice> {
    try {
      // Fetch XLM and BTC prices from Binance
      const [xlmResponse, btcResponse] = await Promise.all([
        fetch('https://api.binance.com/api/v3/ticker/price?symbol=XLMUSDT'),
        fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT')
      ]);

      let xlmPrice = 0;
      let btcPrice = 0;

      if (xlmResponse.ok) {
        const xlmData = await xlmResponse.json();
        xlmPrice = parseFloat(xlmData.price) || 0;
      }

      if (btcResponse.ok) {
        const btcData = await btcResponse.json();
        btcPrice = parseFloat(btcData.price) || 0;
      }

      return {
        XLM: xlmPrice,
        USDC: 1.0,
        USDT: 1.0,
        BTC: btcPrice
      };
    } catch (error) {
      logger.error('Error fetching from Binance:', error);
      return { XLM: 0, USDC: 1.0, USDT: 1.0, BTC: 0 };
    }
  }

  /**
   * Calculate USD value for an amount of asset
   */
  async calculateUSDValue(amount: string, asset: string): Promise<number> {
    try {
      const price = await this.getAssetPrice(asset);
      return parseFloat(amount) * price;
    } catch (error) {
      logger.error('Error calculating USD value:', error);
      return 0;
    }
  }

  /**
   * Get price data with additional information
   */
  async getPriceData(asset: string): Promise<StellarPriceData> {
    try {
      const price = await this.getAssetPrice(asset);
      
      return {
        asset: asset.toUpperCase(),
        priceUSD: price,
        priceChange24h: 0, // Would need additional API calls for 24h change
        lastUpdated: new Date()
      };
    } catch (error) {
      logger.error('Error getting price data:', error);
      return {
        asset: asset.toUpperCase(),
        priceUSD: 0,
        priceChange24h: 0,
        lastUpdated: new Date()
      };
    }
  }

  /**
   * Get historical prices (placeholder for future implementation)
   */
  async getHistoricalPrices(
    asset: string, 
    days: number = 7
  ): Promise<Array<{ date: string; price: number }>> {
    try {
      // This would typically fetch from a historical price API
      // For now, return empty array
      logger.info(`Historical prices requested for ${asset} (${days} days)`);
      return [];
    } catch (error) {
      logger.error('Error getting historical prices:', error);
      return [];
    }
  }

  /**
   * Clear price cache
   */
  async clearCache(): Promise<void> {
    try {
      if (isRedisConnected()) {
        await redis.del(this.CACHE_KEY);
        logger.info('Stellar price cache cleared');
      }
    } catch (error) {
      logger.error('Error clearing price cache:', error);
    }
  }
}

// Export singleton instance
export const stellarPriceService = new StellarPriceService();
