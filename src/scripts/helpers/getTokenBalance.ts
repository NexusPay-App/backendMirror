import { ethers } from 'ethers';
import { Chain, TokenSymbol } from '../../types/token';
import { getTokenConfig } from '../../config/tokens';
import { SUPPORTED_CHAINS } from '../../services/platformWallet';

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
];

/**
 * Get token balance for a specific token on a specific chain
 * @param chain Chain to check
 * @param walletAddress Wallet address to check
 * @param tokenType Token symbol to check
 * @returns Balance in human-readable format
 */
export async function getTokenBalanceOnChain(
  chain: Chain,
    walletAddress: string,
  tokenType: TokenSymbol
): Promise<number> {
    try {
        // Get chain configuration
    const chainConfig = SUPPORTED_CHAINS[chain];
    if (!chainConfig) {
            throw new Error(`Invalid chain configuration for ${chain}`);
        }
        
        // Get token configuration
    const tokenConfig = getTokenConfig(chain, tokenType);
        if (!tokenConfig) {
      throw new Error(`Token ${tokenType} not supported on chain ${chain}`);
        }
        
    // Create provider
    const provider = new ethers.providers.JsonRpcProvider(chainConfig.rpcUrls.default.http[0]);
        
    // Create contract instance
    const tokenContract = new ethers.Contract(tokenConfig.address, ERC20_ABI, provider);
        
    // Get balance and decimals
    const [balance, decimals] = await Promise.all([
      tokenContract.balanceOf(walletAddress),
      tokenContract.decimals()
    ]);
        
    // Convert to human-readable format
    return Number(ethers.utils.formatUnits(balance, decimals));
    } catch (error) {
    console.error(`Error getting ${tokenType} balance on ${chain}:`, error);
    throw error;
    }
} 