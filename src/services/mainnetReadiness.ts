import { getContract, getRpcClient, readContract } from 'thirdweb';
import { eth_getCode } from 'thirdweb/rpc';
import { getUserOpGasFees } from 'thirdweb/wallets/smart';
import { client } from './auth';
import { assertBotInfrastructure } from './botchainWallet';
import { getBotConfig } from '../config/botchain';
import { tokenConfigs } from '../config/tokens';
import { LEGACY_ACCOUNT_FACTORY, paymentChain, paymentWalletOptions, userFundedNetworks, type UserFundedNetwork } from '../config/mainnetPayments';

// No signing keys, account creation or transactions. Coalesce/cap public probes.
let cached: { at: number; promise: ReturnType<typeof inspect> } | undefined;
async function inspect() {
  const networks = await Promise.all((Object.keys(userFundedNetworks) as UserFundedNetwork[]).map(async id => {
    const chain = paymentChain(id, userFundedNetworks[id].id);
    const base = { id, chainId: chain.id, gasMode: 'self-funded', gasToken: 'ETH' };
    try {
      const rpc = getRpcClient({ client, chain });
      const [chainId, code] = await Promise.all([rpc({ method: 'eth_chainId' }), eth_getCode(rpc, { address: LEGACY_ACCOUNT_FACTORY })]);
      if (Number(chainId) !== chain.id || code === '0x') throw new Error('Infrastructure mismatch');
      const token = tokenConfigs[id].USDC!;
      const decimals = await readContract({ contract: getContract({ client, chain, address: token.address }), method: 'function decimals() view returns (uint8)' });
      if (decimals !== token.decimals) throw new Error('Token mismatch');
      await getUserOpGasFees({ options: { client, chain, ...paymentWalletOptions(id, chain).overrides } });
      return { ...base, ready: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      return { ...base, ready: false, reason: /mainnets not enabled|billing|401|403|unauthorized/i.test(message) ? 'PROVIDER_MAINNET_ACCESS_REQUIRED' : 'PROVIDER_CHECK_FAILED' };
    }
  }));
  let botReady = false;
  try { await assertBotInfrastructure('botchain'); botReady = true; } catch { /* Report only a safe status. */ }
  return { checkedAt: new Date().toISOString(), scope: 'Read-only infrastructure checks; no funded transactions tested', networks: [...networks, { id: 'botchain', chainId: 677, gasMode: 'self-funded', gasToken: 'BOT', ready: botReady, enabled: getBotConfig('botchain').enabled, transfers: getBotConfig('botchain').transfersEnabled }] };
}
export function mainnetReadiness() {
  if (!cached || Date.now() - cached.at > 5 * 60 * 1000) cached = { at: Date.now(), promise: inspect() };
  return cached.promise;
}
