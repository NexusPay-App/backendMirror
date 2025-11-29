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
import { createRandomWallet, createWalletFromPrivateKey, createNexusSDKInstance, NEXUS_API_CONFIG } from '../utils/nexusHelper';
import { Wallet } from 'ethers';
import config from "../config/env";
import { SMSService } from './smsService';
import { NexusSDK } from '@nexus/nexuscore';

// NexusCore SDK instance - lazy initialized when needed
let _nexusSDK: NexusSDK | null = null;

/**
 * Get or create NexusCore SDK instance for account operations
 */
function getNexusSDK(): NexusSDK {
    if (!_nexusSDK) {
        try {
            _nexusSDK = createNexusSDKInstance();
            console.log("✅ NexusCore SDK initialized for Beach project");
        } catch (error) {
            console.error("❌ Failed to initialize NexusCore SDK:", error);
            throw error;
        }
    }
    return _nexusSDK;
}

// Export SDK getter
export const getAuthSDK = getNexusSDK;

// Export lazy-loaded client for backward compatibility (deprecated - use getAuthSDK)
export const client = new Proxy({} as any, {
    get(target, prop) {
        console.warn("⚠️ Using deprecated 'client' export. Use getAuthSDK() instead.");
        const sdk = getNexusSDK();
        return sdk[prop];
    }
});

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

/**
 * Create a smart account using NexusCore SDK
 * This creates an ERC-4337 smart contract wallet with gas sponsorship
 */
export async function createAccount(chainName: string = 'sepolia'): Promise<{ pk: string; walletAddress: string; smartAccountAddress?: string }> {
    try {
        // Get NexusCore SDK instance
        const nexusSDK = getNexusSDK();
        
        // Create a random EOA wallet (personal account)
        const personalWallet = createRandomWallet();
        const pk = personalWallet.privateKey;
        const eoaAddress = personalWallet.address;

        console.log(`🔐 Creating smart account for chain: ${chainName}`);
        console.log(`   Personal Account (EOA): ${eoaAddress}`);

        // Get chain configuration
        const chainConfig = config[chainName];
        if (!chainConfig || !chainConfig.chainId) {
            throw new Error(`Invalid chain configuration for ${chainName}`);
        }

        // Initialize wallet with NexusCore SDK (creates smart account)
        // The SDK will create a smart contract wallet that can be used across chains
        const smartAccountAddress = await nexusSDK.initializeWallet(pk);
        
        console.log(`✅ Smart Account Created:`);
        console.log(`   Personal (EOA): ${eoaAddress}`);
        console.log(`   Smart Account: ${smartAccountAddress}`);
        console.log(`   Chain: ${chainName} (${chainConfig.chainId})`);

        return {
            pk,
            walletAddress: smartAccountAddress, // Return smart account address as primary
            smartAccountAddress
        };
    } catch (error: any) {
        console.error("❌ Error creating smart account:", error);
        
        // Fallback to EOA if smart account creation fails
        console.warn("⚠️ Falling back to EOA wallet creation");
        const wallet = createRandomWallet();
        return {
            pk: wallet.privateKey,
            walletAddress: wallet.address
        };
    }
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