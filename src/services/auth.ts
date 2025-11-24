// import { createThirdwebClient, defineChain } from "thirdweb";
// import config from "../config/env";
// import AfricasTalking from 'africastalking';
// import { Wallet } from 'ethers';
// import { privateKeyToAccount, smartWallet } from "thirdweb/wallets";

// export const africastalking = AfricasTalking({
//     apiKey: config.AFRICAS_TALKING_API_KEY,
//     username: 'NEXUSPAY'
// });

// export const SALT_ROUNDS = 10;

// export const otpStore: Record<string, string> = {};

// // Helper function to generate OTP
// export const generateOTP = (): string => {
//     let otp = '';
//     for (let i = 0; i < 6; i++) {
//         otp += Math.floor(Math.random() * 10).toString();
//     }
//     return otp;
// };

// export const client = createThirdwebClient({
//     secretKey: config.THIRDWEB_SECRET_KEY as string,
// });

// export async function createAccount(chainName: string = "celo") {

//     const chain = defineChain(config[chainName].chainId)
//     const newWallet = Wallet.createRandom();
//     const pk = newWallet.privateKey
//     const personalAccount = privateKeyToAccount({
//         client,
//         privateKey: pk as string,
//     });

//     // Configure the smart wallet
//     const wallet = smartWallet({
//         chain: chain,
//         sponsorGas: false,
//     });

//     // Connect the smart wallet
//     const smartAccount = await wallet.connect({
//         client,
//         personalAccount,
//     });
//     let walletAddress = smartAccount.address

//     return { pk, walletAddress };
// }

// Migrated from Thirdweb to NexusCore SDK
import { createRandomWallet, createWalletFromPrivateKey, createNexusClient } from '../utils/nexusHelper';
import { Wallet } from 'ethers';
import config from "../config/env";
import { SMSService } from './smsService';

// NexusCore client setup - using Sepolia for account creation
export const client = createNexusClient('sepolia');
console.log("NexusCore client initialized for chain: sepolia");

// Africa's Talking setup - now handled by SMSService
console.log("Africa's Talking initialized with API key:", config.AFRICAS_TALKING_API_KEY ? "present" : "missing");

export const SALT_ROUNDS = 10;

export const otpStore: Record<string, string> = {};

export const generateOTP = (): string => {
    let otp = '';
    for (let i = 0; i < 6; i++) {
        otp += Math.floor(Math.random() * 10).toString();
    }
    return otp;
};

// Create a unified wallet that works across all chains
export async function createAccount() {
    // Create a random wallet using NexusCore
    const wallet = createRandomWallet();
    const pk = wallet.privateKey;
    
    // For now, return the EOA address as the wallet address
    // Smart account creation will happen on-demand when needed for transactions
    const walletAddress = wallet.address;

    console.log(`Created unified account - Personal: ${wallet.address}, Smart: (created on-demand)`);

    return { pk, walletAddress };
}

// Helper function to get chain configuration by name
export function getChainConfig(chainName: string) {
    const chainConfig = config[chainName];
    if (!chainConfig || !chainConfig.chainId) {
        throw new Error(`Invalid chain configuration for ${chainName}`);
    }
    // Return the chain name directly - NexusCore handles chain configuration internally
    return chainName;
}