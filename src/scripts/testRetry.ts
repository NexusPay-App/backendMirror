// src/scripts/testRetry.ts
import mongoose from 'mongoose';
import { Escrow } from '../models/escrowModel';
import { retryAllFailedTransactions } from '../services/mpesaRetry';
import { config } from 'dotenv';
import { randomUUID } from 'crypto';

// Load environment variables
config();

// Connect to the database
async function connect() {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/nexuspay';
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1);
  }
}

// Create a test failed transaction
async function createTestFailedTransaction() {
  try {
    // Create a random user ID (this is just for testing)
    const userId = new mongoose.Types.ObjectId();
    
    // Create a new escrow record with failed status
    const escrow = new Escrow({
      transactionId: randomUUID(),
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
  } catch (error) {
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
    await retryAllFailedTransactions();
    
    // Check the transaction status after retry
    const updatedTransaction = await Escrow.findOne({ transactionId: testTransaction.transactionId });
    
    console.log('\nTransaction after retry attempt:');
    console.log('- ID:', updatedTransaction?.transactionId);
    console.log('- Status:', updatedTransaction?.status);
    console.log('- Retry Count:', updatedTransaction?.retryCount);
    console.log('- Last Retry At:', updatedTransaction?.lastRetryAt);
    
    // Exit the process
    console.log('\nTest completed. Exiting...');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the main function
main(); 