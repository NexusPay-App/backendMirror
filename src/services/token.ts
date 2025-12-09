// import { Chain } from '../types/token';
// import { TokenTransferEvent } from '../types/token';
// import { client } from './auth';
// import { privateKeyToAccount, smartWallet } from "thirdweb/wallets";
// import { defineChain, getContract, sendTransaction } from "thirdweb";
// import { transfer } from "thirdweb/extensions/erc20";
// import config from "../config/env"
// // const PLATFORM_WALLET_ADDRESS = "0x4c2C4bB506D2eFab0a7235DEee07E75737d5472f"; // Hardcoded platform wallet address

// // Function to calculate transaction fee based on the amount
// export function calculateTransactionFee(amount: number): number {
//     if (amount <= 1) return 0;
//     if (amount <= 5) return 0.05;
//     if (amount <= 10) return 0.1;
//     if (amount <= 15) return 0.2;
//     if (amount <= 25) return 0.3;
//     if (amount <= 35) return 0.45;
//     if (amount <= 50) return 0.5;
//     if (amount <= 75) return 0.68;
//     if (amount <= 100) return 0.79;
//     if (amount <= 150) return 0.88;
//     return 0.95; // For amounts above $150.01
// }

// export async function sendToken(recipientAddress: string, amount: number, chainName: string = "celo", pk: string) {
//     const chain = defineChain(config[chainName].chainId)
//     //TODO: ADD fee model
//     const tokenAddress = config[chainName].tokenAddress

//     const personalAccount = privateKeyToAccount({
//         client,
//         privateKey: pk
//     });


//     const wallet = smartWallet({
//         chain: chain,
//         sponsorGas: true,
//     });

//     // Connect the smart wallet
//     const smartAccount = await wallet.connect({
//         client,
//         personalAccount,
//     });

//     console.log("Smart account address:", smartAccount.address);

//     const contract = getContract({
//         client,
//         chain: chain,
//         address: tokenAddress,
//     });


//     const transaction = transfer({
//         contract,
//         to: recipientAddress,
//         amount: amount,
//     });


//     await sendTransaction({
//         transaction,
//         account: smartAccount,
//     });
// }

// export async function getAllTokenTransferEvents(chain: Chain, walletAddress: string): Promise<TokenTransferEvent[]> {
//     const apiEndpoints = {
//         arbitrum: 'https://api.arbiscan.io/api',
//         celo: 'https://api.celoscan.io/api',
//     };

//     const apiKeys = {
//         arbitrum: '44UDQIEKU98ZQ559DWX4ZUZJC5EBK8XUU4',
//         celo: 'Z349YD6992FHPR3V7SMTS62X1TS52EV5KT',  // Replace with your actual CeloScan API key
//     };

//     const baseURL = apiEndpoints[chain];
//     const apiKey = apiKeys[chain];
//     const url = `${baseURL}?module=account&action=tokentx&address=${walletAddress}&page=1&offset=5&sort=desc&apikey=${apiKey}`;

//     try {
//         const response = await fetch(url);
//         if (!response.ok) {
//             throw new Error('Failed to fetch data from API');
//         }

//         const data = await response.json();
//         if (data.status !== '1') {
//             throw new Error(data.message);
//         }
//         return data.result as TokenTransferEvent[];
//     } catch (error) {
//         console.error('Error in getAllTokenTransferEvents:', error);
//         throw error;  // Re-throw to be caught by the controller error handler.
//     }
// }


// // Include any other USD Coin related functions here
// async function fetchUSDCToKESPrice() {
//     // Define the API endpoint
//     const apiEndpoint = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=USDC&convert=KES';

//     // Set the API key header
//     const headers = {
//         'X-CMC_PRO_API_KEY': '7e75c059-0ffc-41ca-ae72-88df27e0f202'
//     };

//     // Make a GET request to the API endpoint
//     const response = await fetch(apiEndpoint, { headers });

//     // Check the response status code
//     if (response.status !== 200) {
//         throw new Error(`Failed to fetch USDC to KES price: ${response.status}`);
//     }

//     // Parse the JSON response
//     const data = await response.json();

//     // Return the USDC to KES price
//     return data.data['USDC'].quote['KES'].price;
// }

