jest.mock('thirdweb', () => ({
  defineChain: jest.fn(value => typeof value === 'number' ? { id: value } : value),
  getRpcClient: jest.fn(), prepareContractCall: jest.fn(options => options),
}));
import { getRpcClient, prepareContractCall } from 'thirdweb';
import { paymentChain, paymentWalletOptions, LEGACY_ACCOUNT_FACTORY } from '../src/config/mainnetPayments';
import { bundlerRead, withBundlerFees } from '../src/services/evmBundler';

const envKeys = ['MAINNET_BUNDLER_PROVIDER', 'ALCHEMY_API_KEY', 'BASE_BUNDLER_URL', 'ARBITRUM_BUNDLER_URL'] as const;
let saved: Record<string, string | undefined>;
const originalFetch = global.fetch;
const client = { clientId: 'fixture' };
beforeEach(() => {
  saved = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  for (const key of envKeys) delete process.env[key];
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ result: '0x64' }) });
  (getRpcClient as jest.Mock).mockReturnValue(jest.fn().mockResolvedValue({ baseFeePerGas: '0x3e8' }));
});
afterEach(() => {
  global.fetch = originalFetch;
  for (const key of envKeys) {
    if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  }
});

test.each([['base', 8453, 'base-mainnet'], ['arbitrum', 42161, 'arb-mainnet']] as const)('%s keeps its factory, uses Alchemy and never enables a paymaster', async (network, id, host) => {
  process.env.MAINNET_BUNDLER_PROVIDER = 'alchemy';
  process.env.ALCHEMY_API_KEY = 'fixture/key';
  const options = await withBundlerFees(paymentWalletOptions(network, paymentChain(network, id)), client);
  expect(options).toMatchObject({ sponsorGas: false, factoryAddress: LEGACY_ACCOUNT_FACTORY, overrides: { bundlerUrl: `https://${host}.g.alchemy.com/v2/fixture%2Fkey` } });
  expect(options.overrides?.paymaster).toBeUndefined();
  expect(options.overrides?.tokenPaymaster).toBeUndefined();
  expect(global.fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ body: expect.stringContaining('rundler_maxPriorityFeePerGas') }));
  const contract = {} as any;
  const transaction = { to: '0xrecipient', value: 5n, data: '0x1234', gas: 100n } as any;
  options.overrides!.execute!(contract, transaction);
  expect(prepareContractCall).toHaveBeenLastCalledWith(expect.objectContaining({
    method: 'function execute(address, uint256, bytes)', params: ['0xrecipient', 5n, '0x1234'],
    gas: 21100n, maxPriorityFeePerGas: 125n, maxFeePerGas: 2125n,
  }));
  options.overrides!.executeBatch!(contract, [transaction]);
  expect(prepareContractCall).toHaveBeenLastCalledWith(expect.objectContaining({
    params: [['0xrecipient'], [5n], ['0x1234']], maxPriorityFeePerGas: 125n, maxFeePerGas: 2125n,
  }));
});
test('an explicitly selected provider with a missing key cannot silently use Thirdweb', () => {
  process.env.MAINNET_BUNDLER_PROVIDER = 'alchemy';
  expect(() => paymentWalletOptions('base', paymentChain('base', 8453))).toThrow('API key is not configured');
});
test('an explicit per-network bundler remains supported without fee or paymaster changes', async () => {
  process.env.BASE_BUNDLER_URL = 'https://bundler.example.test/rpc';
  const options = paymentWalletOptions('base', paymentChain('base', 8453));
  expect(await withBundlerFees(options, client)).toBe(options);
  expect(global.fetch).not.toHaveBeenCalled();
});
test('provider authentication failures are actionable and omit credential-bearing URLs', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401 });
  await expect(bundlerRead('https://base-mainnet.g.alchemy.com/v2/secret-fixture', 'eth_supportedEntryPoints')).rejects.toMatchObject({ code: 'PROVIDER_MAINNET_ACCESS_REQUIRED', status: 503 });
  (global.fetch as jest.Mock).mockRejectedValue(new Error('request to https://base-mainnet.g.alchemy.com/v2/secret-fixture failed'));
  await expect(bundlerRead('https://base-mainnet.g.alchemy.com/v2/secret-fixture', 'eth_chainId')).rejects.toMatchObject({ message: 'The mainnet payment provider is unavailable.' });
});
test('invalid fee responses stop preparation before execution', async () => {
  process.env.MAINNET_BUNDLER_PROVIDER = 'alchemy';
  process.env.ALCHEMY_API_KEY = 'fixture';
  (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, json: async () => ({ result: 'not-a-fee' }) });
  await expect(withBundlerFees(paymentWalletOptions('base', paymentChain('base', 8453)), client)).rejects.toMatchObject({ code: 'PROVIDER_CHECK_FAILED' });
});
