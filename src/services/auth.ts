import { randomInt } from "node:crypto";
import { ThirdwebClient, createThirdwebClient, defineChain } from "thirdweb";
import { privateKeyToAccount, smartWallet } from "thirdweb/wallets";
import { Wallet } from 'ethers';
import config from "../config/env";
import { SMSService } from './smsService';

let thirdwebClient: ThirdwebClient | undefined;
export const client = new Proxy({} as ThirdwebClient, {
    get(_target, property) {
        if (!thirdwebClient) {
            if (!config.THIRDWEB_SECRET_KEY) throw new Error('THIRDWEB_SECRET_KEY is required for wallet operations');
            thirdwebClient = createThirdwebClient({ secretKey: config.THIRDWEB_SECRET_KEY });
        }
        return Reflect.get(thirdwebClient, property);
    }
});

export const SALT_ROUNDS = 10;

export const otpStore: Record<string, string> = {};

export const generateOTP = (): string => randomInt(0, 1_000_000).toString().padStart(6, '0');

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
        sponsorGas: true,
        factoryAddress: '0x85e23b94e7F5E9cC1fF78BCe78cfb15B81f0DF00',
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