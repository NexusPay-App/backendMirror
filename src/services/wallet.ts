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
    
    // Create NexusCore client for the specified chain
    const nexusClient = createNexusClient(chainName);
    
    // Create wallet from private key
    const wallet = createWalletFromPrivateKey(sourcePrivateKey);
    
    // Create smart account
    const smartAccount = await nexusClient.createAccount({
      owner: wallet.address
    });
    
    // Prepare ERC20 transfer transaction
    const tokenInterface = new ethers.utils.Interface([
      'function transfer(address to, uint256 amount) returns (bool)'
    ]);
    
    const amountInWei = ethers.utils.parseUnits(amount.toString(), chainConfig.decimals || 18);
    const data = tokenInterface.encodeFunctionData('transfer', [destinationAddress, amountInWei]);
    
    // Execute transaction via smart account
    const result = await smartAccount.execute({
      to: chainConfig.tokenAddress as `0x${string}`,
      value: BigInt(0),
      data: data as `0x${string}`
    });
    
    return { transactionHash: result.userOpHash };
  } catch (error) {
    console.error(`Error transferring tokens:`, error);
    throw error;
  }
} 