import { getRpcClient, prepareContractCall, type ThirdwebClient } from 'thirdweb';
import type { SmartWalletOptions } from 'thirdweb/wallets';
import { EvmPaymentError } from './evmPaymentErrors';

export function isAlchemyBundler(url?: string) {
  if (!url) return false;
  return ['base-mainnet.g.alchemy.com', 'arb-mainnet.g.alchemy.com'].includes(new URL(url).hostname);
}

// Provider errors can contain the credential-bearing URL. Never return or log them.
export async function bundlerRead(url: string, method: 'eth_chainId' | 'eth_supportedEntryPoints' | 'rundler_maxPriorityFeePerGas') {
  try {
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] }),
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 401 || response.status === 403) throw new EvmPaymentError('PROVIDER_MAINNET_ACCESS_REQUIRED', 'Mainnet provider credentials or access need configuration.', 503);
    const body = await response.json();
    if (!response.ok || body.error || body.result === undefined) throw new Error('Provider request failed');
    return body.result as unknown;
  } catch (error) {
    if (error instanceof EvmPaymentError) throw error;
    throw new EvmPaymentError('PROVIDER_CHECK_FAILED', 'The mainnet payment provider is unavailable.', 503);
  }
}

function hexNumber(value: unknown): bigint {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) throw new EvmPaymentError('PROVIDER_CHECK_FAILED', 'The mainnet fee response is invalid.', 503);
  return BigInt(value);
}

export async function alchemyGasFees(options: SmartWalletOptions, client: ThirdwebClient) {
  const url = options.overrides?.bundlerUrl;
  if (!url || !isAlchemyBundler(url)) throw new Error('Alchemy bundler is not configured');
  const rpc = getRpcClient({ client, chain: options.chain });
  const [priority, block] = await Promise.all([
    bundlerRead(url, 'rundler_maxPriorityFeePerGas'),
    rpc({ method: 'eth_getBlockByNumber', params: ['latest', false] }),
  ]);
  // Use the bundler's priority-fee floor, including account deployment. The
  // explicit values are shared by estimation and submission; no paymaster.
  const maxPriorityFeePerGas = (hexNumber(priority) * 125n + 99n) / 100n;
  const maxFeePerGas = hexNumber(block?.baseFeePerGas) * 2n + maxPriorityFeePerGas;
  return { maxFeePerGas, maxPriorityFeePerGas };
}

export async function withBundlerFees(options: SmartWalletOptions, client: ThirdwebClient): Promise<SmartWalletOptions> {
  if (!isAlchemyBundler(options.overrides?.bundlerUrl)) return options;
  const fees = await alchemyGasFees(options, client);
  return {
    ...options,
    overrides: {
      ...options.overrides,
      // Thirdweb's default execute wrapper discards inner transaction fee fields.
      // Keep the account's existing execute ABI and attach fees to that wrapper.
      execute: (contract, transaction) => prepareContractCall({
        contract, method: 'function execute(address, uint256, bytes)',
        params: [transaction.to || '', transaction.value || 0n, transaction.data || '0x'],
        gas: transaction.gas ? transaction.gas + 21000n : undefined, ...fees,
      }),
      executeBatch: (contract, transactions) => prepareContractCall({
        contract, method: 'function executeBatch(address[], uint256[], bytes[])',
        params: [transactions.map(tx => tx.to || ''), transactions.map(tx => tx.value || 0n), transactions.map(tx => tx.data || '0x')], ...fees,
      }),
    },
  };
}
