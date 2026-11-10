import { getTokenConfig as lookupToken } from '../config/tokens';
import { parseAmount } from '../utils/amounts';
import { client } from './auth';
import { smartWallet } from 'thirdweb/wallets';
import { privateKeyToAccount } from './signingBoundary';
import { defineChain, getContract, prepareTransaction, sendTransaction, waitForReceipt, readContract } from "thirdweb";
import { transfer, balanceOf } from "thirdweb/extensions/erc20";
import config from "../config/env";
import { keccak256, toHex } from 'viem';
import { eth_getBalance } from 'thirdweb/rpc';
import { getRpcClient } from 'thirdweb';
import { estimateUserOpGasCost } from 'thirdweb/wallets/smart';
import { paymentChain, paymentWalletOptions, isUserFundedNetwork } from '../config/mainnetPayments';
import { EvmPaymentError } from './evmPaymentErrors';
import { withBundlerFees } from './evmBundler';
import { createVerifiedSmartWallet, deriveSmartWalletAddress } from './walletProvisioning';

export type { Chain, TokenSymbol } from '../types/token';
import type { Chain, TokenSymbol } from '../types/token';


export interface TokenTransferEvent {
    blockNumber: string;
    timeStamp: string;
    hash: string;
    nonce: string;
    blockHash: string;
    from: string;
    contractAddress: string;
    to: string;
    value: string;
    tokenName: string;
    tokenSymbol: string;
    tokenDecimal: string;
    transactionIndex: string;
    gas: string;
    gasPrice: string;
    gasUsed: string;
    cumulativeGasUsed: string;
    input: string;
    confirmations: string;
}

interface TokenConfig {
  address: string;
  decimals: number;
}

interface ChainConfig {
  [key: string]: TokenConfig;
}

export const getTokenConfig = (chain: Chain, token: TokenSymbol): TokenConfig | null => lookupToken(chain, token) || null;

// Removed explicit FACTORY_ADDRESS; using Thirdweb's default factory
// export const FACTORY_ADDRESS = "0x9B4fA2A0D77fB3B1a65e1282e26FDFA8bB5f8FDe";

export function calculateTransactionFee(amount: number): number {
    if (amount <= 1) return 0;
    if (amount <= 5) return 0.05;
    if (amount <= 10) return 0.1;
    if (amount <= 15) return 0.2;
    if (amount <= 25) return 0.3;
    if (amount <= 35) return 0.45;
    if (amount <= 50) return 0.5;
    if (amount <= 75) return 0.68;
    if (amount <= 100) return 0.79;
    if (amount <= 150) return 0.88;
    return 0.95;
}

const OWNER_CALL_DATA = '0x8da5cb5b'; // owner()
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Public fallbacks when the primary RPC (often a rate-limited key) fails. */
const PUBLIC_RPC_FALLBACKS: Record<number, string[]> = {
  42161: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum-one-rpc.publicnode.com'],
  8453: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com'],
  1: ['https://ethereum-rpc.publicnode.com'],
};

