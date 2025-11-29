import { ethers } from 'ethers';
// Migrated from Thirdweb to NexusCore SDK
import { createWalletFromPrivateKey, createNexusClient } from '../utils/nexusHelper';
import { client } from './auth';
import config from "../config/env";

/**
 * Get wallet balance from the blockchain
 * @param walletAddress The address to check balance for
 * @param chainName The chain to use (defaults to 'celo')
 * @returns The balance as a number
 */
export async function getWalletBalance(walletAddress: string, chainName: string = 'celo'): Promise<number> {
  try {
    const chainConfig = config[chainName];
    if (!chainConfig || !chainConfig.chainId || !chainConfig.tokenAddress) {
      throw new Error(`Invalid chain configuration for ${chainName}`);
    }
    
    // Create NexusCore client for the specified chain
    const nexusClient = createNexusClient(chainName);
    
    // Get token balance using ethers.js provider
    const provider = new ethers.providers.JsonRpcProvider(chainConfig.rpcUrl);
    const tokenContract = new ethers.Contract(
      chainConfig.tokenAddress,
      ['function balanceOf(address) view returns (uint256)'],
      provider
    );
    
    const balance = await tokenContract.balanceOf(walletAddress);
    
    return Number(ethers.utils.formatUnits(balance, chainConfig.decimals || 18));
  } catch (error) {
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
export async function transferTokens(
  sourcePrivateKey: string, 
  destinationAddress: string,
  amount: number,
  chainName: string = 'celo'
): Promise<{ transactionHash: string }> {
  try {
    const chainConfig = config[chainName];
    if (!chainConfig || !chainConfig.chainId || !chainConfig.tokenAddress) {
      throw new Error(`Invalid chain configuration for ${chainName}`);
    }
    
    // For now, use direct ethers.js transfer (smart account integration coming in next phase)
    const provider = new ethers.providers.JsonRpcProvider(chainConfig.rpcUrl);
    const signer = new ethers.Wallet(sourcePrivateKey, provider);
    
    const tokenContract = new ethers.Contract(
      chainConfig.tokenAddress,
      ['function transfer(address to, uint256 amount) returns (bool)'],
      signer
    );
    
    const amountInWei = ethers.utils.parseUnits(amount.toString(), chainConfig.decimals || 18);
    const tx = await tokenContract.transfer(destinationAddress, amountInWei);
    const receipt = await tx.wait();
    
    return { transactionHash: receipt.transactionHash };
  } catch (error) {
    console.error(`Error transferring tokens:`, error);
    throw error;
  }
} 