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

// Migrated from Thirdweb to NexusCore API
import { createRandomWallet, createWalletFromPrivateKey, NEXUS_API_CONFIG } from '../utils/nexusHelper';
import { Wallet } from 'ethers';
import config from "../config/env";
import { SMSService } from './smsService';

// For backward compatibility with old ThirdWeb code
export const client = { _isDeprecated: true };

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
 * Create a smart account using NexusCore API
 * This creates an ERC-4337 smart contract wallet with gas sponsorship
 * Contracts are deployed on Sepolia (11155111) and Arbitrum Sepolia (421614)
 */
export async function createAccount(chainName: string = 'sepolia'): Promise<{ pk: string; walletAddress: string; smartAccountAddress?: string }> {
    try {
        // Create a random EOA wallet (personal account/owner)
        const personalWallet = createRandomWallet();
        const pk = personalWallet.privateKey;
        const eoaAddress = personalWallet.address;

        console.log(`🔐 Creating smart account for chain: ${chainName}`);
        console.log(`   Owner (EOA): ${eoaAddress}`);

        // Map chain name to chain ID
        const chainIdMap: Record<string, number> = {
            'sepolia': 11155111,
            'arbitrum-sepolia': 421614,
            'arbitrum': 42161, // Mainnet, but we'll use testnet
        };

        // Default to Sepolia if chain not recognized
        const chainId = chainIdMap[chainName.toLowerCase()] || 11155111;
        const actualChainName = chainId === 11155111 ? 'sepolia' : 'arbitrum-sepolia';

        console.log(`   Using chain: ${actualChainName} (${chainId})`);

        // Use NexusCore API to create smart account
        const { NEXUS_API_CONFIG } = await import('../utils/nexusHelper');
        
        try {
            // Call NexusCore API to create smart account
            // The route is /api/accounts (base URL is http://localhost:3000)
            const apiBaseUrl = NEXUS_API_CONFIG.apiBaseUrl.replace('/api/v1', '');
            const response = await fetch(`${apiBaseUrl}/api/accounts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': NEXUS_API_CONFIG.apiKey,
                },
                body: JSON.stringify({
                    projectId: NEXUS_API_CONFIG.projectId,
                    chainId: chainId,
                    owner: eoaAddress,
                    salt: Date.now().toString(), // Use timestamp as salt for uniqueness
                    accountType: 'SIMPLE'
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
                throw new Error(`NexusCore API error: ${errorData.message || response.statusText}`);
            }

            const accountData = await response.json();
            const smartAccountAddress = accountData.account?.address || accountData.address;

            if (!smartAccountAddress) {
                throw new Error('No smart account address returned from API');
            }

            console.log(`✅ Smart Account Created:`);
            console.log(`   Owner (EOA): ${eoaAddress}`);
            console.log(`   Smart Wallet: ${smartAccountAddress}`);
            console.log(`   Chain: ${actualChainName} (${chainId})`);
            console.log(`   Deployed: ${accountData.account?.isDeployed || accountData.isDeployed || false}`);

            return {
                pk,
                walletAddress: smartAccountAddress, // Return smart wallet address
                smartAccountAddress: smartAccountAddress
            };
        } catch (apiError: any) {
            console.error("❌ NexusCore API error:", apiError.message);
            console.warn("⚠️ Falling back to EOA wallet (smart account will be created on first transaction)");
            
            // Fallback: return EOA address if API fails
            // The smart wallet will be created when user makes their first transaction
            return {
                pk,
                walletAddress: eoaAddress, // Return EOA as fallback
                smartAccountAddress: undefined
            };
        }
    } catch (error: any) {
        console.error("❌ Error creating account:", error);
        console.error("   Error details:", error.message);
        
        // Final fallback to basic EOA wallet creation
        console.warn("⚠️ Falling back to basic wallet creation");
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