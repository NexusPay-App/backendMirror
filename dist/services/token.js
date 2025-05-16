"use strict";
// import { Chain } from '../types/token';
// import { TokenTransferEvent } from '../types/token';
// import { client } from './auth';
// import { privateKeyToAccount, smartWallet } from "thirdweb/wallets";
// import { defineChain, getContract, sendTransaction } from "thirdweb";
// import { transfer } from "thirdweb/extensions/erc20";
// import config from "../config/env"
// // const PLATFORM_WALLET_ADDRESS = "0x4c2C4bB506D2eFab0a7235DEee07E75737d5472f"; // Hardcoded platform wallet address
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateTransactionFee = calculateTransactionFee;
exports.sendToken = sendToken;
exports.generateUnifiedWallet = generateUnifiedWallet;
exports.unifyWallets = unifyWallets;
exports.migrateFunds = migrateFunds;
exports.getAllTokenTransferEvents = getAllTokenTransferEvents;
exports.getConversionRateWithCaching = getConversionRateWithCaching;
exports.getTokenBalance = getTokenBalance;
const auth_1 = require("./auth");
const wallets_1 = require("thirdweb/wallets");
const thirdweb_1 = require("thirdweb");
const erc20_1 = require("thirdweb/extensions/erc20");
const env_1 = __importDefault(require("../config/env"));
const utils_1 = require("thirdweb/utils");
const tokens_1 = require("../config/tokens");
// Removed explicit FACTORY_ADDRESS; using Thirdweb's default factory
// export const FACTORY_ADDRESS = "0x9B4fA2A0D77fB3B1a65e1282e26FDFA8bB5f8FDe";
function calculateTransactionFee(amount) {
    if (amount <= 1)
        return 0;
    if (amount <= 5)
        return 0.05;
    if (amount <= 10)
        return 0.1;
    if (amount <= 15)
        return 0.2;
    if (amount <= 25)
        return 0.3;
    if (amount <= 35)
        return 0.45;
    if (amount <= 50)
        return 0.5;
    if (amount <= 75)
        return 0.68;
    if (amount <= 100)
        return 0.79;
    if (amount <= 150)
        return 0.88;
    return 0.95;
}
async function sendToken(recipientAddress, amount, chainName = "celo", pk, tokenSymbol = "USDC" // Default to USDC for backward compatibility
) {
    try {
        // Input validation
        if (!recipientAddress) {
            throw new Error("Recipient address is required");
        }
        if (!amount || amount <= 0) {
            throw new Error("Valid amount is required");
        }
        if (!pk) {
            throw new Error("Private key is required");
        }
        // Get token configuration
        const tokenConfig = (0, tokens_1.getTokenConfig)(chainName, tokenSymbol);
        if (!tokenConfig) {
            throw new Error(`Token ${tokenSymbol} not supported on chain ${chainName}`);
        }
        // Debug logging
        console.log("SendToken parameters:", {
            recipientAddress: `${recipientAddress.substring(0, 6)}...${recipientAddress.substring(recipientAddress.length - 4)}`,
            amount,
            chainName,
            tokenSymbol,
            hasPrivateKey: !!pk
        });
        // Get chain configuration
        const chainConfig = env_1.default[chainName];
        if (!chainConfig || !chainConfig.chainId) {
            throw new Error(`Invalid chain configuration for ${chainName}`);
        }
        const chain = (0, thirdweb_1.defineChain)(chainConfig.chainId);
        console.log(`Chain ID for ${chainName}: ${chainConfig.chainId}`);
        const tokenAddress = tokenConfig.address;
        console.log(`Token address for ${tokenSymbol} on ${chainName}: ${tokenAddress}`);
        // Initialize accounts and contract
        const personalAccount = (0, wallets_1.privateKeyToAccount)({ client: auth_1.client, privateKey: pk });
        const wallet = (0, wallets_1.smartWallet)({
            chain,
            sponsorGas: false,
        });
        const smartAccount = await wallet.connect({ client: auth_1.client, personalAccount });
        const contract = (0, thirdweb_1.getContract)({
            client: auth_1.client,
            chain,
            address: tokenAddress,
        });
        // Convert amount to token units
        const decimals = tokenConfig.decimals;
        const amountInUnits = BigInt(Math.floor(amount * 10 ** decimals));
        // Check and handle allowance
        let currentAllowance = BigInt(0);
        try {
            currentAllowance = await (0, erc20_1.allowance)({
                contract,
                owner: personalAccount.address,
                spender: smartAccount.address,
            });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error("Allowance check failed, assuming 0:", errorMessage);
        }
        if (currentAllowance < amountInUnits) {
            console.log("Insufficient allowance. Approving transfer...");
            const approveTx = await (0, thirdweb_1.sendTransaction)({
                transaction: (0, erc20_1.approve)({
                    contract,
                    spender: smartAccount.address,
                    amount: amount,
                }),
                account: smartAccount,
            });
            await (0, thirdweb_1.waitForReceipt)(approveTx);
        }
        // Execute transfer
        const transferTx = await (0, thirdweb_1.sendTransaction)({
            transaction: (0, erc20_1.transfer)({
                contract,
                to: recipientAddress,
                amount: amount,
            }),
            account: smartAccount,
        });
        await (0, thirdweb_1.waitForReceipt)(transferTx);
        return { transactionHash: transferTx.transactionHash };
    }
    catch (error) {
        console.error("Error in sendToken:", {
            message: error.message,
            stack: error.stack,
            details: error.details || 'No additional details',
            signature: error.signature || 'No signature'
        });
        throw new Error(`Token transfer failed: ${error.message}`);
    }
}
async function generateUnifiedWallet(phoneNumber) {
    const salt = Date.now().toString();
    const privateKey = (0, utils_1.keccak256)((0, utils_1.toHex)(`${phoneNumber}${salt}`));
    const newAccount = (0, wallets_1.privateKeyToAccount)({ client: auth_1.client, privateKey });
    console.log("Generated new personal account:", newAccount.address);
    const chain = (0, thirdweb_1.defineChain)(42161); // Arbitrum as reference chain
    const wallet = (0, wallets_1.smartWallet)({
        chain,
        // factoryAddress removed to use default
        sponsorGas: false, // Switch to true when paymaster is funded
    });
    const smartAccount = await wallet.connect({ client: auth_1.client, personalAccount: newAccount });
    console.log("Generated new unified smart wallet address:", smartAccount.address);
    return { address: smartAccount.address, privateKey: privateKey };
}
async function unifyWallets(pk) {
    try {
        const personalAccount = (0, wallets_1.privateKeyToAccount)({ client: auth_1.client, privateKey: pk });
        console.log("Personal account address:", personalAccount.address);
        // Use Arbitrum as reference chain
        const chain = (0, thirdweb_1.defineChain)(42161); // Arbitrum chain ID
        console.log("Using chain ID:", chain.id);
        const wallet = (0, wallets_1.smartWallet)({
            chain,
            // factoryAddress removed to use default
            sponsorGas: false, // Switch to true when paymaster is funded
        });
        console.log("Smart wallet initialized with default factory");
        const smartAccount = await wallet.connect({ client: auth_1.client, personalAccount });
        console.log("Unified smart wallet address for all chains:", smartAccount.address);
        return smartAccount.address;
    }
    catch (error) {
        console.error("Error in unifyWallets:", {
            message: error.message,
            stack: error.stack,
        });
        throw error;
    }
}
async function migrateFunds(fromAddress, toAddress, chainName, pk) {
    try {
        const chainConfig = env_1.default[chainName];
        if (!chainConfig || !chainConfig.chainId || !chainConfig.tokenAddress) {
            throw new Error(`Invalid chain configuration for ${chainName}`);
        }
        const chain = (0, thirdweb_1.defineChain)(chainConfig.chainId);
        const tokenAddress = chainConfig.tokenAddress;
        console.log(`Migrating funds on ${chainName} from ${fromAddress} to ${toAddress}`);
        const personalAccount = (0, wallets_1.privateKeyToAccount)({ client: auth_1.client, privateKey: pk });
        const wallet = (0, wallets_1.smartWallet)({
            chain,
            sponsorGas: false, // Switch to true when paymaster is funded
        });
        const smartAccount = await wallet.connect({ client: auth_1.client, personalAccount });
        console.log("Source unified smart account address:", smartAccount.address);
        const contract = (0, thirdweb_1.getContract)({
            client: auth_1.client,
            chain,
            address: tokenAddress,
        });
        const balance = await (0, thirdweb_1.readContract)({
            contract,
            method: "function balanceOf(address) view returns (uint256)",
            params: [fromAddress],
        });
        const decimals = 6;
        const balanceInUnits = BigInt(balance.toString());
        const balanceInUSDC = Number(balanceInUnits) / 10 ** decimals;
        console.log(`USDC balance to migrate: ${balanceInUSDC}`);
        if (balanceInUnits === 0n) {
            console.log(`No USDC balance to migrate on ${chainName}`);
            return { transactionHash: null, message: "No balance to migrate" };
        }
        const transferTx = await (0, thirdweb_1.sendTransaction)({
            transaction: (0, erc20_1.transfer)({
                contract,
                to: toAddress,
                amount: balanceInUSDC,
            }),
            account: smartAccount,
        });
        console.log(`Migration transaction hash: ${transferTx.transactionHash}`);
        return { transactionHash: transferTx.transactionHash };
    }
    catch (error) {
        console.error("Error in migrateFunds:", {
            message: error.message,
            stack: error.stack,
            details: error.details,
            signature: error.signature,
        });
        throw error; // Let controller handle other errors (e.g., network issues)
    }
}
async function getAllTokenTransferEvents(chain, walletAddress) {
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
        arbitrum: '44UDQIEKU98ZQ559DWX4ZUZJC5EBK8XUU4',
        celo: 'Z349YD6992FHPR3V7SMTS62X1TS52EV5KT',
        optimism: env_1.default.OPTIMISM_API_KEY || '',
        polygon: env_1.default.POLYGON_API_KEY || '',
        base: env_1.default.BASE_API_KEY || '',
        avalanche: env_1.default.AVALANCHE_API_KEY || '',
        bnb: env_1.default.BNB_API_KEY || '',
        scroll: env_1.default.SCROLL_API_KEY || '',
        gnosis: env_1.default.GNOSIS_API_KEY || '',
        fantom: env_1.default.FANTOM_API_KEY || '',
        moonbeam: env_1.default.MOONBEAM_API_KEY || '',
        fuse: env_1.default.FUSE_API_KEY || '',
        aurora: env_1.default.AURORA_API_KEY || '',
        somnia: env_1.default.SOMNIA_API_KEY || '', // Added Somnia API key
        lisk: '' // Lisk might use a different API structure
    };
    const baseURL = apiEndpoints[chain];
    const apiKey = apiKeys[chain];
    const url = `${baseURL}?module=account&action=tokentx&address=${walletAddress}&page=1&offset=5&sort=desc&apikey=${apiKey}`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Failed to fetch data from API');
        }
        const data = await response.json();
        if (data.status !== '1') {
            throw new Error(data.message);
        }
        return data.result;
    }
    catch (error) {
        console.error('Error in getAllTokenTransferEvents:', error);
        throw error;
    }
}
async function fetchUSDCToKESPrice() {
    const apiEndpoint = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=USDC&convert=KES';
    const headers = { 'X-CMC_PRO_API_KEY': '7e75c059-0ffc-41ca-ae72-88df27e0f202' };
    const response = await fetch(apiEndpoint, { headers });
    if (response.status !== 200) {
        throw new Error(`Failed to fetch USDC to KES price: ${response.status}`);
    }
    const data = await response.json();
    return data.data['USDC'].quote['KES'].price;
}
async function getConversionRateWithCaching() {
    let cache = { rate: null, timestamp: 0 };
    const cacheDuration = 10 * 60 * 1000;
    if (cache.rate && (Date.now() - cache.timestamp < cacheDuration)) {
        return cache.rate;
    }
    else {
        const rate = await fetchUSDCToKESPrice();
        cache = { rate, timestamp: Date.now() };
        return rate;
    }
}
async function getTokenBalance(address, chain, symbol = "USDC") {
    try {
        const tokenConfig = (0, tokens_1.getTokenConfig)(chain, symbol);
        if (!tokenConfig) {
            throw new Error(`Token ${symbol} not supported on chain ${chain}`);
        }
        const chainConfig = env_1.default[chain];
        if (!chainConfig || !chainConfig.chainId) {
            throw new Error(`Invalid chain configuration for ${chain}`);
        }
        const contract = (0, thirdweb_1.getContract)({
            client: auth_1.client,
            chain: (0, thirdweb_1.defineChain)(chainConfig.chainId),
            address: tokenConfig.address,
        });
        const balance = await (0, thirdweb_1.readContract)({
            contract,
            method: "function balanceOf(address) view returns (uint256)",
            params: [address],
        });
        return Number(balance.toString()) / 10 ** tokenConfig.decimals;
    }
    catch (error) {
        console.error(`Failed to fetch ${symbol} balance on ${chain}:`, error);
        return 0;
    }
}
