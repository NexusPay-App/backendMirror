import { botCapabilities, getBotConfig } from '../src/config/botchain';

const originalEnv = { ...process.env };
afterEach(() => { process.env = { ...originalEnv }; });

test('mainnet activation disables testnet even when old testnet flags remain enabled', () => {
  process.env.BOTCHAIN_ENABLED = 'true';
  process.env.BOTCHAIN_TRANSFERS_ENABLED = 'true';
  process.env.BOTCHAIN_TESTNET_ENABLED = 'true';
  process.env.BOTCHAIN_TESTNET_TRANSFERS_ENABLED = 'true';
  expect(getBotConfig('botchain')).toMatchObject({ enabled: true, transfersEnabled: true });
  expect(getBotConfig('botchain-testnet')).toMatchObject({ enabled: false, transfersEnabled: false });
  expect(botCapabilities().filter(network => network.enabled).map(network => network.id)).toEqual(['botchain']);
});

test('isolated development can still enable testnet with mainnet disabled', () => {
  process.env.BOTCHAIN_ENABLED = 'false';
  process.env.BOTCHAIN_TESTNET_ENABLED = 'true';
  expect(getBotConfig('botchain-testnet').enabled).toBe(true);
});

test('BOT mainnet advertises only verified USDT and native BOT assets', () => {
  const tokens = getBotConfig('botchain').tokens;
  expect(Object.keys(tokens).sort()).toEqual(['BOT', 'USDT']);
  expect(tokens.BOT).toMatchObject({ address: null, decimals: 18 });
  expect(tokens.USDT).toMatchObject({ address: '0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C', decimals: 6 });
});
