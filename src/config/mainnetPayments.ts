import { defineChain } from 'thirdweb';

// Preserve the factory used by existing NexusPay accounts. Changing it changes
// addresses everywhere (arb/base/eth/botchain share this derivation).
export const LEGACY_ACCOUNT_FACTORY =
  process.env.LEGACY_ACCOUNT_FACTORY?.trim() || '0x85e23b94e7F5E9cC1fF78BCe78cfb15B81f0DF00';
export const userFundedNetworks = {
  base: { id: 8453, name: 'Base', rpc: 'https://mainnet.base.org', prefix: 'BASE' },
  arbitrum: { id: 42161, name: 'Arbitrum', rpc: 'https://arb1.arbitrum.io/rpc', prefix: 'ARBITRUM' },
  ethereum: { id: 1, name: 'Ethereum', rpc: 'https://ethereum-rpc.publicnode.com', prefix: 'ETHEREUM' },
} as const;
export type UserFundedNetwork = keyof typeof userFundedNetworks;
export function isUserFundedNetwork(network: string): network is UserFundedNetwork {
  return Object.hasOwn(userFundedNetworks, network);
}
export function isUserFundedChain(chainId: number) { return chainId === 8453 || chainId === 42161 || chainId === 1; }
export function paymentChain(network: string, fallbackId: number) {
  if (!isUserFundedNetwork(network)) return defineChain(fallbackId);
  const config = userFundedNetworks[network];
  return defineChain({ id: config.id, name: config.name, rpc: process.env[`${config.prefix}_RPC_URL`] || config.rpc, nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 } });
}
/**
 * Bundler endpoint for sendable networks (Ethereum, Base, Arbitrum only).
 * Every other chain is dormant: no bundler is offered and send paths must
 * reject them up front instead of falling through to the dead thirdweb
 * default bundler (bundler.thirdweb.com no longer resolves).
 */
export function bundlerUrlFor(network: string): string | undefined {
  if (!isUserFundedNetwork(network)) return undefined;
  const configured = process.env[`${userFundedNetworks[network].prefix}_BUNDLER_URL`];
  if (configured) return configured;
  if (process.env.MAINNET_BUNDLER_PROVIDER !== 'alchemy') return undefined;
  const key = process.env.ALCHEMY_API_KEY?.trim();
  if (!key) throw new Error('Mainnet bundler API key is not configured');
  const host = network === 'base' ? 'base-mainnet' : network === 'arbitrum' ? 'arb-mainnet' : 'eth-mainnet';
  return `https://${host}.g.alchemy.com/v2/${encodeURIComponent(key)}`;
}

export function paymentWalletOptions(network: string, chain: ReturnType<typeof defineChain>) {
  const bundlerUrl = bundlerUrlFor(network);
  // Users pay their own gas everywhere: never route through the paymaster.
  return { chain, sponsorGas: false, factoryAddress: LEGACY_ACCOUNT_FACTORY, ...(bundlerUrl ? { overrides: { bundlerUrl } } : {}) };
}
