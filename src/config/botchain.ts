import { defineChain } from 'thirdweb';
export type BotNetwork = 'botchain' | 'botchain-testnet';
export type BotToken = 'BOT' | 'WBOT' | 'USDT';
export const BOT_ENTRY_POINT = '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as const;
export const BOT_FACTORY = '0xBC88d6012b3bf8426C2851d3798cEB5257658332' as const;
export const BOT_SALT = 0n;
export const botNetworks = {
  botchain: { id: 677, name: 'BOT Chain', rpc: 'https://rpc.botchain.ai', bundler: 'https://bundler.botchain.ai/rpc', explorer: 'https://scan.botchain.ai', env: 'BOTCHAIN', testnet: false, usdt: '0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C' },
  'botchain-testnet': { id: 968, name: 'BOT Chain Testnet', rpc: 'https://rpc.bohr.life', bundler: 'https://bundler.bohr.life/rpc', explorer: 'https://scan.bohr.life', env: 'BOTCHAIN_TESTNET', testnet: true, usdt: '0x75edC9335175Fc0552D51D48439F229c10420fe3' },
} as const;
export function isBotNetwork(value: string): value is BotNetwork { return Object.hasOwn(botNetworks, value); }
export function getBotConfig(network: string) {
  if (!isBotNetwork(network)) throw new Error('Unsupported BOT network');
  const config = botNetworks[network];
  const rpc = process.env[`${config.env}_RPC_URL`] || config.rpc;
  const enabled = process.env[`${config.env}_ENABLED`] === 'true';
  return {
    ...config, key: network, rpc, enabled,
    transfersEnabled: enabled && process.env[`${config.env}_TRANSFERS_ENABLED`] === 'true',
    depositIndexingEnabled: enabled && process.env[`${config.env}_DEPOSIT_INDEXING_ENABLED`] === 'true',
    bundler: process.env[`${config.env}_BUNDLER_URL`] || config.bundler,
    chain: defineChain({ id: config.id, name: config.name, rpc, testnet: config.testnet || undefined, nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 }, blockExplorers: [{ name: 'BOT Explorer', url: config.explorer }] }),
    tokens: {
      BOT: { symbol: 'BOT', decimals: 18, address: null },
      WBOT: { symbol: 'WBOT', decimals: 18, address: '0xD5452816194a3784dBa983426cCe7c122F4abd30' },
      USDT: { symbol: 'USDT', decimals: 6, address: config.usdt },
    } as const,
  };
}
export function botCapabilities() {
  return Object.keys(botNetworks).map(key => {
    const n = getBotConfig(key);
    return { id: n.key, name: n.name, chainId: n.id, testnet: n.testnet, enabled: n.enabled, explorer: n.explorer, tokens: Object.values(n.tokens), transfers: n.transfersEnabled, merchantPayments: n.transfersEnabled, deposits: n.depositIndexingEnabled, gasMode: 'self-funded', mpesa: false, swaps: false, bridge: false };
  });
}
