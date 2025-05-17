"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const escrowModel_1 = require("../models/escrowModel");
const models_1 = require("../models/models");
const database_1 = require("../services/database");
const platformWallet_1 = require("../services/platformWallet");
const transactionId = '3c5c18c9-7f26-4a80-aa18-755848e2b54b';
async function completeTransaction() {
    try {
        // Connect to database
        await (0, database_1.connect)();
        console.log('Connected to database');
        // Find the escrow record without populating userId
        const escrow = await escrowModel_1.Escrow.findOne({ transactionId });
        if (!escrow) {
            console.error(`No escrow found with transaction ID: ${transactionId}`);
            process.exit(1);
        }
        console.log('Found escrow record:', {
            transactionId: escrow.transactionId,
            userId: escrow.userId,
            status: escrow.status,
            amount: escrow.amount,
            cryptoAmount: escrow.cryptoAmount,
            type: escrow.type,
            metadata: escrow.metadata
        });
        if (escrow.status === 'completed') {
            console.log('Transaction is already completed');
            process.exit(0);
        }
        // Find the user manually
        const user = await models_1.User.findById(escrow.userId);
        if (!user) {
            console.error(`User not found with ID: ${escrow.userId}`);
            process.exit(1);
        }
        const userWalletAddress = user.walletAddress;
        if (!userWalletAddress) {
            console.error('User does not have a wallet address');
            process.exit(1);
        }
        console.log(`User wallet address: ${userWalletAddress}`);
        // Extract crypto amount, chain and token type
        const cryptoAmount = escrow.cryptoAmount;
        const chain = escrow.metadata?.chain || 'celo';
        const tokenType = escrow.metadata?.tokenType || 'USDC';
        console.log(`Attempting to send ${cryptoAmount} ${tokenType} on ${chain} to ${userWalletAddress}`);
        // Send token to user
        const result = await (0, platformWallet_1.sendTokenToUser)(userWalletAddress, cryptoAmount, chain, tokenType);
        console.log('Token transfer successful:', result);
        // Update escrow record
        escrow.status = 'completed';
        escrow.completedAt = new Date();
        escrow.cryptoTransactionHash = result.transactionHash;
        await escrow.save();
        console.log('Escrow record updated successfully');
        console.log(`Transaction ${transactionId} completed successfully`);
        process.exit(0);
    }
    catch (error) {
        console.error('Error completing transaction:', error);
        process.exit(1);
    }
}
// Run the function
completeTransaction();
