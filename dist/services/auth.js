"use strict";
// import { createThirdwebClient, defineChain } from "thirdweb";
// import config from "../config/env";
// import AfricasTalking from 'africastalking';
// import { Wallet } from 'ethers';
// import { privateKeyToAccount, smartWallet } from "thirdweb/wallets";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateOTP = exports.otpStore = exports.SALT_ROUNDS = exports.africastalking = exports.client = void 0;
exports.createAccount = createAccount;
exports.getChainConfig = getChainConfig;
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
const thirdweb_1 = require("thirdweb");
const wallets_1 = require("thirdweb/wallets");
const africastalking_1 = __importDefault(require("africastalking"));
const ethers_1 = require("ethers");
const env_1 = __importDefault(require("../config/env"));
// Thirdweb client setup
exports.client = (0, thirdweb_1.createThirdwebClient)({
    secretKey: env_1.default.THIRDWEB_SECRET_KEY,
});
console.log("Thirdweb client initialized with secret key:", env_1.default.THIRDWEB_SECRET_KEY ? "present" : "missing");
// Africa's Talking setup
exports.africastalking = (0, africastalking_1.default)({
    apiKey: env_1.default.AFRICAS_TALKING_API_KEY,
    username: 'NEXUSPAY', // Your app name; use 'sandbox' for testing
});
console.log("Africa's Talking initialized with API key:", env_1.default.AFRICAS_TALKING_API_KEY ? "present" : "missing");
exports.SALT_ROUNDS = 10;
exports.otpStore = {};
const generateOTP = () => {
    let otp = '';
    for (let i = 0; i < 6; i++) {
        otp += Math.floor(Math.random() * 10).toString();
    }
    return otp;
};
exports.generateOTP = generateOTP;
// Create a unified wallet that works across all chains
async function createAccount() {
    // Create a random wallet
    const newWallet = ethers_1.Wallet.createRandom();
    const pk = newWallet.privateKey;
    const personalAccount = (0, wallets_1.privateKeyToAccount)({
        client: exports.client,
        privateKey: pk,
    });
    // Use Ethereum mainnet as the default chain for account creation
    const defaultChain = (0, thirdweb_1.defineChain)(1); // Ethereum mainnet
    // Configure the smart wallet
    const wallet = (0, wallets_1.smartWallet)({
        chain: defaultChain,
        sponsorGas: true, // Default factory address will be used
    });
    // Connect the smart wallet
    const smartAccount = await wallet.connect({
        client: exports.client,
        personalAccount,
    });
    const walletAddress = smartAccount.address;
    console.log(`Created unified account - Personal: ${personalAccount.address}, Smart: ${walletAddress}`);
    return { pk, walletAddress };
}
// Helper function to get chain configuration by name
function getChainConfig(chainName) {
    const chainConfig = env_1.default[chainName];
    if (!chainConfig || !chainConfig.chainId) {
        throw new Error(`Invalid chain configuration for ${chainName}`);
    }
    return (0, thirdweb_1.defineChain)(chainConfig.chainId);
}
