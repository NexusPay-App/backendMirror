import { defineChain, getContract } from "thirdweb";
import { balanceOf } from "thirdweb/extensions/erc20";
import { client } from "../../services/auth";
import config from "../../config/env";
import { Chain, TokenSymbol } from "../../types/token";
import { getTokenConfig } from "../../config/tokens";

/**
 * Helper function to get token balance for a specific token on a specific chain
 * Returns the balance in human-readable format (e.g., 9.83 USDC instead of 9830000)
 */
export async function getTokenBalanceOnChain(
    walletAddress: string,
    chain: string,
    tokenSymbol: TokenSymbol
): Promise<number> {
    try {
        // Get chain configuration
        const chainConfig = config[chain];
        if (!chainConfig || !chainConfig.chainId) {
            throw new Error(`Invalid chain configuration for ${chain}`);
        }
        
        // Get token configuration
        const tokenConfig = getTokenConfig(chain as Chain, tokenSymbol);
        if (!tokenConfig) {
            throw new Error(`Token ${tokenSymbol} not supported on chain ${chain}`);
        }
        
        // Define chain
        const thirdwebChain = defineChain(chainConfig.chainId);
        
        // Get contract for the specific token
        const contract = getContract({
            client,
            chain: thirdwebChain,
            address: tokenConfig.address,
        });
        
        // Get balance
        const balance = await balanceOf({
            contract,
            address: walletAddress
        });
        
        // Convert from raw balance to human-readable format using token decimals
        const decimals = tokenConfig.decimals;
        const humanReadableBalance = parseInt(balance.toString()) / Math.pow(10, decimals);

        console.log(`Raw Balance: ${balance.toString()}, Decimals: ${decimals}, Converted: ${humanReadableBalance}`);
        
        return humanReadableBalance;
    } catch (error) {
        console.error(`Error getting ${tokenSymbol} balance on ${chain}:`, error);
        return 0; // Return 0 on error to avoid breaking the flow
    }
} 