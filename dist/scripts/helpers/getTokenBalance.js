"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTokenBalanceOnChain = getTokenBalanceOnChain;
const thirdweb_1 = require("thirdweb");
const erc20_1 = require("thirdweb/extensions/erc20");
const auth_1 = require("../../services/auth");
const env_1 = __importDefault(require("../../config/env"));
const tokens_1 = require("../../config/tokens");
/**
 * Helper function to get token balance for a specific token on a specific chain
 * Returns the balance in human-readable format (e.g., 9.83 USDC instead of 9830000)
 */
async function getTokenBalanceOnChain(walletAddress, chain, tokenSymbol) {
    try {
        // Get chain configuration
        const chainConfig = env_1.default[chain];
        if (!chainConfig || !chainConfig.chainId) {
            throw new Error(`Invalid chain configuration for ${chain}`);
        }
        // Get token configuration
        const tokenConfig = (0, tokens_1.getTokenConfig)(chain, tokenSymbol);
        if (!tokenConfig) {
            throw new Error(`Token ${tokenSymbol} not supported on chain ${chain}`);
        }
        // Define chain
        const thirdwebChain = (0, thirdweb_1.defineChain)(chainConfig.chainId);
        // Get contract for the specific token
        const contract = (0, thirdweb_1.getContract)({
            client: auth_1.client,
            chain: thirdwebChain,
            address: tokenConfig.address,
        });
        // Get balance
        const balance = await (0, erc20_1.balanceOf)({
            contract,
            address: walletAddress
        });
        // Convert from raw balance to human-readable format using token decimals
        const decimals = tokenConfig.decimals;
        const humanReadableBalance = parseInt(balance.toString()) / Math.pow(10, decimals);
        console.log(`Raw Balance: ${balance.toString()}, Decimals: ${decimals}, Converted: ${humanReadableBalance}`);
        return humanReadableBalance;
    }
    catch (error) {
        console.error(`Error getting ${tokenSymbol} balance on ${chain}:`, error);
        return 0; // Return 0 on error to avoid breaking the flow
    }
}
