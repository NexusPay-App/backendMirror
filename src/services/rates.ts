import { redis } from '../config/redis';
const assets: Record<string, string> = {
  USDC: 'usd-coin', USDT: 'tether', BTC: 'bitcoin', ETH: 'ethereum',
  WBTC: 'bitcoin', WETH: 'ethereum', ARB: 'arbitrum', DAI: 'dai',
};
// CoinMarketCap ids for assets CoinGecko does not list. CMC reuses the symbol
// "BOT" for several unrelated tokens, so quotes must target the currency id.
const cmcAssets: Record<string, number> = { BOT: 40873 }; // slug bot-chain ("BOT Chain")
const TTL = 300;
// Memory fallback for when Redis is unavailable: without it every history row
// would hit the quote provider directly, which rate-limits (CoinGecko) or burns
// a paid credit (CoinMarketCap) per call.
const quoteCache = new Map<string, RateQuote>();
export interface RateQuote { rate: number; source: string; quotedAt: string; }
function valid(quote: RateQuote) { return Number.isFinite(quote.rate) && quote.rate > 0 && Date.now() - Date.parse(quote.quotedAt) < TTL * 1000; }
async function freshQuote(token: string): Promise<RateQuote> {
  const cmcId = cmcAssets[token];
  if (cmcId === undefined && !assets[token]) throw new Error(`Unsupported quote asset: ${token}`);
  if (cmcId !== undefined && process.env.COINMARKETCAP_API_KEY) {
    try {
      const response = await fetch(`https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?id=${cmcId}&convert=KES`, { headers: { 'X-CMC_PRO_API_KEY': process.env.COINMARKETCAP_API_KEY }, signal: AbortSignal.timeout(10000) });
      if (response.ok) {
        const json = await response.json() as Record<string, any>;
        const quote = { rate: json.data?.[cmcId]?.quote?.KES?.price, source: 'coinmarketcap', quotedAt: new Date().toISOString() };
        if (valid(quote)) return quote;
      }
    } catch { /* No live quote: surface the failure instead of inventing a price. */ }
  }
  if (!assets[token]) throw new Error(`A current exchange-rate quote is unavailable; payment was not priced`);
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
  if (!assets[token] && cmcAssets[token] === undefined) throw new Error(`Unsupported quote asset: ${token}`);
  const key = `rates:v2:${token}:KES`;
  if (!refresh) {
    try { const value = await redis.get(key); if (value) { const quote = JSON.parse(value); if (valid(quote)) return quote; } } catch { /* Live quotes remain available if cache is down. */ }
    const memory = quoteCache.get(key);
    if (memory && valid(memory)) return memory;
  }
  const quote = await freshQuote(token);
  quoteCache.set(key, quote);
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

// USD spot prices for portfolio totals (stablecoins short-circuit at $1).
const usdIds: Record<string, string> = {
  USDC: 'usd-coin', USDT: 'tether', DAI: 'dai', cUSD: 'celo-dollar',
  ETH: 'ethereum', WETH: 'ethereum', WBTC: 'bitcoin', BTC: 'bitcoin', ARB: 'arbitrum',
};
const usdTtlMs = 300_000;
const usdCache = new Map<string, { rate: number; at: number }>();

export async function getUsdRate(token: string): Promise<number> {
  const symbol = token.toUpperCase() === 'CUSD' ? 'cUSD' : token.toUpperCase();
  if (symbol === 'USDC' || symbol === 'USDT' || symbol === 'DAI' || symbol === 'cUSD') return 1;
  const cmcId = cmcAssets[symbol];
  if (cmcId !== undefined) {
    const cached = usdCache.get(symbol);
    if (cached && Date.now() - cached.at < usdTtlMs) return cached.rate;
    if (process.env.COINMARKETCAP_API_KEY) {
      try {
        const response = await fetch(`https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?id=${cmcId}&convert=USD`, { headers: { 'X-CMC_PRO_API_KEY': process.env.COINMARKETCAP_API_KEY }, signal: AbortSignal.timeout(8000) });
        if (response.ok) {
          const json = await response.json() as Record<string, any>;
          const rate = Number(json.data?.[cmcId]?.quote?.USD?.price);
          if (Number.isFinite(rate) && rate > 0) {
            usdCache.set(symbol, { rate, at: Date.now() });
            return rate;
          }
        }
      } catch { /* fall through to stale cache */ }
    }
    return cached?.rate || 0;
  }
  const id = usdIds[symbol] || usdIds[token];
  if (!id) return 0;
  const cached = usdCache.get(symbol);
  if (cached && Date.now() - cached.at < usdTtlMs) return cached.rate;
  try {
    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return cached?.rate || 0;
    const json = await response.json() as Record<string, { usd?: number }>;
    const rate = Number(json[id]?.usd);
    if (Number.isFinite(rate) && rate > 0) {
      usdCache.set(symbol, { rate, at: Date.now() });
      return rate;
    }
  } catch { /* fall through to stale cache */ }
  return cached?.rate || 0;
}
