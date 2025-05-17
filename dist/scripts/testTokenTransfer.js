"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../services/database");
const platformWallet_1 = require("../services/platformWallet");
const getTokenBalance_1 = require("./helpers/getTokenBalance");
const tokens_1 = require("../config/tokens");
const USER_WALLET_ADDRESS = '0x31c41BCa835C0d3c597cbBaFf2e8dBF973645fb4'; // Griffin's wallet
const CHAIN = 'arbitrum';
const TOKEN = 'USDC';
const AMOUNT = 0.001; // Very small test amount
/**
 * Test transferring a token from platform wallet to user wallet
 */
async function testTokenTransfer() {
    try {
        // Connect to database
        await (0, database_1.connect)();
        console.log('Connected to database');
        // Initialize platform wallets
        const platformWallets = await (0, platformWallet_1.initializePlatformWallets)();
        console.log(`Platform main wallet: ${platformWallets.main.address}`);
        // Get token configuration to check decimals
        const tokenConfig = (0, tokens_1.getTokenConfig)(CHAIN, TOKEN);
        if (!tokenConfig) {
            console.error(`Token ${TOKEN} not supported on chain ${CHAIN}`);
            process.exit(1);
        }
        console.log(`Token ${TOKEN} on ${CHAIN} has ${tokenConfig.decimals} decimals`);
        console.log(`Contract address: ${tokenConfig.address}`);
        // Check platform wallet balance
        const platformBalance = await (0, getTokenBalance_1.getTokenBalanceOnChain)(platformWallets.main.address, CHAIN, TOKEN);
        console.log(`Platform wallet ${TOKEN} balance on ${CHAIN}: ${platformBalance}`);
        if (platformBalance < AMOUNT) {
            console.error(`❌ Insufficient balance: ${platformBalance} < ${AMOUNT}`);
            process.exit(1);
        }
        // Check current user balance
        const userBalance = await (0, getTokenBalance_1.getTokenBalanceOnChain)(USER_WALLET_ADDRESS, CHAIN, TOKEN);
        console.log(`User wallet ${TOKEN} balance on ${CHAIN}: ${userBalance}`);
        console.log(`Attempting to transfer ${AMOUNT} ${TOKEN} on ${CHAIN} to ${USER_WALLET_ADDRESS}`);
        // In case the platform wallet service has a similar decimal issue, 
        // prepare an alternative approach using the raw value directly
        // But first try the normal way
        try {
            // Transfer tokens - regular way
            const result = await (0, platformWallet_1.sendTokenToUser)(USER_WALLET_ADDRESS, AMOUNT, CHAIN, TOKEN);
            console.log(`✅ Transfer successful!`);
            console.log(`Transaction hash: ${result.transactionHash}`);
            console.log(`Explorer URL: https://arbiscan.io/tx/${result.transactionHash}`);
        }
        catch (error) {
            console.error('Regular transfer failed:', error);
            // If that fails, exit with error
            process.exit(1);
        }
        // Check updated user balance
        const newUserBalance = await (0, getTokenBalance_1.getTokenBalanceOnChain)(USER_WALLET_ADDRESS, CHAIN, TOKEN);
        console.log(`New user wallet ${TOKEN} balance on ${CHAIN}: ${newUserBalance}`);
        console.log(`Balance change: ${newUserBalance - userBalance}`);
        process.exit(0);
    }
    catch (error) {
        console.error('Error testing token transfer:', error);
        process.exit(1);
    }
}
// Run the function
testTokenTransfer();