// export async function getConversionRateWithCaching() {
//     let cache = {
//         rate: null,
//         timestamp: 0
//     };
//     const cacheDuration = 10 * 60 * 1000; // 10 minutes in milliseconds
//     if (cache.rate && (Date.now() - cache.timestamp < cacheDuration)) {
//         return cache.rate; // Return cached rate if it's fresh
//     } else {
//         const rate = await fetchUSDCToKESPrice(); // Fetch new rate
//         cache = { rate, timestamp: Date.now() };
//         return rate;
//     }
// }



//#######################################################

// import { Chain } from '../types/token';
// import { TokenTransferEvent } from '../types/token';
// import { client } from './auth';
// import { privateKeyToAccount, smartWallet } from "thirdweb/wallets";
// import { defineChain, getContract, sendTransaction, waitForReceipt } from "thirdweb";
// import { transfer, approve, allowance } from "thirdweb/extensions/erc20";
// import config from "../config/env";

// export function calculateTransactionFee(amount: number): number {
//     if (amount <= 1) return 0;
//     if (amount <= 5) return 0.05;
//     if (amount <= 10) return 0.1;
//     if (amount <= 15) return 0.2;
//     if (amount <= 25) return 0.3;
//     if (amount <= 35) return 0.45;
//     if (amount <= 50) return 0.5;
//     if (amount <= 75) return 0.68;
//     if (amount <= 100) return 0.79;
//     if (amount <= 150) return 0.88;
//     return 0.95;
// }

// export async function sendToken(
//     recipientAddress: string,
//     amount: number,
//     chainName: string = "celo",
//     pk: string
// ): Promise<{ transactionHash: string }> {
//     try {
//         if (!recipientAddress || !amount || amount <= 0 || !pk) {
//             throw new Error("Invalid input parameters: recipientAddress, amount, and privateKey are required.");
//         }

//         const chainConfig = config[chainName];
//         if (!chainConfig || !chainConfig.chainId || !chainConfig.tokenAddress) {
//             throw new Error(`Invalid chain configuration for ${chainName}`);
//         }

//         const chain = defineChain(chainConfig.chainId);
//         console.log(`Chain ID for ${chainName}: ${chainConfig.chainId}`);
//         const tokenAddress = chainConfig.tokenAddress;
//         console.log(`Token address for ${chainName}: ${tokenAddress}`);

//         const personalAccount = privateKeyToAccount({ client, privateKey: pk });
//         console.log("Personal account address:", personalAccount.address);

//         const wallet = smartWallet({
//             chain,
//             sponsorGas: true,
//         });

//         const smartAccount = await wallet.connect({ client, personalAccount });
//         console.log("Smart account address:", smartAccount.address);

//         const contract = getContract({
//             client,
//             chain,
//             address: tokenAddress,
//         });
//         console.log("Contract initialized for token:", tokenAddress);

//         const decimals = 6; // USDC has 6 decimals
//         const amountInWei = BigInt(Math.floor(amount * 10 ** decimals));

//         let currentAllowance: bigint = BigInt(0);
//         try {
//             currentAllowance = await allowance({
//                 contract,
//                 owner: personalAccount.address,
//                 spender: smartAccount.address,
//             });
//             console.log(`Current allowance: ${currentAllowance.toString()}`);
//         } catch (error: unknown) {
//             // Safely handle the error as unknown
//             const errorMessage = error instanceof Error ? error.message : String(error);
//             console.error("Allowance check failed, assuming 0:", errorMessage);
//             // Fallback to 0 and proceed to approval
//         }

//         if (currentAllowance < amountInWei) {
//             console.log("Insufficient allowance detected. Approving...");
//             const approveTx = await sendTransaction({
//                 transaction: approve({
//                     contract,
//                     spender: smartAccount.address,
//                     amount: amount,
//                 }),
//                 account: smartAccount,
//             });
//             console.log(`Approval transaction hash: ${approveTx.transactionHash}`);
//             await waitForReceipt(approveTx);
//         }

//         const transferTx = await sendTransaction({
//             transaction: transfer({
//                 contract,
//                 to: recipientAddress,
//                 amount: amount,
//             }),
//             account: smartAccount,
//         });

//         console.log(`Transfer transaction hash: ${transferTx.transactionHash}`);
//         return { transactionHash: transferTx.transactionHash };

//     } catch (error: any) {
//         console.error("Error in sendToken:", {
//             message: error.message,
//             stack: error.stack,
//             details: error.details,
//             signature: error.signature,
//         });
//         throw error;
//     }
// }

