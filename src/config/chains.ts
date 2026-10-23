import { isUserFundedNetwork } from './mainnetPayments';
import { tokenConfigs } from './tokens';
import type { Chain } from '../types/token';
export const chains: Record<Chain, { id: number; name: string; rpc: string; explorer: string }> = {
  arbitrum: { id: 42161, name: 'Arbitrum', rpc: 'https://arb1.arbitrum.io/rpc', explorer: 'https://arbiscan.io' },
  celo: { id: 42220, name: 'Celo', rpc: 'https://forno.celo.org', explorer: 'https://celoscan.io' },
  base: { id: 8453, name: 'Base', rpc: 'https://mainnet.base.org', explorer: 'https://basescan.org' },
  optimism: { id: 10, name: 'Optimism', rpc: 'https://mainnet.optimism.io', explorer: 'https://optimistic.etherscan.io' },
  polygon: { id: 137, name: 'Polygon', rpc: 'https://polygon-bor-rpc.publicnode.com', explorer: 'https://polygonscan.com' },
  avalanche: { id: 43114, name: 'Avalanche', rpc: 'https://api.avax.network/ext/bc/C/rpc', explorer: 'https://snowtrace.io' },
  bnb: { id: 56, name: 'BNB Chain', rpc: 'https://bsc-dataseed.binance.org', explorer: 'https://bscscan.com' },
  scroll: { id: 534352, name: 'Scroll', rpc: 'https://rpc.scroll.io', explorer: 'https://scrollscan.com' },
  gnosis: { id: 100, name: 'Gnosis', rpc: 'https://rpc.gnosischain.com', explorer: 'https://gnosisscan.io' },
  fantom: { id: 250, name: 'Fantom', rpc: 'https://rpc.ftm.tools', explorer: 'https://ftmscan.com' },
  moonbeam: { id: 1284, name: 'Moonbeam', rpc: 'https://rpc.api.moonbeam.network', explorer: 'https://moonbeam.moonscan.io' },
  fuse: { id: 122, name: 'Fuse', rpc: 'https://rpc.fuse.io', explorer: 'https://explorer.fuse.io' },
  aurora: { id: 1313161554, name: 'Aurora', rpc: 'https://mainnet.aurora.dev', explorer: 'https://aurorascan.dev' },
  lisk: { id: 1135, name: 'Lisk', rpc: 'https://rpc.api.lisk.com', explorer: 'https://blockscout.lisk.com' },
  somnia: { id: 5031, name: 'Somnia', rpc: 'https://api.infra.mainnet.somnia.network', explorer: 'https://explorer.somnia.network' },
};
export const paymentChains = Object.keys(chains).filter(key => Object.values(tokenConfigs[key as Chain]).some(t => /^0x[0-9a-f]{40}$/i.test(t.address))) as Chain[];
export function paymentCapabilities() {
  return paymentChains.map(id => ({ id, name: chains[id].name, chainId: chains[id].id, testnet: false, gasMode: isUserFundedNetwork(id) ? 'self-funded' : 'sponsored', gasToken: isUserFundedNetwork(id) ? 'ETH' : undefined, explorer: chains[id].explorer, tokens: Object.values(tokenConfigs[id]).filter(t => /^0x[0-9a-f]{40}$/i.test(t.address)) }));
}
