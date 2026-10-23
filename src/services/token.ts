import { Wallet } from 'ethers';
import { getTokenConfig as lookupToken } from '../config/tokens';
import { parseAmount } from '../utils/amounts';
import { client } from './auth';
import { privateKeyToAccount, smartWallet } from "thirdweb/wallets";
import { defineChain, getContract, sendTransaction, waitForReceipt, readContract } from "thirdweb";
import { transfer, balanceOf } from "thirdweb/extensions/erc20";
import config from "../config/env";
import { keccak256, toHex } from 'viem';
import { eth_getBalance } from 'thirdweb/rpc';
import { getRpcClient } from 'thirdweb';
import { estimateUserOpGasCost } from 'thirdweb/wallets/smart';
import { paymentChain, paymentWalletOptions, isUserFundedNetwork, isUserFundedChain } from '../config/mainnetPayments';
import { EvmPaymentError } from './evmPaymentErrors';

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
    const contract = getContract({ client, chain, address: token.address });
    const [decimals, symbol] = await Promise.all([
      readContract({ contract, method: 'function decimals() view returns (uint8)' }),
      readContract({ contract, method: 'function symbol() view returns (string)' }),
    ]);
    if (decimals !== token.decimals || symbol !== tokenSymbol) throw new Error('Configured token does not match on-chain metadata');
    const personalAccount = privateKeyToAccount({ client, privateKey: pk });
    const walletOptions = paymentWalletOptions(chainName, chain);
    const wallet = smartWallet(walletOptions);
    const account = await wallet.connect({ client, personalAccount });
    if (expectedSender && account.address.toLowerCase() !== expectedSender.toLowerCase()) throw new Error('Signing account does not match the stored sender wallet');
    const available = await balanceOf({ contract, address: account.address });
    if (available < units) throw new Error('Insufficient token balance');
    const transaction = transfer({ contract, to: recipientAddress, amountWei: units });
    if (isUserFundedNetwork(chainName)) {
      const nativeBalance = await eth_getBalance(getRpcClient({ client, chain }), { address: account.address });
      if (nativeBalance === 0n) throw new EvmPaymentError('INSUFFICIENT_GAS', `Add ETH on ${chain.name} to your NexusPay wallet to pay the network fee. USDC and USDT cannot pay this fee.`);
      // Includes the initial smart-account deployment and EntryPoint overhead.
      const fee = await estimateUserOpGasCost({ transactions: [transaction], adminAccount: personalAccount, client, smartWalletOptions: walletOptions });
      if (nativeBalance < fee.wei) throw new EvmPaymentError('INSUFFICIENT_GAS', `Your wallet needs approximately ${fee.ether} ETH on ${chain.name} for this payment. Add ETH to the address shown on Receive.`);
    }
    const sent = await sendTransaction({ account, transaction });
    const receipt = await waitForReceipt(sent);
    if (receipt.status !== 'success') throw new Error('Token transfer reverted');
    // No EOA fallback: sponsorship failure must never change the source of funds.
    return { transactionHash: sent.transactionHash };
}

export async function generateUnifiedWallet(phoneNumber: string): Promise<{ address: string, privateKey: string }> {
    const privateKey = Wallet.createRandom().privateKey as `0x${string}`;
    const newAccount = privateKeyToAccount({ client, privateKey });
    console.log("Generated new personal account:", newAccount.address);

    const chain = defineChain(42161); // Arbitrum as reference chain
    const wallet = smartWallet({
        chain,
        // factoryAddress removed to use default
        sponsorGas: !isUserFundedChain(chain.id), // User-funded on Base and Arbitrum
    });

    const smartAccount = await wallet.connect({ client, personalAccount: newAccount });
    console.log("Generated new unified smart wallet address:", smartAccount.address);

    return { address: smartAccount.address, privateKey: privateKey };
}

export async function unifyWallets(pk: string): Promise<string> {
    try {
        const personalAccount = privateKeyToAccount({ client, privateKey: pk });
        console.log("Personal account address:", personalAccount.address);

        // Use Arbitrum as reference chain
        const chain = defineChain(42161); // Arbitrum chain ID
        console.log("Using chain ID:", chain.id);

        const wallet = smartWallet({
            chain,
            // factoryAddress removed to use default
            sponsorGas: !isUserFundedChain(chain.id), // User-funded on Base and Arbitrum
        });
        console.log("Smart wallet initialized with default factory");

        const smartAccount = await wallet.connect({ client, personalAccount });
        console.log("Unified smart wallet address for all chains:", smartAccount.address);

        return smartAccount.address;
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
        const wallet = smartWallet({
            chain,
            sponsorGas: !isUserFundedChain(chain.id), // User-funded on Base and Arbitrum
        });

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