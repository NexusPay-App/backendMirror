jest.mock('../src/services/auth', () => ({ client: { clientId: 'fixture' } }));
jest.mock('../src/config/env', () => ({ __esModule: true, default: { base: { chainId: 8453 }, arbitrum: { chainId: 42161 } } }));
jest.mock('thirdweb', () => ({
  defineChain: jest.fn(value => typeof value === 'number' ? { id: value } : value),
  getContract: jest.fn(value => value), getRpcClient: jest.fn(() => ({})), readContract: jest.fn(),
  sendTransaction: jest.fn(), waitForReceipt: jest.fn(),
}));
jest.mock('thirdweb/wallets', () => ({ privateKeyToAccount: jest.fn(() => ({ address: '0xowner' })), smartWallet: jest.fn() }));
jest.mock('thirdweb/wallets/smart', () => ({ estimateUserOpGasCost: jest.fn() }));
jest.mock('thirdweb/rpc', () => ({ eth_getBalance: jest.fn() }));
jest.mock('thirdweb/extensions/erc20', () => ({ transfer: jest.fn(() => ({ to: '0xtoken' })), balanceOf: jest.fn() }));
import { readContract, sendTransaction, waitForReceipt } from 'thirdweb';
import { smartWallet } from 'thirdweb/wallets';
import { estimateUserOpGasCost } from 'thirdweb/wallets/smart';
import { eth_getBalance } from 'thirdweb/rpc';
import { balanceOf } from 'thirdweb/extensions/erc20';
import { sendToken } from '../src/services/token';
import { LEGACY_ACCOUNT_FACTORY } from '../src/config/mainnetPayments';
import { evmPaymentError } from '../src/services/evmPaymentErrors';

beforeEach(() => {
  jest.clearAllMocks();
  (readContract as jest.Mock).mockImplementation(({ method }) => Promise.resolve(method.includes('decimals') ? 6 : 'USDC'));
  (smartWallet as jest.Mock).mockReturnValue({ connect: jest.fn().mockResolvedValue({ address: '0xsender' }) });
  (balanceOf as jest.Mock).mockResolvedValue(100000000n);
  (eth_getBalance as jest.Mock).mockResolvedValue(1000000000000000n);
  (estimateUserOpGasCost as jest.Mock).mockResolvedValue({ wei: 100000000000000n, ether: '0.0001' });
  (sendTransaction as jest.Mock).mockResolvedValue({ transactionHash: '0xreceipt' });
  (waitForReceipt as jest.Mock).mockResolvedValue({ status: 'success' });
});

test.each(['base', 'arbitrum'])('%s uses user gas and preserves the existing factory and sender', async chain => {
  await expect(sendToken('0xrecipient', '1', chain, 'fixture-not-a-key', 'USDC', '0xsender')).resolves.toEqual({ transactionHash: '0xreceipt' });
  expect(smartWallet).toHaveBeenCalledWith(expect.objectContaining({ sponsorGas: false, factoryAddress: LEGACY_ACCOUNT_FACTORY }));
  expect(estimateUserOpGasCost).toHaveBeenCalledWith(expect.objectContaining({ smartWalletOptions: expect.objectContaining({ sponsorGas: false }) }));
  expect(sendTransaction).toHaveBeenCalledTimes(1);
});
test('does not send when stablecoins exist but native gas is zero', async () => {
  (eth_getBalance as jest.Mock).mockResolvedValue(0n);
  await expect(sendToken('0xrecipient', '1', 'base', 'fixture-not-a-key', 'USDC', '0xsender')).rejects.toMatchObject({ code: 'INSUFFICIENT_GAS' });
  expect(sendTransaction).not.toHaveBeenCalled();
});
test('checks estimated deployment and execution fees before sending', async () => {
  (estimateUserOpGasCost as jest.Mock).mockResolvedValue({ wei: 2000000000000000n, ether: '0.002' });
  await expect(sendToken('0xrecipient', '1', 'arbitrum', 'fixture-not-a-key', 'USDC', '0xsender')).rejects.toMatchObject({ code: 'INSUFFICIENT_GAS' });
  expect(sendTransaction).not.toHaveBeenCalled();
});
test('rejects a different predicted sender before attempting a payment', async () => {
  await expect(sendToken('0xrecipient', '1', 'base', 'fixture-not-a-key', 'USDC', '0xother')).rejects.toThrow('Signing account does not match');
  expect(sendTransaction).not.toHaveBeenCalled();
});
test('provider errors do not leak signed payloads or secrets', () => {
  const failure = evmPaymentError(new Error('401 Mainnets not enabled; secret-key=secret'), 'Base');
  expect(failure).toMatchObject({ code: 'PAYMENT_PROVIDER_UNAVAILABLE', status: 503 });
  expect(failure.message).not.toContain('secret');
  expect(evmPaymentError(new Error('unexpected provider payload secret'), 'Base').message).not.toContain('secret');
});
