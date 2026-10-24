import { defineChain } from 'thirdweb';

// Preserve the factory used by existing NexusPay accounts. Changing it changes addresses.
export const LEGACY_ACCOUNT_FACTORY = '0x85e23b94e7F5E9cC1fF78BCe78cfb15B81f0DF00';
export const userFundedNetworks = {
  base: { id: 8453, name: 'Base', rpc: 'https://mainnet.base.org', prefix: 'BASE' },
  arbitrum: { id: 42161, name: 'Arbitrum', rpc: 'https://arb1.arbitrum.io/rpc', prefix: 'ARBITRUM' },
} as const;
export type UserFundedNetwork = keyof typeof userFundedNetworks;
export function isUserFundedNetwork(network: string): network is UserFundedNetwork {
  return Object.hasOwn(userFundedNetworks, network);
}
export function isUserFundedChain(chainId: number) { return chainId === 8453 || chainId === 42161; }
export function paymentChain(network: string, fallbackId: number) {
  if (!isUserFundedNetwork(network)) return defineChain(fallbackId);
  const config = userFundedNetworks[network];
  return defineChain({ id: config.id, name: config.name, rpc: process.env[`${config.prefix}_RPC_URL`] || config.rpc, nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 } });
}
export function paymentWalletOptions(network: string, chain: ReturnType<typeof defineChain>) {
  let bundlerUrl = isUserFundedNetwork(network) ? process.env[`${userFundedNetworks[network].prefix}_BUNDLER_URL`] : undefined;
  if (isUserFundedNetwork(network) && !bundlerUrl && process.env.MAINNET_BUNDLER_PROVIDER === 'alchemy') {
    const key = process.env.ALCHEMY_API_KEY?.trim();
    if (!key) throw new Error('Mainnet bundler API key is not configured');
    const host = network === 'base' ? 'base-mainnet' : 'arb-mainnet';
    bundlerUrl = `https://${host}.g.alchemy.com/v2/${encodeURIComponent(key)}`;
  }
  return { chain, sponsorGas: !isUserFundedChain(chain.id), factoryAddress: LEGACY_ACCOUNT_FACTORY, ...(bundlerUrl ? { overrides: { bundlerUrl } } : {}) };
}
