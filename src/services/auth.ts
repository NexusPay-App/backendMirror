import { randomInt } from "node:crypto";
import { ThirdwebClient, createThirdwebClient, defineChain } from "thirdweb";
import { createVerifiedSmartWallet } from './walletProvisioning';
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
    // Canonical derivation + write-time verification: the returned pair is
    // guaranteed to satisfy sendToken's prediction/owner checks.
    const fresh = await createVerifiedSmartWallet('ethereum');
    console.log(`Created unified account - Personal: ${fresh.personalEoa}, Smart: ${fresh.walletAddress}`);
    return { pk: fresh.privateKey, walletAddress: fresh.walletAddress };
}

// Helper function to get chain configuration by name
export function getChainConfig(chainName: string) {
    const chainConfig = config[chainName];
    if (!chainConfig || !chainConfig.chainId) {
        throw new Error(`Invalid chain configuration for ${chainName}`);
    }
    return defineChain(chainConfig.chainId);
}