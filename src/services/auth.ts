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

import { ThirdwebClient, createThirdwebClient, defineChain } from "thirdweb";
import { privateKeyToAccount, smartWallet } from "thirdweb/wallets";
import { Wallet } from 'ethers';
import config from "../config/env";
import { SMSService } from './smsService';

// Thirdweb client setup
export const client: ThirdwebClient = createThirdwebClient({
    secretKey: config.THIRDWEB_SECRET_KEY as string,
});
console.log("Thirdweb client initialized with secret key:", config.THIRDWEB_SECRET_KEY ? "present" : "missing");

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
    // Create a random wallet
    const newWallet = Wallet.createRandom();
    const pk = newWallet.privateKey;
    const personalAccount = privateKeyToAccount({
        client,
        privateKey: pk as string,
    });

    // Use Ethereum mainnet as the default chain for account creation
    const defaultChain = defineChain(1); // Ethereum mainnet

    // Configure the smart wallet
    const wallet = smartWallet({
        chain: defaultChain,
        sponsorGas: true, // Default factory address will be used
    });

    // Connect the smart wallet
    const smartAccount = await wallet.connect({
        client,
        personalAccount,
    });
    
    const walletAddress = smartAccount.address;

    console.log(`Created unified account - Personal: ${personalAccount.address}, Smart: ${walletAddress}`);

    return { pk, walletAddress };
}

// Helper function to get chain configuration by name
export function getChainConfig(chainName: string) {
    const chainConfig = config[chainName];
    if (!chainConfig || !chainConfig.chainId) {
        throw new Error(`Invalid chain configuration for ${chainName}`);
    }
    return defineChain(chainConfig.chainId);
}