// export async function getAllTokenTransferEvents(chain: Chain, walletAddress: string): Promise<TokenTransferEvent[]> {
//     const apiEndpoints = {
//         arbitrum: 'https://api.arbiscan.io/api',
//         celo: 'https://api.celoscan.io/api',
//     };
//     const apiKeys = {
//         arbitrum: '44UDQIEKU98ZQ559DWX4ZUZJC5EBK8XUU4',
//         celo: 'Z349YD6992FHPR3V7SMTS62X1TS52EV5KT',
//     };
//     const baseURL = apiEndpoints[chain];
//     const apiKey = apiKeys[chain];
//     const url = `${baseURL}?module=account&action=tokentx&address=${walletAddress}&page=1&offset=5&sort=desc&apikey=${apiKey}`;

//     try {
//         const response = await fetch(url);
//         if (!response.ok) {
//             throw new Error('Failed to fetch data from API');
//         }
//         const data = await response.json();
//         if (data.status !== '1') {
//             throw new Error(data.message);
//         }
//         return data.result as TokenTransferEvent[];
//     } catch (error) {
//         console.error('Error in getAllTokenTransferEvents:', error);
//         throw error;
//     }
// }

// async function fetchUSDCToKESPrice() {
//     const apiEndpoint = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=USDC&convert=KES';
//     const headers = { 'X-CMC_PRO_API_KEY': '7e75c059-0ffc-41ca-ae72-88df27e0f202' };
//     const response = await fetch(apiEndpoint, { headers });
//     if (response.status !== 200) {
//         throw new Error(`Failed to fetch USDC to KES price: ${response.status}`);
//     }
//     const data = await response.json();
//     return data.data['USDC'].quote['KES'].price;
// }

// export async function getConversionRateWithCaching() {
//     let cache = { rate: null, timestamp: 0 };
//     const cacheDuration = 10 * 60 * 1000;
//     if (cache.rate && (Date.now() - cache.timestamp < cacheDuration)) {
//         return cache.rate;
//     } else {
//         const rate = await fetchUSDCToKESPrice();
//         cache = { rate, timestamp: Date.now() };
//         return rate;
//     }
// }

//################ new Code for Migrations #####################

// Migrated from Thirdweb to NexusCore SDK
import { createWalletFromPrivateKey, createRandomWallet, createNexusSDK, NEXUS_API_CONFIG, callNexusAPI } from '../utils/nexusHelper';
import { ethers } from 'ethers';
import config from "../config/env";
import { keccak256, toHex } from 'viem';
import { NexusSDK } from '@nexus/nexuscore';

export type Chain = 'arbitrum' | 'celo' | 'optimism' | 'polygon' | 'base' | 'avalanche' | 'bnb' | 'scroll' | 'gnosis' | 'fantom' | 'somnia' | 'moonbeam' | 'fuse' | 'aurora' | 'lisk';

export type TokenSymbol = 'USDC' | 'USDT' | 'DAI';

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

