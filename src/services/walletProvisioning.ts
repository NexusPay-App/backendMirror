import { Wallet } from 'ethers';
import { smartWallet } from 'thirdweb/wallets';
import { privateKeyToAccount } from './signingBoundary';
import { client } from './auth';
import { paymentChain, paymentWalletOptions } from '../config/mainnetPayments';
import { chains } from '../config/chains';

/**
 * Single source of truth for smart-account address derivation.
 *
 * Every writer of a (privateKey, walletAddress) pair must go through these
 * helpers so the stored address always equals the CREATE2 prediction that
 * sendToken performs at spend time. The options passed here mirror
 * paymentWalletOptions exactly (LEGACY v0.6 factory, default salt).
 */

export type ChainName = keyof typeof chains;

const DEFAULT_DERIVATION_CHAIN: ChainName = 'arbitrum';

const PUBLIC_RPC_FALLBACKS: Record<number, string[]> = {
  42161: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum-one-rpc.publicnode.com'],
  8453: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com'],
  1: ['https://ethereum-rpc.publicnode.com'],
};

function rpcUrls(chain: { id: number; rpc?: unknown }): string[] {
  const urls: string[] = [];
  const key = process.env.ALCHEMY_API_KEY?.trim();
  if (key) {
    const host = chain.id === 8453 ? 'base-mainnet' : chain.id === 42161 ? 'arb-mainnet' : chain.id === 1 ? 'eth-mainnet' : null;
    if (host) urls.push(`https://${host}.g.alchemy.com/v2/${key}`);
  }
  const raw = chain.rpc;
  if (Array.isArray(raw)) urls.push(...raw.filter((entry): entry is string => typeof entry === 'string' && !!entry));
  else if (typeof raw === 'string' && raw) urls.push(raw);
  urls.push(...(PUBLIC_RPC_FALLBACKS[chain.id] || []));
  return [...new Set(urls)];
}

async function rawRpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(8000),
  });
  const body = await response.json().catch(() => null) as { result?: unknown; error?: { message?: string } } | null;
  if (!response.ok || !body) throw new Error(`rpc http ${response.status}`);
  if (body.error) throw new Error(body.error.message || 'rpc error');
  return body.result;
}

async function rpcWithFallbacks(chain: { id: number; rpc?: unknown }, method: string, params: unknown[]): Promise<unknown> {
  let lastError: Error | undefined;
  for (const url of rpcUrls(chain)) {
    try { return await rawRpc(url, method, params); } catch (error) { lastError = error as Error; }
  }
  throw lastError || new Error('No RPC endpoint available');
}

function derivationChain(chainName: string) {
  const entry = chains[chainName as ChainName];
  if (!entry) throw new Error(`Unsupported chain for wallet derivation: ${chainName}`);
  return { chainName: chainName as ChainName, chain: paymentChain(chainName, entry.id), fallbackId: entry.id };
}

/**
 * Canonical smart-account address for a personal key. Uses the same wallet
 * options as sendToken so prediction at write time matches prediction at spend
 * time (LEGACY v0.6 factory, default salt, no accountAddress pin).
 */
export async function deriveSmartWalletAddress(
  privateKey: string,
  chainName: string = DEFAULT_DERIVATION_CHAIN,
): Promise<{ address: string; personalEoa: string }> {
  const { chain } = derivationChain(chainName);
  const options = paymentWalletOptions(chainName, chain);
  const personalAccount = privateKeyToAccount({ client, privateKey });
  const account = await smartWallet(options).connect({ client, personalAccount });
  return { address: account.address, personalEoa: personalAccount.address };
}

/**
 * Write-time binding check: fails fast when an address/key pair would be
 * rejected by sendToken later (ACCOUNT_MISMATCH).
 */
export async function verifyWalletBinding(
  privateKey: string | undefined,
  expectedAddress: string | undefined,
  chainName: string = DEFAULT_DERIVATION_CHAIN,
): Promise<{ ok: boolean; derived?: string; personalEoa?: string; reason?: string }> {
  if (!privateKey) return { ok: false, reason: 'private key missing' };
  if (!expectedAddress) return { ok: false, reason: 'wallet address missing' };
  try {
    const { address, personalEoa } = await deriveSmartWalletAddress(privateKey, chainName);
    const ok = address.toLowerCase() === expectedAddress.toLowerCase();
    return ok
      ? { ok, derived: address, personalEoa }
      : { ok, derived: address, personalEoa, reason: 'derived address does not match stored address' };
  } catch (error) {
    return { ok: false, reason: String((error as Error)?.message || error) };
  }
}

/**
 * Generate a brand-new personal key and its canonical smart-account address,
 * verified before returning: deterministic re-derivation must agree and the
 * address must have no contract code on the derivation chain.
 */
export async function createVerifiedSmartWallet(
  chainName: string = DEFAULT_DERIVATION_CHAIN,
): Promise<{ privateKey: string; walletAddress: string; personalEoa: string }> {
  const { chain } = derivationChain(chainName);
  let lastDetail = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const privateKey = Wallet.createRandom().privateKey;
    try {
      const first = await deriveSmartWalletAddress(privateKey, chainName);
      if (!/^0x[0-9a-fA-F]{40}$/.test(first.address)) {
        lastDetail = 'derived address is not a valid 20-byte address';
        continue;
      }
      const second = await deriveSmartWalletAddress(privateKey, chainName);
      if (second.address.toLowerCase() !== first.address.toLowerCase()) {
        lastDetail = 'derivation is not deterministic';
        continue;
      }
      const code = await rpcWithFallbacks(chain, 'eth_getCode', [first.address, 'latest']);
      if (typeof code !== 'string') {
        lastDetail = 'eth_getCode returned a non-string result';
        continue;
      }
      if (code.length > 2) {
        lastDetail = 'contract code already exists at the fresh address';
        continue;
      }
      return { privateKey, walletAddress: first.address, personalEoa: first.personalEoa };
    } catch (error) {
      lastDetail = String((error as Error)?.message || error);
    }
  }
  throw new Error(`Verified smart wallet creation failed after retries: ${lastDetail}`);
}
