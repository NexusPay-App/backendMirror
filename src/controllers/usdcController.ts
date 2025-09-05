import { Request, Response } from 'express';
import { ethers, providers } from 'ethers';
import { provider, tokenAddress } from '../config/constants';
import { getConversionRateWithCaching } from '../services/token';
import { usdcAbi } from '../config/abi';
import { redis } from '../config/redis';

// Cache settings
const USD_KES_CACHE_KEY = 'usd_to_kes_rate';
const CACHE_DURATION = 5 * 60; // 5 minutes as suggested in requirements

/**
 * Get USD to KES conversion rate using Exchange Rate API with caching
 * This provides consistent rates that match frontend expectations
 */
async function getUSDToKESRate(): Promise<{ rate: number; source: string }> {
  try {
    // Check cache first
    const cachedRate = await redis.get(USD_KES_CACHE_KEY);
    if (cachedRate) {
      const parsed = JSON.parse(cachedRate);
      console.log('Using cached USD to KES rate:', parsed);
      return parsed;
    }
    
    // Try Exchange Rate API first (as suggested in requirements)
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    
    if (response.ok) {
      const data = await response.json();
      const kesRate = data.rates?.KES;
      
      if (kesRate && typeof kesRate === 'number' && kesRate > 0) {
        const result = {
          rate: kesRate,
          source: 'exchange-rate-api'
        };
        
        // Cache the result
        await redis.set(USD_KES_CACHE_KEY, JSON.stringify(result), 'EX', CACHE_DURATION);
        console.log('Cached new USD to KES rate from Exchange Rate API:', result);
        
        return result;
      }
    }
    
    // Fallback to CoinGecko API
    const coingeckoResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=kes');
    
    if (coingeckoResponse.ok) {
      const coingeckoData = await coingeckoResponse.json();
      const usdcKesRate = coingeckoData['usd-coin']?.kes;
      
      if (usdcKesRate && typeof usdcKesRate === 'number' && usdcKesRate > 0) {
        const result = {
          rate: usdcKesRate,
          source: 'coingecko'
        };
        
        // Cache the result
        await redis.set(USD_KES_CACHE_KEY, JSON.stringify(result), 'EX', CACHE_DURATION);
        console.log('Cached new USD to KES rate from CoinGecko:', result);
        
        return result;
      }
    }
    
    // Final fallback
    console.warn('All external APIs failed, using fallback rate');
    const fallbackResult = {
      rate: 129.23,
      source: 'fallback'
    };
    
    // Cache the fallback result for a shorter time
    await redis.set(USD_KES_CACHE_KEY, JSON.stringify(fallbackResult), 'EX', 60); // 1 minute
    console.log('Cached fallback USD to KES rate:', fallbackResult);
    
    return fallbackResult;
    
  } catch (error) {
    console.error('Error fetching USD to KES rate:', error);
    return {
      rate: 129.23,
      source: 'fallback'
    };
  }
}

export async function conversionController(req: Request, res: Response) {
  try {
    const { rate, source } = await getUSDToKESRate();
    
    const response = {
      rate: rate,
      currency: "KES",
      baseCurrency: "USD",
      timestamp: new Date().toISOString(),
      source: source
    };
    
    console.log('USD to KES conversion rate response:', response);
    res.json(response);
  } catch (error) {
    console.error('Error in conversion controller:', error);
    
    // Return fallback response with default rate
    const fallbackResponse = {
      rate: 129.23,
      currency: "KES",
      baseCurrency: "USD",
      timestamp: new Date().toISOString(),
      source: "fallback"
    };
    
    res.json(fallbackResponse);
  }
}

export const getUsdcBalance = async (req: Request, res: Response) => {
  try {
    const address = req.params.address;
    console.log(address)
    const usdcContract = new ethers.Contract(tokenAddress, usdcAbi, provider);

    const balanceRaw = await usdcContract.balanceOf(address);
    console.log(balanceRaw.toString())  // Display balance as string for debugging
    const decimals = await usdcContract.decimals();
    console.log(`decimals: ${decimals}`)

    // Convert raw balance to a number in USDC by dividing by 10^decimals
    // const balanceInUSDC = balanceRaw.div(ethers.BigNumber.from(10).pow(decimals)).toNumber();
    const balanceInUSDC: any = ethers.utils.formatUnits(balanceRaw, decimals);

    console.log(balanceInUSDC)
    const conversionRate = await getConversionRateWithCaching();
    const balanceInKES = balanceInUSDC * conversionRate;
    console.log(balanceInKES)

    res.json({
      balanceInUSDC: balanceInUSDC,
      balanceInKES: balanceInKES.toFixed(2),
      rate: conversionRate
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to fetch balance.');
  }
};