export const getTokenConfig = (chain: Chain, token: TokenSymbol): TokenConfig | null => {
  const chainConfig = config[chain];
  if (!chainConfig || !chainConfig.tokenAddress) {
    return null;
  }
  return {
    address: chainConfig.tokenAddress,
    decimals: 6 // USDC has 6 decimals
  };
};

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
    amount: number,
    chainName: string = "celo",
    pk: string,
    tokenSymbol: TokenSymbol = "USDC"  // Default to USDC for backward compatibility
): Promise<{ transactionHash: string }> {
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

        // Check if transferring native token (ETH, MATIC, etc.)
        const isNativeToken = tokenSymbol === 'ETH' || tokenSymbol === 'MATIC' || tokenSymbol === 'BNB' || tokenSymbol === 'AVAX';
        
        let tokenAddress: string;
        let decimals: number;
        
        if (isNativeToken) {
            // Native token transfer - no token address needed
            tokenAddress = '0x0000000000000000000000000000000000000000';
            decimals = 18; // Native tokens use 18 decimals
            
            console.log("🔁 Native Token Transfer Initiated:", {
                recipient: `${recipientAddress.substring(0, 6)}...${recipientAddress.substring(recipientAddress.length - 4)}`,
                amount,
                tokenSymbol,
                chain: chainName,
                type: 'NATIVE',
                timestamp: new Date().toISOString()
            });
        } else {
            // ERC20 token transfer
        const tokenConfig = getTokenConfig(chainName as Chain, tokenSymbol);
        if (!tokenConfig) {
            throw new Error(`Token ${tokenSymbol} not supported on chain ${chainName}`);
        }

            tokenAddress = tokenConfig.address;
            decimals = tokenConfig.decimals;
            
        console.log("🔁 Token Transfer Initiated:", {
            recipient: `${recipientAddress.substring(0, 6)}...${recipientAddress.substring(recipientAddress.length - 4)}`,
            amount,
            tokenSymbol,
            chain: chainName,
            tokenAddress: tokenConfig.address.substring(0, 10) + '...',
            timestamp: new Date().toISOString()
        });
        }

        // Get chain configuration
        const chainConfig = config[chainName];
        if (!chainConfig || !chainConfig.chainId) {
            throw new Error(`Invalid chain configuration for ${chainName}`);
        }

        console.log(`📤 Preparing to send ${amount} ${tokenSymbol} via NexusCore API`);

        // Convert amount to token units (USDC has 6 decimals)
        const amountInUnits = BigInt(Math.floor(amount * 10 ** decimals));

        // Helper to perform transfer via smart wallet using ERC-4337 bundler
        const transferWithSmartAccount = async (): Promise<string> => {
            try {
                // Convert amount to token's smallest unit
                const amountInSmallestUnit = (BigInt(Math.floor(amount * 10 ** decimals))).toString();
                
                console.log(`📤 Sending ${amount} ${tokenSymbol} (${amountInSmallestUnit} smallest units)`);
                console.log(`   Chain: ${chainName} (${chainConfig.chainId})`);
                console.log(`   Type: ${isNativeToken ? 'NATIVE ETH' : 'ERC20'}`);
                
                // Get smart account address from database
                const User = require('../models/models').User;
                const user = await User.findOne({ privateKey: pk });
                if (!user || !user.walletAddress) {
                    throw new Error('Smart account not found for this user');
                }
                const smartAccountAddress = user.walletAddress;
                
                console.log(`   Smart Account: ${smartAccountAddress}`);
                
                // Prepare transaction data
                let to: string;
                let value: string;
                let data: string;
                
                if (isNativeToken) {
                    // Native token transfer
                    to = recipientAddress;
                    value = amountInSmallestUnit;
                    data = '0x';
                } else {
                    // ERC20 token transfer
                    const { Interface } = require('ethers');
                    const iface = new Interface(['function transfer(address to, uint256 amount)']);
                    to = tokenAddress;
                    value = '0';
                    data = iface.encodeFunctionData('transfer', [recipientAddress, amountInSmallestUnit]);
                }
                
                // Build and submit UserOperation via bundler
                const { buildUserOperation, submitUserOperation } = require('./userOpBuilder');
                const { JsonRpcProvider } = require('ethers');
                
                const provider = new JsonRpcProvider(chainConfig.rpcUrl);
                const entryPoint = '0x0000000071727De22E5E9d8BAf0edAc6f37da032'; // v0.7 EntryPoint
                const factoryAddress = '0xFb57b2e568B796ab66075FB8637f20683B0d4E77'; // SimpleAccountFactory
                const bundlerUrl = process.env.BUNDLER_URL || 'http://localhost:4337';
                
                console.log(`📦 Building UserOperation...`);
                
                const userOp = await buildUserOperation(
                    {
                        sender: smartAccountAddress,
                        to,
                        value,
                        data,
                        chainId: chainConfig.chainId,
                        entryPoint,
                        factoryAddress,
                        usePaymaster: true // Enable gas sponsorship
                    },
                    pk,
                    provider
                );
                
                console.log(`📤 Submitting UserOperation to bundler...`);
                
                const userOpHash = await submitUserOperation(userOp, entryPoint, bundlerUrl);
                
                console.log(`✅ UserOperation submitted`);
                console.log(`   UserOp Hash: ${userOpHash}`);
                console.log(`   Amount: ${amount} ${tokenSymbol}`);
                console.log(`   Recipient: ${recipientAddress}`);
                console.log(`   Gas: Sponsored by paymaster`);
                
                // Return userOpHash as transaction hash
                // In production, should poll for actual tx hash
                return userOpHash;
            } catch (error: any) {
                console.error("❌ Smart account transfer failed:", error);
                throw error;
            }
        };

        // Helper to perform direct EOA transfer (fallback if smart account fails)
        const transferWithEOA = async (): Promise<string> => {
            console.warn("⚠️ Falling back to direct EOA transfer (no gas sponsorship)");
            
            // Use ethers.js for direct EOA transfer
            const provider = new ethers.providers.JsonRpcProvider(chainConfig.rpcUrl);
            const signer = new ethers.Wallet(pk, provider);
            
            const tokenContract = new ethers.Contract(
                tokenAddress,
                ['function transfer(address to, uint256 amount) returns (bool)'],
                signer
            );
            
            const tx = await tokenContract.transfer(recipientAddress, amountInUnits.toString());
            const receipt = await tx.wait();
            
            return receipt.transactionHash;
        };

        // Use smart account direct execute (temporary until bundler is ready)
        let txHash: string;
        
        try {
            console.log('📤 Using smart account direct execute');
            txHash = await transferWithSmartAccount();
        } catch (smartAccountError: any) {
            console.error("❌ Smart account transfer failed:", smartAccountError);
            console.log("⚠️ Falling back to EOA transfer");
            try {
                txHash = await transferWithEOA();
            } catch (fallbackError: any) {
                throw new Error(`Token transfer failed: ${smartAccountError.message}`);
            }
        }
        
        // Enhanced success logging with transaction hash
        console.log(`✅ Token Transfer Successful:`);
        console.log(`- Transaction Hash: ${txHash}`);
        console.log(`- To: ${recipientAddress.substring(0, 8)}...`);
        console.log(`- Amount: ${amount} ${tokenSymbol} on ${chainName}`);
        console.log(`- Timestamp: ${new Date().toISOString()}`);
        
        return { transactionHash: txHash };

    } catch (error: any) {
        console.error("❌ Error in sendToken:", {
            message: error.message,
            stack: error.stack,
            details: error.details || 'No additional details',
            signature: error.signature || 'No signature'
        });
        throw new Error(`Token transfer failed: ${error.message}`);
    }
}

