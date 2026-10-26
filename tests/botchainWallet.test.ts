jest.mock('../src/services/auth', () => ({ client: {} }));
jest.mock('../src/services/botchainRpc', () => ({ botRpc: jest.fn() }));
jest.mock('thirdweb', () => ({
  defineChain: (chain: unknown) => chain,
  getContract: (contract: unknown) => contract,
  prepareContractCall: (call: unknown) => call,
  readContract: jest.fn(),
}));
jest.mock('thirdweb/wallets', () => ({ privateKeyToAccount: () => ({ address: '0x1111111111111111111111111111111111111111' }) }));
jest.mock('thirdweb/wallets/smart', () => ({ createUnsignedUserOp: jest.fn(), signUserOp: jest.fn() }));
jest.mock('viem/account-abstraction', () => ({ getUserOperationHash: () => `0x${'a'.repeat(64)}` }));
import { readContract } from 'thirdweb';
import { createUnsignedUserOp, signUserOp } from 'thirdweb/wallets/smart';
import { botRpc } from '../src/services/botchainRpc';
import { prepareBotTransfer } from '../src/services/botchainWallet';
import { BOT_ENTRY_POINT } from '../src/config/botchain';

const sender = '0x2222222222222222222222222222222222222222';
const recipient = '0x3333333333333333333333333333333333333333';
let balance: bigint;
let deposit: bigint;
const env = { ...process.env };
beforeEach(() => {
  process.env.BOTCHAIN_ENABLED = 'true';
  process.env.BOTCHAIN_TRANSFERS_ENABLED = 'true';
  balance = 200n;
  deposit = 0n;
  (botRpc as jest.Mock).mockImplementation(async (_url, method) => {
    if (method === 'eth_chainId') return '0x2a5';
    if (method === 'eth_supportedEntryPoints') return [BOT_ENTRY_POINT];
    if (method === 'eth_getCode') return '0x01';
    if (method === 'eth_getBalance') return `0x${balance.toString(16)}`;
    if (method === 'skandha_getGasPrice') return { maxFeePerGas: '0x2', maxPriorityFeePerGas: '0x1' };
    throw new Error(`Unexpected RPC method ${method}`);
  });
  (readContract as jest.Mock).mockImplementation(async ({ contract, method }) => {
    if (method.includes('getAddress')) return sender;
    if (method.includes('decimals')) return 6;
    if (method.includes('balanceOf')) return contract.address === BOT_ENTRY_POINT ? deposit : 1000000n;
    throw new Error(`Unexpected contract method ${method}`);
  });
  (createUnsignedUserOp as jest.Mock).mockResolvedValue({ sender, nonce: 0n, callData: '0x', callGasLimit: 10n, verificationGasLimit: 10n, preVerificationGas: 10n, maxFeePerGas: 2n, maxPriorityFeePerGas: 1n, factoryData: '0x' });
  (signUserOp as jest.Mock).mockImplementation(async ({ userOp }) => ({ ...userOp, signature: '0x1234' }));
});
afterEach(() => { process.env = { ...env }; });

test('rejects a balance that covers the original estimate but not verification headroom', async () => {
  balance = 80n;
  await expect(prepareBotTransfer('botchain', 'fixture-key', sender, recipient, 'USDT', '1')).rejects.toMatchObject({ code: 'INSUFFICIENT_GAS' });
  expect(signUserOp).not.toHaveBeenCalled();
});

test('reserves the native transfer amount in addition to the maximum fee', async () => {
  balance = 105n;
  await expect(prepareBotTransfer('botchain', 'fixture-key', sender, recipient, 'BOT', '0.000000000000000010')).rejects.toMatchObject({ code: 'INSUFFICIENT_GAS' });
  expect(signUserOp).not.toHaveBeenCalled();
});

test('accounts for an existing EntryPoint deposit and prepares without broadcasting', async () => {
  balance = 90n;
  deposit = 20n;
  const prepared = await prepareBotTransfer('botchain', 'fixture-key', sender, recipient, 'USDT', '1');
  expect(prepared.userOpHash).toMatch(/^0x[a-f0-9]{64}$/);
  expect(createUnsignedUserOp).toHaveBeenCalledWith(expect.objectContaining({ sponsorGas: false, waitForDeployment: false }));
  expect(signUserOp).toHaveBeenCalledWith(expect.objectContaining({ userOp: expect.objectContaining({ verificationGasLimit: 30n }) }));
  expect((botRpc as jest.Mock).mock.calls.some(call => call[1] === 'eth_sendUserOperation')).toBe(false);
});

test('a preparation retry after insufficient gas can succeed once funded', async () => {
  balance = 80n;
  await expect(prepareBotTransfer('botchain', 'fixture-key', sender, recipient, 'USDT', '1')).rejects.toMatchObject({ code: 'INSUFFICIENT_GAS' });
  balance = 200n;
  await expect(prepareBotTransfer('botchain', 'fixture-key', sender, recipient, 'USDT', '1')).resolves.toHaveProperty('userOpHash');
});
