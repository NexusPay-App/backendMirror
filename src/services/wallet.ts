import { ethers } from 'ethers';
import { privateKeyToAccount, smartWallet } from "thirdweb/wallets";
import { defineChain, getContract, sendTransaction } from "thirdweb";
import { transfer, balanceOf } from "thirdweb/extensions/erc20";
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
    
    const chain = defineChain(chainConfig.chainId);
    const tokenAddress = chainConfig.tokenAddress;
    
    // Get contract
    const contract = getContract({
      client,
      chain,
      address: tokenAddress,
    });
    
    // Get balance
    const balance = await balanceOf({
      contract,
      address: walletAddress,
    });
    
    return Number(balance);
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
    
    const chain = defineChain(chainConfig.chainId);
    const tokenAddress = chainConfig.tokenAddress;
    
    // Create wallet from private key
    const personalAccount = privateKeyToAccount({
      client,
      privateKey: sourcePrivateKey
    });
    
    // Connect the smart wallet
    const wallet = smartWallet({
      chain,
      sponsorGas: true,
    });
    
    const smartAccount = await wallet.connect({
      client,
      personalAccount,
    });
    
    // Get contract
    const contract = getContract({
      client,
      chain,
      address: tokenAddress,
    });
    
    // Transfer tokens
    const transaction = transfer({
      contract,
      to: destinationAddress,
      amount,
    });
    
    // Execute transaction
    const tx = await sendTransaction({
      transaction,
      account: smartAccount,
    });
    
    return { transactionHash: tx.transactionHash };
  } catch (error) {
    console.error(`Error transferring tokens:`, error);
    throw error;
  }
} 