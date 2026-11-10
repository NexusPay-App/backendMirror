import { getRateQuote, getUsdRate } from '../src/services/rates';

const cmcQuote = {
  ok: true,
  json: async () => ({
    data: { 40873: { id: 40873, name: 'BOT Chain', symbol: 'BOT', quote: { USD: { price: 0.042 }, KES: { price: 5.46 } } } },
  }),
};

describe('BOT pricing via CoinMarketCap', () => {
  const originalKey = process.env.COINMARKETCAP_API_KEY;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.COINMARKETCAP_API_KEY = 'cmc-test-key';
    global.fetch = jest.fn() as any;
  });

  afterEach(() => {
    process.env.COINMARKETCAP_API_KEY = originalKey;
    global.fetch = originalFetch;
  });

  it('reports no USD price while the provider rejects the key', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    expect(await getUsdRate('BOT')).toBe(0);
  });

  it('prices BOT from CMC currency id 40873 in USD', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(cmcQuote);
    expect(await getUsdRate('BOT')).toBeCloseTo(0.042);
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('id=40873');
    expect(url).toContain('convert=USD');
    expect(url).not.toContain('symbol=BOT');
  });

  it('quotes BOT in KES through getRateQuote', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(cmcQuote);
    const quote = await getRateQuote('BOT');
    expect(quote.rate).toBeCloseTo(5.46);
    expect(quote.source).toBe('coinmarketcap');
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('id=40873');
    expect(url).toContain('convert=KES');
    expect(url).not.toContain('symbol=BOT');
  });

  it('keeps unsupported assets rejected', async () => {
    await expect(getRateQuote('NOTATOKEN')).rejects.toThrow('Unsupported quote asset');
  });
});
