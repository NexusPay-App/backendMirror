"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const escrowModel_1 = require("../models/escrowModel");
const models_1 = require("../models/models");
const database_1 = require("../services/database");
const platformWallet_1 = require("../services/platformWallet");
/**
 * This script manually simulates an M-Pesa webhook callback for a specific transaction
 * Use when the M-Pesa sandbox returns errors but the payment was actually successful
 */
async function simulateMpesaCallback() {
    try {
        // Connect to database
        await (0, database_1.connect)();
        console.log('Connected to database');
        // Get the most recent incomplete transaction for the user
        const escrow = await escrowModel_1.Escrow.findOne({
            status: 'pending',
            type: 'fiat_to_crypto'
        }).sort({ createdAt: -1 });
        if (!escrow) {
            console.error('No pending transactions found');
            process.exit(1);
        }
        console.log('Found escrow record:', {
            transactionId: escrow.transactionId,
            userId: escrow.userId,
            amount: escrow.amount,
            cryptoAmount: escrow.cryptoAmount,
            type: escrow.type,
            metadata: escrow.metadata,
            createdAt: escrow.createdAt
        });
        // MODIFIED: Force using arbitrum chain and USDC token
        const chain = 'arbitrum';
        const tokenType = 'USDC';
        const cryptoAmount = typeof escrow.cryptoAmount === 'string' ? parseFloat(escrow.cryptoAmount) : escrow.cryptoAmount;
        // Get the user
        const user = await models_1.User.findById(escrow.userId);
        if (!user) {
            console.error(`User not found for escrow transaction: ${escrow.transactionId}`);
            process.exit(1);
        }
        // Get wallet address
        const walletAddress = user.walletAddress;
        if (!walletAddress) {
            console.error(`User ${user._id} does not have a wallet address`);
            process.exit(1);
        }
        console.log(`\n🔄 SIMULATING M-PESA PAYMENT CONFIRMATION`);
        console.log(`- Transaction ID: ${escrow.transactionId}`);
        console.log(`- M-Pesa Amount: ${escrow.amount} KES`);
        console.log(`- Crypto: ${cryptoAmount} ${tokenType} on ${chain}`);
        console.log(`- User: ${user._id} (${walletAddress.substring(0, 8)}...)`);
        // Update the escrow record to mark payment as received
        escrow.status = 'completed';
        escrow.completedAt = new Date();
        // Update metadata to ensure it uses Arbitrum chain
        if (!escrow.metadata) {
            escrow.metadata = {};
        }
        escrow.metadata.chain = chain;
        escrow.metadata.tokenType = tokenType;
        // Generate a fake M-Pesa receipt number if none exists
        if (!escrow.mpesaTransactionId) {
            escrow.mpesaTransactionId = `SIMULATED_${Date.now()}`;
        }
        await escrow.save();
        // Log blockchain transaction initiation
        console.log(`\n🔄 INITIATING BLOCKCHAIN TRANSACTION - Transaction ID: ${escrow.transactionId}`);
        console.log(`- From: Platform Wallet`);
        console.log(`- To: ${walletAddress.substring(0, 8)}...`);
        console.log(`- Amount: ${cryptoAmount} ${tokenType}`);
        console.log(`- Chain: ${chain}`);
        // Transfer the tokens from platform wallet to user wallet
        try {
            const txResult = await (0, platformWallet_1.sendTokenToUser)(walletAddress, cryptoAmount, chain, tokenType);
            const txHash = txResult.transactionHash;
            // Update escrow with blockchain transaction hash
            escrow.cryptoTransactionHash = txHash;
            await escrow.save();
            // Generate explorer URL for the transaction
            const explorerUrl = generateExplorerUrl(chain, txHash);
            // Log success
            console.log(`\n✅ BLOCKCHAIN TRANSACTION SUCCESSFUL`);
            console.log(`- Transaction Hash: ${txHash}`);
            console.log(`- Explorer URL: ${explorerUrl}`);
            console.log(`- User: ${user._id} (${walletAddress.substring(0, 8)}...)`);
            console.log(`- Amount: ${cryptoAmount} ${tokenType} on ${chain}`);
            console.log(`- USD Value: ~$${cryptoAmount}`);
            console.log(`- Status: Completed`);
            process.exit(0);
        }
        catch (error) {
            console.error(`\n❌ BLOCKCHAIN TRANSACTION FAILED:`, error);
            // Revert escrow status
            escrow.status = 'failed';
            await escrow.save();
            process.exit(1);
        }
    }
    catch (error) {
        console.error('Error in script:', error);
        process.exit(1);
    }
}
/**
 * Helper function to generate blockchain explorer URL
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
    const baseUrl = explorers[chain] || explorers['arbitrum']; // Default to Arbitrum if chain not found
    return `${baseUrl}${txHash}`;
}
// Run the function
simulateMpesaCallback();