/** RPC URLs for owner reads: Alchemy first, then configured and public fallbacks. */
function chainRpcUrls(chain: { id: number; rpc?: unknown }): string[] {
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

async function rawRpcWithFallbacks(chain: { id: number; rpc?: unknown }, method: string, params: unknown[]): Promise<unknown> {
  let lastError: Error | undefined;
  for (const url of chainRpcUrls(chain)) {
    try { return await rawRpc(url, method, params); } catch (error) { lastError = error as Error; }
  }
  throw lastError || new Error('No RPC endpoint available');
}

interface OwnerProbe {
  owner: string | null;
  hasCode: boolean | null; // null when the code check itself failed
  source: string;
  detail?: string;
}

/**
 * Owner/admin of a stored smart-account address. Thirdweb reads retry transient
 * failures; on rate limits or reverts we fall back to direct JSON-RPC
 * (Alchemy first) so a 429 never masquerades as "owner unreadable".
 */
async function readAccountOwnerDetailed(chain: ReturnType<typeof paymentChain>, address: string): Promise<OwnerProbe> {
  const contract = getContract({ client, chain, address: address as `0x${string}` });
  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const owner = await readContract({ contract, method: 'function owner() view returns (address)' });
      if (owner) return { owner: String(owner), hasCode: true, source: 'thirdweb-owner' };
    } catch (error) {
      lastError = String((error as Error)?.message || error);
      if (/revert|zero data/i.test(lastError)) break;
      if (attempt < 2) await sleep(250 * (attempt + 1));
    }
  }
  try {
    const admins = await readContract({ contract, method: 'function getAdmins() view returns (address[])' });
    if (Array.isArray(admins) && admins[0]) return { owner: String(admins[0]), hasCode: true, source: 'thirdweb-getAdmins' };
  } catch (error) {
    lastError = `${lastError} | getAdmins: ${String((error as Error)?.message || error)}`;
  }

  let hasCode: boolean | null = null;
  try {
    const code = await rawRpcWithFallbacks(chain, 'eth_getCode', [address, 'latest']);
    hasCode = typeof code === 'string' && code.length > 2;
  } catch (error) {
    lastError = `${lastError} | getCode: ${String((error as Error)?.message || error)}`;
  }
  if (hasCode === false) {
    return { owner: null, hasCode: false, source: 'raw-rpc', detail: 'no contract code at stored sender address' };
  }

  try {
    const result = await rawRpcWithFallbacks(chain, 'eth_call', [{ to: address, data: OWNER_CALL_DATA }, 'latest']);
    if (typeof result === 'string' && result.length >= 66) {
      return { owner: `0x${result.slice(-40)}`, hasCode: true, source: 'raw-rpc-owner' };
    }
    return { owner: null, hasCode, source: 'raw-rpc-owner', detail: `owner() empty result${lastError ? `; ${lastError}` : ''}` };
  } catch (error) {
    lastError = `${lastError} | eth_call owner: ${String((error as Error)?.message || error)}`;
  }
  return { owner: null, hasCode, source: 'unreadable', detail: lastError || 'unknown' };
}

