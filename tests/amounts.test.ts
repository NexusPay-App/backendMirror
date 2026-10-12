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
    expect(getTokenConfig('base', 'USDT')).toBeUndefined();
  });
});
