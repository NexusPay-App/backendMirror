import { parseAmount, formatAmount } from '../src/utils/amounts';
import { getTokenConfig } from '../src/config/tokens';
describe('payment amounts', () => {
  test('preserves units beyond JavaScript integer precision', () => {
    expect(parseAmount('9007199254740993.123456', 6)).toBe(9007199254740993123456n);
    expect(parseAmount('0.000000000000000001', 18)).toBe(1n);
    expect(formatAmount(9007199254740993123456n, 6)).toBe('9007199254740993.123456');
  });
  test.each(['1.0000001', '1e3', '-1', '0', 'NaN', '1abc', ' 1', '01'])('rejects invalid or overprecise USDT amount %s', amount => expect(() => parseAmount(amount, 6)).toThrow());
  test('routes distinct assets to distinct contracts and honors 18 decimals', () => {
    expect(getTokenConfig('celo', 'USDC')?.address).toBe('0xcebA9300f2b948710d2653dD7B07f33A8B32118C');
    expect(getTokenConfig('celo', 'USDT')?.address).toBe('0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e');
    expect(getTokenConfig('bnb', 'USDT')?.decimals).toBe(18);
    expect(getTokenConfig('base', 'USDT')?.address).toBe('0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2');
    expect(getTokenConfig('base', 'USDT')?.decimals).toBe(6);
    expect(getTokenConfig('ethereum', 'USDC')?.address).toBe('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
    expect(getTokenConfig('ethereum', 'USDT')?.address).toBe('0xdAC17F958D2ee523a2206206994597C13D831ec7');
    expect(getTokenConfig('ethereum', 'WBTC')?.decimals).toBe(8);
  });
});
