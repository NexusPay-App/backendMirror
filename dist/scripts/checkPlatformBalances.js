"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../services/database");
const platformWallet_1 = require("../services/platformWallet");
const getTokenBalance_1 = require("./helpers/getTokenBalance");
/**
 * Script to check platform wallet balances across all supported chains
 */
async function checkPlatformBalances() {
    try {
        // Connect to database
        await (0, database_1.connect)();
        console.log('Connected to database');
        // Initialize platform wallets
        const platformWallets = await (0, platformWallet_1.initializePlatformWallets)();
        console.log('\n👛 PLATFORM WALLET ADDRESSES:');
        console.log(`- Main Wallet: ${platformWallets.main.address}`);
        console.log(`- Fees Wallet: ${platformWallets.fees.address}`);
        // Define chains and tokens to check
        const chains = ['celo', 'arbitrum', 'polygon', 'base', 'optimism', 'ethereum', 'bnb'];
        const tokens = ['USDC', 'USDT', 'WETH'];
        console.log('\n💰 CHECKING BALANCES:');
        // Check each chain
        for (const chain of chains) {
            console.log(`\n🔗 Chain: ${chain.toUpperCase()}`);
            // Check each token
            for (const token of tokens) {
                try {
                    const balance = await (0, getTokenBalance_1.getTokenBalanceOnChain)(platformWallets.main.address, chain, token);
                    console.log(`  - ${token}: ${balance}`);
                    // Additional information for non-zero balances
                    if (balance > 0) {
                        console.log(`    ✅ Platform can send up to ${balance} ${token} on ${chain}`);
                    }
                }
                catch (error) {
                    console.log(`  - ${token}: Error checking balance`);
                }
            }
        }
        process.exit(0);
    }
    catch (error) {
        console.error('Error checking balances:', error);
        process.exit(1);
    }
}
// Run the function
checkPlatformBalances();