export async function sendToken(
    recipientAddress: string,
    amount: number | string,
    chainName: string = 'celo',
    pk: string,
    tokenSymbol: TokenSymbol = 'USDC',
    expectedSender?: string,
): Promise<{ transactionHash: string }> {
    const token = getTokenConfig(chainName as Chain, tokenSymbol);
    if (!token) throw new Error(`Token ${tokenSymbol} is not supported on ${chainName}`);
    if (!config[chainName]?.chainId) throw new Error('Unsupported chain');
    const units = parseAmount(amount, token.decimals);
    const chain = paymentChain(chainName, config[chainName].chainId);
    const isNative = token.address === 'native';
    let contract: ReturnType<typeof getContract> | undefined;
    if (!isNative) {
      contract = getContract({ client, chain, address: token.address as `0x${string}` });
      const [decimals, symbol] = await Promise.all([
        readContract({ contract, method: 'function decimals() view returns (uint8)' }),
        readContract({ contract, method: 'function symbol() view returns (string)' }),
      ]);
      if (decimals !== token.decimals || symbol !== tokenSymbol) throw new Error('Configured token does not match on-chain metadata');
    } else if (token.decimals !== 18) {
      throw new Error('Native transfers require 18 decimals');
    }
    const personalAccount = privateKeyToAccount({ client, privateKey: pk });
    // Stored walletAddress is authoritative. Thirdweb CREATE2 prediction can
    // disagree with accounts deployed under an older factory/salt; accept the
    // stored address only when this key is the on-chain owner, then pin
    // overrides.accountAddress so userOps target the real account.
    const baseOptions = paymentWalletOptions(chainName, chain);
    // Dormant chains have no bundler: reject before any wallet connection so
    // the call never falls through to the dead thirdweb default bundler.
    if (!baseOptions.overrides?.bundlerUrl) throw new EvmPaymentError('TRANSFERS_UNAVAILABLE', 'Sending on this network is currently unavailable.', 503);
    let walletOptions = await withBundlerFees(baseOptions, client);
    if (expectedSender) {
      const predicted = (await smartWallet(walletOptions).connect({ client, personalAccount })).address;
      if (predicted.toLowerCase() !== expectedSender.toLowerCase()) {
        const probe = await readAccountOwnerDetailed(chain, expectedSender);
        console.warn('[sendToken] predicted sender mismatch', {
          chain: chainName,
          token: tokenSymbol,
          expectedSender,
          predicted,
          personalAccount: personalAccount.address,
          owner: probe.owner,
          hasCode: probe.hasCode,
          source: probe.source,
          detail: probe.detail,
        });
        if (!probe.owner || probe.owner.toLowerCase() !== personalAccount.address.toLowerCase()) {
          throw new Error('Signing account does not match the stored sender wallet');
        }
        console.info('[sendToken] pinning overrides.accountAddress to stored sender', { expectedSender, source: probe.source });
        walletOptions = await withBundlerFees({
          ...baseOptions,
          overrides: { ...baseOptions.overrides, accountAddress: expectedSender },
        }, client);
      }
    }
    const wallet = smartWallet(walletOptions);
    const account = await wallet.connect({ client, personalAccount });
    if (expectedSender && account.address.toLowerCase() !== expectedSender.toLowerCase()) throw new Error('Signing account does not match the stored sender wallet');
    const transaction = isNative
      ? prepareTransaction({ to: recipientAddress, value: units, chain, client })
      : transfer({ contract: contract!, to: recipientAddress, amountWei: units });
    if (isUserFundedNetwork(chainName)) {
      const nativeBalance = await eth_getBalance(getRpcClient({ client, chain }), { address: account.address as `0x${string}` });
      if (nativeBalance === 0n) throw new EvmPaymentError('INSUFFICIENT_GAS', `Add ETH on ${chain.name} to your NexusPay wallet to pay the network fee. USDC and USDT cannot pay this fee.`);
      // Includes the initial smart-account deployment and EntryPoint overhead.
      const fee = await estimateUserOpGasCost({ transactions: [transaction], adminAccount: personalAccount, client, smartWalletOptions: walletOptions });
      const required = isNative ? units + fee.wei : fee.wei;
      if (nativeBalance < required) {
        if (isNative) throw new EvmPaymentError('INSUFFICIENT_GAS', `Your wallet needs approximately ${fee.ether} ETH on ${chain.name} for gas on top of the amount sent. Add ETH to the address shown on Receive.`);
        throw new EvmPaymentError('INSUFFICIENT_GAS', `Your wallet needs approximately ${fee.ether} ETH on ${chain.name} for this payment. Add ETH to the address shown on Receive.`);
      }
      if (!isNative) {
        const available = await balanceOf({ contract: contract!, address: account.address as `0x${string}` });
        if (available < units) throw new Error('Insufficient token balance');
      }
    } else if (isNative) {
      const nativeBalance = await eth_getBalance(getRpcClient({ client, chain }), { address: account.address as `0x${string}` });
      if (nativeBalance < units) throw new Error('Insufficient token balance');
    } else {
      const available = await balanceOf({ contract: contract!, address: account.address as `0x${string}` });
      if (available < units) throw new Error('Insufficient token balance');
    }
    const sent = await sendTransaction({ account, transaction });
    const receipt = await waitForReceipt(sent);
    if (receipt.status !== 'success') throw new Error('Token transfer reverted');
    // No EOA fallback: sponsorship failure must never change the source of funds.
    return { transactionHash: sent.transactionHash };
}

