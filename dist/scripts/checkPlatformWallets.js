"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const platformWallet_1 = require("../services/platformWallet");
const env_1 = __importDefault(require("../config/env"));
const token_1 = require("../services/token");
// Load environment variables
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
/**
 * Main function to check platform wallet details
 */
async function checkPlatformWallets() {
    console.log('\n📊 PLATFORM WALLET STATUS CHECK');
    console.log('===============================');
    // Get a list of all supported chains
    const supportedChains = getSupportedChains();
    console.log(`\n🔗 Supported Chains (${supportedChains.length}):`);
    supportedChains.forEach(chain => {
        const chainConfig = env_1.default[chain];
        console.log(`- ${chain}: Chain ID ${chainConfig?.chainId || 'Unknown'}`);
    });
    // Get all supported tokens
    const supportedTokens = getSupportedTokens();
    console.log(`\n💰 Supported Tokens (${supportedTokens.length}):`);
    supportedTokens.forEach(token => {
        console.log(`- ${token}`);
    });
    // Check balances for each chain
    console.log('\n💼 Platform Wallet Balances:');
    for (const chain of supportedChains) {
        try {
            console.log(`\n📌 Chain: ${chain.toUpperCase()}`);
            const walletStatus = await (0, platformWallet_1.getPlatformWalletStatus)(chain);
            // Determine token type and decimals for this chain
            const tokenType = getTokenTypeForChain(chain);
            const tokenDecimals = getTokenDecimals(chain, tokenType);
            // Convert raw balance to human-readable format
            const mainBalanceFormatted = formatTokenAmount(walletStatus.main.balance, tokenDecimals);
            const feesBalanceFormatted = formatTokenAmount(walletStatus.fees.balance, tokenDecimals);
            // Show main wallet details
            console.log(`\n   Main Wallet:`);
            console.log(`   - Address: ${walletStatus.main.address}`);
            console.log(`   - Balance: ${mainBalanceFormatted} ${tokenType} (~$${mainBalanceFormatted} USD)`);
            // If there's a balance, get the latest transaction
            if (walletStatus.main.balance > 0) {
                try {
                    const txEvents = await (0, token_1.getAllTokenTransferEvents)(chain, walletStatus.main.address);
                    if (txEvents && txEvents.length > 0) {
                        const latestTx = txEvents[0];
                        console.log(`   - Latest TX: ${latestTx.hash}`);
                        console.log(`   - TX Explorer: ${generateExplorerUrl(chain, latestTx.hash)}`);
                        console.log(`   - Timestamp: ${new Date(parseInt(latestTx.timeStamp) * 1000).toISOString()}`);
                    }
                    else {
                        console.log(`   - No transaction history found`);
                    }
                }
                catch (txError) {
                    console.log(`   - Error fetching TX history: ${txError.message || String(txError)}`);
                }
            }
            // Show fees wallet details
            console.log(`\n   Fees Wallet:`);
            console.log(`   - Address: ${walletStatus.fees.address}`);
            console.log(`   - Balance: ${feesBalanceFormatted} ${tokenType} (~$${feesBalanceFormatted} USD)`);
            // If there's a balance, get the latest transaction
            if (walletStatus.fees.balance > 0) {
                try {
                    const txEvents = await (0, token_1.getAllTokenTransferEvents)(chain, walletStatus.fees.address);
                    if (txEvents && txEvents.length > 0) {
                        const latestTx = txEvents[0];
                        console.log(`   - Latest TX: ${latestTx.hash}`);
                        console.log(`   - TX Explorer: ${generateExplorerUrl(chain, latestTx.hash)}`);
                        console.log(`   - Timestamp: ${new Date(parseInt(latestTx.timeStamp) * 1000).toISOString()}`);
                    }
                    else {
                        console.log(`   - No transaction history found`);
                    }
                }
                catch (txError) {
                    console.log(`   - Error fetching TX history: ${txError.message || String(txError)}`);
                }
            }
        }
        catch (error) {
            console.log(`❌ Error checking ${chain}: ${error.message || String(error)}`);
        }
    }
}
/**
 * Format token amount with proper decimals for display
 */
function formatTokenAmount(rawAmount, decimals) {
    const formattedAmount = rawAmount / Math.pow(10, decimals);
    return formattedAmount.toFixed(decimals > 2 ? 2 : decimals); // Limit decimal places for readability
}
/**
 * Get token decimals for a specific chain and token
 */
function getTokenDecimals(chain, tokenType) {
    // Most common stable tokens use 6 decimals
    if (tokenType === 'USDC' || tokenType === 'USDT') {
        return 6;
    }
    // DAI uses 18 decimals
    if (tokenType === 'DAI') {
        return 18;
    }
    // WBTC uses 8 decimals
    if (tokenType === 'WBTC') {
        return 8;
    }
    // Default to 18 decimals for most tokens (ETH standard)
    return 18;
}
/**
 * Determine the token type for a specific chain
 */
function getTokenTypeForChain(chain) {
    // Get token address from config
    const tokenAddress = env_1.default[chain]?.tokenAddress;
    if (!tokenAddress)
        return 'Unknown';
    // Look up token type based on address (simplified version)
    // In a real implementation, this would be more comprehensive
    if (chain === 'celo') {
        // Celo stable tokens
        if (tokenAddress === '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e') {
            return 'USDT'; // This is actually USDT on Celo
        }
    }
    // Default to USDC as fallback
    return 'USDC';
}
/**
 * Get a list of all supported chains
 */
function getSupportedChains() {
    const chains = [];
    for (const key in env_1.default) {
        if (typeof env_1.default[key] === 'object' && env_1.default[key]?.chainId && env_1.default[key]?.tokenAddress) {
            chains.push(key);
        }
    }
    return chains;
}
/**
 * Get a list of all supported tokens
 */
function getSupportedTokens() {
    return ['USDC', 'USDT', 'DAI', 'WBTC', 'WETH', 'MATIC', 'ARB', 'BNB'];
}
/**
 * Generate blockchain explorer URL
 */
function generateExplorerUrl(chain, txHash) {
    const explorers = {
        'celo': 'https://explorer.celo.org/mainnet/tx/',
        'polygon': 'https://polygonscan.com/tx/',
        'arbitrum': 'https://arbiscan.io/tx/',
        'base': 'https://basescan.org/tx/',
        'optimism': 'https://optimistic.etherscan.io/tx/',
        'ethereum': 'https://etherscan.io/tx/',
        'binance': 'https://bscscan.com/tx/',
        'bnb': 'https://bscscan.com/tx/',
        'avalanche': 'https://snowtrace.io/tx/',
        'fantom': 'https://ftmscan.com/tx/',
        'gnosis': 'https://gnosisscan.io/tx/',
        'scroll': 'https://scrollscan.com/tx/',
        'moonbeam': 'https://moonbeam.moonscan.io/tx/',
        'fuse': 'https://explorer.fuse.io/tx/',
        'aurora': 'https://explorer.aurora.dev/tx/'
    };
    const baseUrl = explorers[chain] || explorers['celo']; // Default to Celo if chain not found
    return `${baseUrl}${txHash}`;
}
// Handle promise rejections
process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
    process.exit(1);
});
// Run the script
checkPlatformWallets()
    .then(() => {
    console.log('\n✅ Platform wallet check completed');
    process.exit(0);
})
    .catch(error => {
    console.error('\n❌ Error checking platform wallets:', error);
    process.exit(1);
});