export async function generateUnifiedWallet(phoneNumber: string): Promise<{ address: string, privateKey: string }> {
    const salt = Date.now().toString();
    const privateKey = keccak256(toHex(`${phoneNumber}${salt}`));
    const wallet = createWalletFromPrivateKey(privateKey);
    console.log("Generated new personal account:", wallet.address);

    // Smart account creation on-demand (for now, return the EOA address)
    // Full smart account integration coming in next phase
    const smartWalletAddress = wallet.address; // EOA address for now
    console.log("Generated new unified smart wallet address:", smartWalletAddress);

    return { address: smartWalletAddress, privateKey: privateKey };
}

/**
 * Get wallet address for receiving funds
 * Returns the smart account address that can receive tokens
 */
export async function getReceiveAddress(pk: string, chainName: string = "celo"): Promise<string> {
    try {
        const nexusSDK = getAuthSDK();
        await nexusSDK.initializeWallet(pk);
        return nexusSDK.getWalletAddress();
    } catch (error: any) {
        console.error("Error getting receive address:", error);
        // Fallback to EOA address
        const wallet = createWalletFromPrivateKey(pk);
        return wallet.address;
    }
}

/**
 * Check if wallet has received funds (check balance)
 */
export async function checkReceivedFunds(
    walletAddress: string,
    chainName: string = "celo",
    tokenSymbol: TokenSymbol = "USDC"
): Promise<{ balance: number; hasFunds: boolean }> {
    try {
        const balance = await getTokenBalance(walletAddress, chainName as Chain, tokenSymbol);
        return {
            balance,
            hasFunds: balance > 0
        };
    } catch (error: any) {
        console.error("Error checking received funds:", error);
        return { balance: 0, hasFunds: false };
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
        console.error('Error in getAllTokenTransferEvents:', error);
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

        // Use ethers.js to query token balance directly
        const provider = new ethers.providers.JsonRpcProvider(chainConfig.rpcUrl);
        const tokenContract = new ethers.Contract(
            tokenConfig.address,
            ['function balanceOf(address) view returns (uint256)'],
            provider
        );

        const balance = await tokenContract.balanceOf(address);
        const balanceNumber = Number(ethers.utils.formatUnits(balance, tokenConfig.decimals));

        return balanceNumber;
    } catch (error: any) {
        console.error(`Failed to fetch ${symbol} balance on ${chain}:`, error);
        return 0;
    }
}