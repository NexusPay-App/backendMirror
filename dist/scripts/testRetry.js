"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/scripts/testRetry.ts
const mongoose_1 = __importDefault(require("mongoose"));
const escrowModel_1 = require("../models/escrowModel");
const mpesaRetry_1 = require("../services/mpesaRetry");
const dotenv_1 = require("dotenv");
const crypto_1 = require("crypto");
// Load environment variables
(0, dotenv_1.config)();
// Connect to the database
async function connect() {
    try {
        const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/nexuspay';
        await mongoose_1.default.connect(uri);
        console.log('Connected to MongoDB');
    }
    catch (error) {
        console.error('Error connecting to MongoDB:', error);
        process.exit(1);
    }
}
// Create a test failed transaction
async function createTestFailedTransaction() {
    try {
        // Create a random user ID (this is just for testing)
        const userId = new mongoose_1.default.Types.ObjectId();
        // Create a new escrow record with failed status
        const escrow = new escrowModel_1.Escrow({
            transactionId: (0, crypto_1.randomUUID)(),
            userId,
            amount: 100, // 100 KES
            cryptoAmount: 1.23, // Arbitrary crypto amount
            type: 'fiat_to_crypto',
            status: 'failed',
            retryCount: 0,
            createdAt: new Date()
        });
        await escrow.save();
        console.log('✅ Test failed transaction created:', escrow.transactionId);
        return escrow;
    }
    catch (error) {
        console.error('❌ Error creating test transaction:', error);
        throw error;
    }
}
// Main function to run the test
async function main() {
    try {
        await connect();
        // Create a test transaction
        const testTransaction = await createTestFailedTransaction();
        console.log('Test transaction details:');
        console.log('- ID:', testTransaction.transactionId);
        console.log('- Status:', testTransaction.status);
        console.log('- Retry Count:', testTransaction.retryCount);
        // Wait 2 seconds before running retry
        console.log('Waiting 2 seconds before testing retry mechanism...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        // Run the retry mechanism
        console.log('Starting retry operation...');
        await (0, mpesaRetry_1.retryAllFailedTransactions)();
        // Check the transaction status after retry
        const updatedTransaction = await escrowModel_1.Escrow.findOne({ transactionId: testTransaction.transactionId });
        console.log('\nTransaction after retry attempt:');
        console.log('- ID:', updatedTransaction?.transactionId);
        console.log('- Status:', updatedTransaction?.status);
        console.log('- Retry Count:', updatedTransaction?.retryCount);
        console.log('- Last Retry At:', updatedTransaction?.lastRetryAt);
        // Exit the process
        console.log('\nTest completed. Exiting...');
        process.exit(0);
    }
    catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}
// Run the main function
main();