export async function generateUnifiedWallet(phoneNumber: string): Promise<{ address: string, privateKey: string }> {
    // Canonical derivation + write-time verification (no code at address,
    // deterministic re-derivation) keeps new wallets spendable by sendToken.
    const fresh = await createVerifiedSmartWallet('arbitrum');
    console.log("Generated new personal account:", fresh.personalEoa);
    console.log("Generated new unified smart wallet address:", fresh.walletAddress);
    return { address: fresh.walletAddress, privateKey: fresh.privateKey };
}

export async function unifyWallets(pk: string): Promise<string> {
    try {
        // Same options as sendToken (LEGACY v0.6 factory, default salt) so the
        // stored address equals the spend-time prediction for this key.
        const { address, personalEoa } = await deriveSmartWalletAddress(pk, 'arbitrum');
        console.log("Personal account address:", personalEoa);
        console.log("Unified smart wallet address for all chains:", address);
        return address;
    } catch (error: any) {
        console.error("Error in unifyWallets:", {
            message: error.message,
            stack: error.stack,
        });
        throw error;
    }
}

export async function migrateFunds(
    fromAddress: string,
    toAddress: string,
    chainName: string,
    pk: string
): Promise<{ transactionHash: string | null; message?: string }> {
    try {
        const chainConfig = config[chainName as keyof typeof config];
        if (!chainConfig || !chainConfig.chainId || !chainConfig.tokenAddress) {
            throw new Error(`Invalid chain configuration for ${chainName}`);
        }

        const chain = defineChain(chainConfig.chainId);
        const tokenAddress = chainConfig.tokenAddress;
        console.log(`Migrating funds on ${chainName} from ${fromAddress} to ${toAddress}`);

        const personalAccount = privateKeyToAccount({ client, privateKey: pk });
        const options = paymentWalletOptions(chainName, chain);
        if (!options.overrides?.bundlerUrl) throw new EvmPaymentError('TRANSFERS_UNAVAILABLE', 'Sending on this network is currently unavailable.', 503);
        const wallet = smartWallet(await withBundlerFees(options, client));

        const smartAccount = await wallet.connect({ client, personalAccount });
        console.log("Source unified smart account address:", smartAccount.address);

        const contract = getContract({
            client,
            chain,
            address: tokenAddress,
        });

        if (smartAccount.address.toLowerCase() !== fromAddress.toLowerCase()) throw new Error('Migration source does not match signing account');
        const balance = await balanceOf({ contract, address: fromAddress });
        const decimals = 6;
        const balanceInUnits = BigInt(balance.toString());
        const balanceInUSDC = Number(balanceInUnits) / 10 ** decimals;
        console.log(`USDC balance to migrate: ${balanceInUSDC}`);

        if (balanceInUnits === 0n) {
            console.log(`No USDC balance to migrate on ${chainName}`);
            return { transactionHash: null, message: "No balance to migrate" };
        }

        const transferTx = await sendTransaction({
            transaction: transfer({
                contract,
                to: toAddress,
                amountWei: balanceInUnits,
            }),
            account: smartAccount,
        });

        console.log(`Migration transaction hash: ${transferTx.transactionHash}`);
        return { transactionHash: transferTx.transactionHash };

    } catch (error: any) {
        console.error("Error in migrateFunds:", {
            message: error.message,
            stack: error.stack,
            details: error.details,
            signature: error.signature,
        });
        throw error; // Let controller handle other errors (e.g., network issues)
    }
}

