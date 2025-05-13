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

import { Chain, TokenSymbol, TokenTransferEvent } from '../types/token';
import { client } from './auth';
import { privateKeyToAccount, smartWallet } from "thirdweb/wallets";
import { defineChain, getContract, sendTransaction, waitForReceipt, readContract } from "thirdweb";
import { transfer, approve, allowance } from "thirdweb/extensions/erc20";
import config from "../config/env";
import { keccak256, toHex } from "thirdweb/utils";
import { getTokenConfig, getTokenAddress, getTokenDecimals } from "../config/tokens";

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

        // Get token configuration
        const tokenConfig = getTokenConfig(chainName as Chain, tokenSymbol);
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
        const chainConfig = config[chainName];
        if (!chainConfig || !chainConfig.chainId) {
            throw new Error(`Invalid chain configuration for ${chainName}`);
        }

        const chain = defineChain(chainConfig.chainId);
        console.log(`Chain ID for ${chainName}: ${chainConfig.chainId}`);
        const tokenAddress = tokenConfig.address;
        console.log(`Token address for ${tokenSymbol} on ${chainName}: ${tokenAddress}`);

        // Initialize accounts and contract
        const personalAccount = privateKeyToAccount({ client, privateKey: pk });
        const wallet = smartWallet({
            chain,
            sponsorGas: false,
        });
        const smartAccount = await wallet.connect({ client, personalAccount });
        const contract = getContract({
            client,
            chain,
            address: tokenAddress,
        });

        // Convert amount to token units
        const decimals = tokenConfig.decimals;
        const amountInUnits = BigInt(Math.floor(amount * 10 ** decimals));

        // Check and handle allowance
        let currentAllowance: bigint = BigInt(0);
        try {
            currentAllowance = await allowance({
                contract,
                owner: personalAccount.address,
                spender: smartAccount.address,
            });
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error("Allowance check failed, assuming 0:", errorMessage);
        }

        if (currentAllowance < amountInUnits) {
            console.log("Insufficient allowance. Approving transfer...");
            const approveTx = await sendTransaction({
                transaction: approve({
                    contract,
                    spender: smartAccount.address,
                    amount: amount,
                }),
                account: smartAccount,
            });
            await waitForReceipt(approveTx);
        }

        // Execute transfer
        const transferTx = await sendTransaction({
            transaction: transfer({
                contract,
                to: recipientAddress,
                amount: amount,
            }),
            account: smartAccount,
        });

        await waitForReceipt(transferTx);
        return { transactionHash: transferTx.transactionHash };

    } catch (error: any) {
        console.error("Error in sendToken:", {
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
    const newAccount = privateKeyToAccount({ client, privateKey });
    console.log("Generated new personal account:", newAccount.address);

    const chain = defineChain(42161); // Arbitrum as reference chain
    const wallet = smartWallet({
        chain,
        // factoryAddress removed to use default
        sponsorGas: false, // Switch to true when paymaster is funded
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
            sponsorGas: false, // Switch to true when paymaster is funded
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
            sponsorGas: false, // Switch to true when paymaster is funded
        });

        const smartAccount = await wallet.connect({ client, personalAccount });
        console.log("Source unified smart account address:", smartAccount.address);

        const contract = getContract({
            client,
            chain,
            address: tokenAddress,
        });

        const balance = await readContract({
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

        const transferTx = await sendTransaction({
            transaction: transfer({
                contract,
                to: toAddress,
                amount: balanceInUSDC,
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
        arbitrum: '44UDQIEKU98ZQ559DWX4ZUZJC5EBK8XUU4',
        celo: 'Z349YD6992FHPR3V7SMTS62X1TS52EV5KT',
        optimism: config.OPTIMISM_API_KEY || '',
        polygon: config.POLYGON_API_KEY || '',
        base: config.BASE_API_KEY || '',
        avalanche: config.AVALANCHE_API_KEY || '',
        bnb: config.BNB_API_KEY || '',
        scroll: config.SCROLL_API_KEY || '',
        gnosis: config.GNOSIS_API_KEY || '',
        fantom: config.FANTOM_API_KEY || '',
        moonbeam: config.MOONBEAM_API_KEY || '',
        fuse: config.FUSE_API_KEY || '',
        aurora: config.AURORA_API_KEY || '',
        somnia: config.SOMNIA_API_KEY || '',  // Added Somnia API key
        lisk: ''     // Lisk might use a different API structure
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
        return data.result as TokenTransferEvent[];
    } catch (error) {
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

        const balance = await readContract({
            contract,
            method: "function balanceOf(address) view returns (uint256)",
            params: [address],
        });

        return Number(balance.toString()) / 10 ** tokenConfig.decimals;
    } catch (error: any) {
        console.error(`Failed to fetch ${symbol} balance on ${chain}:`, error);
        return 0;
    }
}