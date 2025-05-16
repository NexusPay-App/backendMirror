"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const readline_1 = __importDefault(require("readline"));
const wallets_1 = require("thirdweb/wallets");
const thirdweb_1 = require("thirdweb");
const erc20_1 = require("thirdweb/extensions/erc20");
const auth_1 = require("../services/auth");
const env_1 = __importDefault(require("../config/env"));
// Load environment variables
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
// Create a readline interface for user input
const rl = readline_1.default.createInterface({
    input: process.stdin,
    output: process.stdout
});
// MongoDB connection string
const MONGODB_URL = process.env.DEV_MONGO_URL || process.env.MONGO_URL || "mongodb+srv://productionbranch:JYDbTetcX1sPL4hc@cluster0.y6bk3ba.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
// Function to get wallet balance
async function getWalletBalance(walletAddress, chainName = 'celo') {
    try {
        const chainConfig = env_1.default[chainName];
        if (!chainConfig || !chainConfig.chainId || !chainConfig.tokenAddress) {
            throw new Error(`Invalid chain configuration for ${chainName}`);
        }
        const chain = (0, thirdweb_1.defineChain)(chainConfig.chainId);
        const tokenAddress = chainConfig.tokenAddress;
        // Get contract
        const contract = (0, thirdweb_1.getContract)({
            client: auth_1.client,
            chain,
            address: tokenAddress,
        });
        // Get balance
        const balance = await (0, erc20_1.balanceOf)({
            contract,
            address: walletAddress,
        });
        return Number(balance);
    }
    catch (error) {
        console.error(`Error getting wallet balance:`, error);
        throw error;
    }
}
// Function to transfer tokens
async function transferTokens(sourcePrivateKey, destinationAddress, amount, chainName = 'celo') {
    try {
        const chainConfig = env_1.default[chainName];
        if (!chainConfig || !chainConfig.chainId || !chainConfig.tokenAddress) {
            throw new Error(`Invalid chain configuration for ${chainName}`);
        }
        const chain = (0, thirdweb_1.defineChain)(chainConfig.chainId);
        const tokenAddress = chainConfig.tokenAddress;
        // Create wallet from private key
        const personalAccount = (0, wallets_1.privateKeyToAccount)({
            client: auth_1.client,
            privateKey: sourcePrivateKey
        });
        // Connect the smart wallet
        const wallet = (0, wallets_1.smartWallet)({
            chain,
            sponsorGas: true,
        });
        const smartAccount = await wallet.connect({
            client: auth_1.client,
            personalAccount,
        });
        // Get contract
        const contract = (0, thirdweb_1.getContract)({
            client: auth_1.client,
            chain,
            address: tokenAddress,
        });
        // Transfer tokens
        const transaction = (0, erc20_1.transfer)({
            contract,
            to: destinationAddress,
            amount,
        });
        // Execute transaction
        const tx = await (0, thirdweb_1.sendTransaction)({
            transaction,
            account: smartAccount,
        });
        return { transactionHash: tx.transactionHash };
    }
    catch (error) {
        console.error(`Error transferring tokens:`, error);
        throw error;
    }
}
async function main() {
    try {
        // Get platform wallet details from environment variables
        const platformWalletAddress = process.env.DEV_PLATFORM_WALLET_ADDRESS;
        const platformWalletPrivateKey = process.env.DEV_PLATFORM_WALLET_PRIVATE_KEY;
        const feesWalletAddress = process.env.FEES_WALLET_ADDRESS;
        if (!platformWalletAddress || !platformWalletPrivateKey || !feesWalletAddress) {
            console.error('❌ Platform wallet configuration not found in .env file');
            process.exit(1);
        }
        console.log('📝 Platform Wallet Funding Tool');
        console.log('===============================');
        // Check current balances
        console.log('Checking current wallet balances...');
        const mainBalanceBefore = await getWalletBalance(platformWalletAddress);
        const feesBalanceBefore = await getWalletBalance(feesWalletAddress);
        console.log(`Main wallet (${platformWalletAddress}) balance: ${mainBalanceBefore}`);
        console.log(`Fees wallet (${feesWalletAddress}) balance: ${feesBalanceBefore}`);
        // Menu options
        console.log('\nChoose an option:');
        console.log('1. Fund main platform wallet (requires an external funded wallet)');
        console.log('2. Fund fees wallet from main platform wallet');
        console.log('3. Fund a specific wallet address');
        rl.question('\nEnter your choice (1-3): ', async (choice) => {
            switch (choice) {
                case '1':
                    // Fund main platform wallet
                    rl.question('Enter the private key of the source wallet: ', async (sourcePrivateKey) => {
                        rl.question('Enter the amount to transfer: ', async (amountStr) => {
                            const amount = parseFloat(amountStr);
                            if (isNaN(amount) || amount <= 0) {
                                console.error('❌ Invalid amount');
                                rl.close();
                                process.exit(1);
                            }
                            console.log(`\nTransferring ${amount} tokens to main platform wallet...`);
                            try {
                                const result = await transferTokens(sourcePrivateKey, platformWalletAddress, amount);
                                console.log('✅ Transfer completed successfully');
                                console.log('Transaction hash:', result.transactionHash);
                                // Check new balance
                                const newBalance = await getWalletBalance(platformWalletAddress);
                                console.log(`\nUpdated main wallet balance: ${newBalance}`);
                                rl.close();
                            }
                            catch (error) {
                                console.error('❌ Transfer failed:', error);
                                rl.close();
                                process.exit(1);
                            }
                        });
                    });
                    break;
                case '2':
                    // Fund fees wallet from main platform wallet
                    rl.question('Enter the amount to transfer to fees wallet: ', async (amountStr) => {
                        const amount = parseFloat(amountStr);
                        if (isNaN(amount) || amount <= 0) {
                            console.error('❌ Invalid amount');
                            rl.close();
                            process.exit(1);
                        }
                        if (mainBalanceBefore < amount) {
                            console.error(`❌ Insufficient balance in main wallet. Available: ${mainBalanceBefore}, Requested: ${amount}`);
                            rl.close();
                            process.exit(1);
                        }
                        console.log(`\nTransferring ${amount} tokens from main wallet to fees wallet...`);
                        try {
                            const result = await transferTokens(platformWalletPrivateKey, feesWalletAddress, amount);
                            console.log('✅ Transfer completed successfully');
                            console.log('Transaction hash:', result.transactionHash);
                            // Check new balances
                            const mainBalanceAfter = await getWalletBalance(platformWalletAddress);
                            const feesBalanceAfter = await getWalletBalance(feesWalletAddress);
                            console.log(`\nUpdated main wallet balance: ${mainBalanceAfter}`);
                            console.log(`Updated fees wallet balance: ${feesBalanceAfter}`);
                            rl.close();
                        }
                        catch (error) {
                            console.error('❌ Transfer failed:', error);
                            rl.close();
                            process.exit(1);
                        }
                    });
                    break;
                case '3':
                    // Fund a specific wallet
                    rl.question('Enter the destination wallet address: ', async (destinationAddress) => {
                        rl.question('Enter the amount to transfer: ', async (amountStr) => {
                            const amount = parseFloat(amountStr);
                            if (isNaN(amount) || amount <= 0) {
                                console.error('❌ Invalid amount');
                                rl.close();
                                process.exit(1);
                            }
                            if (mainBalanceBefore < amount) {
                                console.error(`❌ Insufficient balance in main wallet. Available: ${mainBalanceBefore}, Requested: ${amount}`);
                                rl.close();
                                process.exit(1);
                            }
                            console.log(`\nTransferring ${amount} tokens from main wallet to ${destinationAddress}...`);
                            try {
                                const result = await transferTokens(platformWalletPrivateKey, destinationAddress, amount);
                                console.log('✅ Transfer completed successfully');
                                console.log('Transaction hash:', result.transactionHash);
                                // Check new balance of destination
                                const destBalance = await getWalletBalance(destinationAddress);
                                console.log(`\nDestination wallet balance: ${destBalance}`);
                                rl.close();
                            }
                            catch (error) {
                                console.error('❌ Transfer failed:', error);
                                rl.close();
                                process.exit(1);
                            }
                        });
                    });
                    break;
                default:
                    console.error('❌ Invalid choice');
                    rl.close();
                    process.exit(1);
            }
        });
    }
    catch (error) {
        console.error('❌ Error:', error);
        rl.close();
        process.exit(1);
    }
}
// Run the script
main();