export async function getAllTokenTransferEvents(chain: Chain, walletAddress: string): Promise<TokenTransferEvent[]> {
    const apiEndpoints = {
        arbitrum: 'https://api.arbiscan.io/api',
        celo: 'https://api.celoscan.io/api',
        optimism: 'https://api-optimistic.etherscan.io/api',
        polygon: 'https://api.polygonscan.com/api',
        base: 'https://api.basescan.org/api',
        ethereum: 'https://api.etherscan.io/api',
        avalanche: 'https://api.snowtrace.io/api',
        bnb: 'https://api.bscscan.com/api',
        scroll: 'https://api.scrollscan.com/api',
        gnosis: 'https://api.gnosisscan.io/api',
        fantom: 'https://api.ftmscan.com/api',
        somnia: 'https://api.somniascan.io/api',
        moonbeam: 'https://api-moonbeam.moonscan.io/api',
        fuse: 'https://api.fusescan.io/api',
        aurora: 'https://api.aurorascan.dev/api',
        lisk: 'https://api.liskscan.com/api'
    };

    const apiKeys = {
        arbitrum: config.ARBITRUM_EXPLORER_API_KEY || '',
        celo: config.CELO_EXPLORER_API_KEY || '',
        optimism: config.OPTIMISM_EXPLORER_API_KEY || '',
        polygon: config.POLYGON_EXPLORER_API_KEY || '',
        base: config.BASE_EXPLORER_API_KEY || '',
        ethereum: config.ETHERSCAN_API_KEY || '',
        avalanche: config.AVALANCHE_API_KEY || '',
        bnb: config.BNB_API_KEY || '',
        scroll: config.SCROLL_API_KEY || '',
        gnosis: config.GNOSIS_API_KEY || '',
        fantom: config.FANTOM_API_KEY || '',
        moonbeam: config.MOONBEAM_API_KEY || '',
        fuse: config.FUSE_EXPLORER_API_KEY || '',
        aurora: config.AURORA_API_KEY || '',
        somnia: config.SOMNIA_API_KEY || '',
        lisk: ''     // Lisk might use a different API structure
    };

    const baseURL = apiEndpoints[chain];
    const apiKey = apiKeys[chain];
    const url = `${baseURL}?module=account&action=tokentx&address=${walletAddress}&page=1&offset=100&sort=desc&apikey=${apiKey}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Failed to fetch data from API');
        }

        const data = await response.json();
        if (data.status !== '1') {
            throw new Error(data.message || 'Failed to fetch transfer events');
        }
        
        return data.result as TokenTransferEvent[];
    } catch (error) {
        console.error("Error in getAllTokenTransferEvents:");
        throw error;
    }
}

async function fetchUSDCToKESPrice() {
    const apiEndpoint = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=USDC&convert=KES';
    const headers = { 'X-CMC_PRO_API_KEY': config.COINMARKETCAP_API_KEY };
    const response = await fetch(apiEndpoint, { headers });
    if (response.status !== 200) {
        throw new Error(`Failed to fetch USDC to KES price: ${response.status}`);
    }
    const data = await response.json();
    return data.data['USDC'].quote['KES'].price;
}

export async function getConversionRateWithCaching() {
    let cache = { rate: null, timestamp: 0 };
    const cacheDuration = 10 * 60 * 1000;
    if (cache.rate && (Date.now() - cache.timestamp < cacheDuration)) {
        return cache.rate;
    } else {
        const rate = await fetchUSDCToKESPrice();
        cache = { rate, timestamp: Date.now() };
        return rate;
    }
}

export async function getTokenBalance(
    address: string,
    chain: Chain,
    symbol: TokenSymbol = "USDC"
): Promise<number> {
    try {
        const tokenConfig = getTokenConfig(chain, symbol);
        if (!tokenConfig) {
            throw new Error(`Token ${symbol} not supported on chain ${chain}`);
        }

        const chainConfig = config[chain];
        if (!chainConfig || !chainConfig.chainId) {
            throw new Error(`Invalid chain configuration for ${chain}`);
        }

        const contract = getContract({
            client,
            chain: defineChain(chainConfig.chainId),
            address: tokenConfig.address,
        });

        const balance = await balanceOf({ contract, address });

        return Number(balance.toString()) / 10 ** tokenConfig.decimals;
    } catch (error: any) {
        console.error(`Failed to fetch ${symbol} balance on ${chain}:`, error);
        return 0;
    }
}
