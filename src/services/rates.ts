import { redis } from '../config/redis';
const assets: Record<string, string> = { USDC: 'usd-coin', USDT: 'tether', BTC: 'bitcoin', ETH: 'ethereum' };
const TTL = 300;
export interface RateQuote { rate: number; source: string; quotedAt: string; }
function valid(quote: RateQuote) { return Number.isFinite(quote.rate) && quote.rate > 0 && Date.now() - Date.parse(quote.quotedAt) < TTL * 1000; }
async function freshQuote(token: string): Promise<RateQuote> {
  if (!assets[token]) throw new Error(`Unsupported quote asset: ${token}`);
  try {
    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${assets[token]}&vs_currencies=kes`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Quote provider unavailable');
    const json = await response.json() as Record<string, { kes: number }>;
    const quote = { rate: json[assets[token]]?.kes, source: 'coingecko', quotedAt: new Date().toISOString() };
    if (valid(quote)) return quote;
  } catch { /* Try the configured secondary provider. */ }
  if (process.env.COINMARKETCAP_API_KEY) {
    const response = await fetch(`https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${token}&convert=KES`, { headers: { 'X-CMC_PRO_API_KEY': process.env.COINMARKETCAP_API_KEY }, signal: AbortSignal.timeout(10000) });
    if (response.ok) {
      const json = await response.json() as any;
      const quote = { rate: json.data?.[token]?.quote?.KES?.price, source: 'coinmarketcap', quotedAt: new Date().toISOString() };
      if (valid(quote)) return quote;
    }
  }
  throw new Error('A current exchange-rate quote is unavailable; payment was not priced');
}
export async function getRateQuote(tokenType = 'USDC', refresh = false): Promise<RateQuote> {
  const token = tokenType.toUpperCase();
  if (!assets[token]) throw new Error(`Unsupported quote asset: ${token}`);
  const key = `rates:v2:${token}:KES`;
  if (!refresh) {
    try { const value = await redis.get(key); if (value) { const quote = JSON.parse(value); if (valid(quote)) return quote; } } catch { /* Live quotes remain available if cache is down. */ }
  }
  const quote = await freshQuote(token);
  try { await redis.setex(key, TTL, JSON.stringify(quote)); } catch { /* Cache is optional, pricing is not. */ }
  return quote;
}
export const getConversionRateWithCaching = async (tokenType = 'USDC') => (await getRateQuote(tokenType)).rate;
export const forceRefreshConversionRate = async (tokenType = 'USDC') => (await getRateQuote(tokenType, true)).rate;
export async function getRateInfo(): Promise<Record<string, unknown>> {
  return { current: Object.fromEntries(await Promise.all(Object.keys(assets).map(async token => {
    try { return [token, await getRateQuote(token)]; } catch { return [token, { available: false }]; }
  }))) };
}
