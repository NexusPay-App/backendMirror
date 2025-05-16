"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWalletBalance = getWalletBalance;
exports.transferTokens = transferTokens;
const wallets_1 = require("thirdweb/wallets");
const thirdweb_1 = require("thirdweb");
const erc20_1 = require("thirdweb/extensions/erc20");
const auth_1 = require("./auth");
const env_1 = __importDefault(require("../config/env"));
/**
 * Get wallet balance from the blockchain
 * @param walletAddress The address to check balance for
 * @param chainName The chain to use (defaults to 'celo')
 * @returns The balance as a number
 */
async function getWalletBalance(walletAddress, chainName = 'celo') {
    try {
        const chainConfig = env_1.default[chainName];
        if (!chainConfig || !chainConfig.chainId || !chainConfig.tokenAddress) {
            throw new Error(`Invalid chain configuration for ${chainName}`);
        }
        const chain = (0, thirdweb_1.defineChain)(chainConfig.chainId);
        const tokenAddress = chainConfig.tokenAddress;
        // Get contract
        const contract = (0, thirdweb_1.getContract)({
            client: auth_1.client,
            chain,
            address: tokenAddress,
        });
        // Get balance
        const balance = await (0, erc20_1.balanceOf)({
            contract,
            address: walletAddress,
        });
        return Number(balance);
    }
    catch (error) {
        console.error(`Error getting wallet balance:`, error);
        throw error;
    }
}
/**
 * Transfer tokens from one wallet to another
 * @param sourcePrivateKey The private key of the source wallet
 * @param destinationAddress The address of the destination wallet
 * @param amount The amount to transfer
 * @param chainName The chain to use (defaults to 'celo')
 * @returns The transaction hash
 */
async function transferTokens(sourcePrivateKey, destinationAddress, amount, chainName = 'celo') {
    try {
        const chainConfig = env_1.default[chainName];
        if (!chainConfig || !chainConfig.chainId || !chainConfig.tokenAddress) {
            throw new Error(`Invalid chain configuration for ${chainName}`);
        }
        const chain = (0, thirdweb_1.defineChain)(chainConfig.chainId);
        const tokenAddress = chainConfig.tokenAddress;
        // Create wallet from private key
        const personalAccount = (0, wallets_1.privateKeyToAccount)({
            client: auth_1.client,
            privateKey: sourcePrivateKey
        });
        // Connect the smart wallet
        const wallet = (0, wallets_1.smartWallet)({
            chain,
            sponsorGas: true,
        });
        const smartAccount = await wallet.connect({
            client: auth_1.client,
            personalAccount,
        });
        // Get contract
        const contract = (0, thirdweb_1.getContract)({
            client: auth_1.client,
            chain,
            address: tokenAddress,
        });
        // Transfer tokens
        const transaction = (0, erc20_1.transfer)({
            contract,
            to: destinationAddress,
            amount,
        });
        // Execute transaction
        const tx = await (0, thirdweb_1.sendTransaction)({
            transaction,
            account: smartAccount,
        });
        return { transactionHash: tx.transactionHash };
    }
    catch (error) {
        console.error(`Error transferring tokens:`, error);
        throw error;
    }
}
