import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import readline from 'readline';
import { User } from '../models/models';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Create a readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// MongoDB connection string
const MONGODB_URL = process.env.DEV_MONGO_URL || process.env.MONGO_URL || "mongodb+srv://productionbranch:JYDbTetcX1sPL4hc@cluster0.y6bk3ba.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// Get escrow model
const escrowSchema = new mongoose.Schema({
    transactionId: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    cryptoAmount: { type: mongoose.Schema.Types.Mixed, required: true },
    type: { 
        type: String, 
        enum: ['fiat_to_crypto', 'crypto_to_fiat', 'crypto_to_paybill', 'crypto_to_till'],
        required: true 
    },
    status: { 
        type: String, 
        enum: ['pending', 'completed', 'failed'],
        default: 'pending'
    },
    mpesaTransactionId: String,
    cryptoTransactionHash: String,
    paybillNumber: String,
    accountNumber: String,
    tillNumber: String,
    retryCount: { type: Number, default: 0 },
    lastRetryAt: Date,
    createdAt: { type: Date, default: Date.now },
    completedAt: Date
});

const Escrow = mongoose.model('Escrow', escrowSchema);

async function main() {
  try {
    console.log(`Connecting to MongoDB at: ${MONGODB_URL}`);
    await mongoose.connect(MONGODB_URL);
    console.log('Connected to MongoDB');
    
    console.log('\nEscrow Transaction Query Tool');
    console.log('===============================');
    console.log('Choose a filter option:');
    console.log('1. View all transactions (latest first)');
    console.log('2. Filter by status (pending/completed/failed)');
    console.log('3. Filter by type (fiat_to_crypto/crypto_to_fiat/etc)');
    console.log('4. Find transaction by ID');
    console.log('5. Retry a failed transaction');
    
    rl.question('\nSelect option (1-5): ', async (option) => {
      switch (option) {
        case '1':
          // View all transactions
          await listAllTransactions();
          break;
          
        case '2':
          // Filter by status
          rl.question('Enter status (pending/completed/failed): ', async (status) => {
            if (!['pending', 'completed', 'failed'].includes(status)) {
              console.error('❌ Invalid status');
              rl.close();
              await mongoose.disconnect();
              return;
            }
            
            await listTransactionsByStatus(status);
          });
          break;
          
        case '3':
          // Filter by type
          rl.question('Enter type (fiat_to_crypto/crypto_to_fiat/crypto_to_paybill/crypto_to_till): ', async (type) => {
            if (!['fiat_to_crypto', 'crypto_to_fiat', 'crypto_to_paybill', 'crypto_to_till'].includes(type)) {
              console.error('❌ Invalid type');
              rl.close();
              await mongoose.disconnect();
              return;
            }
            
            await listTransactionsByType(type);
          });
          break;
          
        case '4':
          // Find by ID
          rl.question('Enter transaction ID: ', async (id) => {
            await findTransactionById(id);
          });
          break;
          
        case '5':
          // Retry a failed transaction
          rl.question('Enter transaction ID to retry: ', async (id) => {
            await retryFailedTransaction(id);
          });
          break;
          
        default:
          console.error('❌ Invalid option');
          rl.close();
          await mongoose.disconnect();
          return;
      }
    });
  } catch (error) {
    console.error('❌ Error:', error);
    rl.close();
    process.exit(1);
  }
}

// List all transactions
async function listAllTransactions() {
  const transactions = await Escrow.find().sort({ createdAt: -1 }).limit(20);
  
  if (transactions.length === 0) {
    console.log('No transactions found');
    rl.close();
    await mongoose.disconnect();
    return;
  }
  
  console.log(`\nFound ${transactions.length} transactions:`);
  displayTransactions(transactions);
  
  rl.close();
  await mongoose.disconnect();
}

// List transactions by status
async function listTransactionsByStatus(status: string) {
  const transactions = await Escrow.find({ status }).sort({ createdAt: -1 }).limit(20);
  
  if (transactions.length === 0) {
    console.log(`No ${status} transactions found`);
    rl.close();
    await mongoose.disconnect();
    return;
  }
  
  console.log(`\nFound ${transactions.length} ${status} transactions:`);
  displayTransactions(transactions);
  
  rl.close();
  await mongoose.disconnect();
}

// List transactions by type
async function listTransactionsByType(type: string) {
  const transactions = await Escrow.find({ type }).sort({ createdAt: -1 }).limit(20);
  
  if (transactions.length === 0) {
    console.log(`No ${type} transactions found`);
    rl.close();
    await mongoose.disconnect();
    return;
  }
  
  console.log(`\nFound ${transactions.length} ${type} transactions:`);
  displayTransactions(transactions);
  
  rl.close();
  await mongoose.disconnect();
}

// Find transaction by ID
async function findTransactionById(id: string) {
  const transaction = await Escrow.findOne({ transactionId: id });
  
  if (!transaction) {
    console.log(`No transaction found with ID: ${id}`);
    rl.close();
    await mongoose.disconnect();
    return;
  }
  
  // Get user details
  const user = await User.findById(transaction.userId);
  
  console.log('\nTransaction Details:');
  console.log('----------------------------------');
  console.log(`ID: ${transaction.transactionId}`);
  console.log(`Type: ${transaction.type}`);
  console.log(`Status: ${transaction.status}`);
  console.log(`Amount: ${transaction.amount}`);
  console.log(`Crypto Amount: ${transaction.cryptoAmount}`);
  console.log(`User ID: ${transaction.userId}`);
  console.log(`User Phone: ${user ? user.phoneNumber : 'Unknown'}`);
  
  if (transaction.mpesaTransactionId) {
    console.log(`M-Pesa Transaction ID: ${transaction.mpesaTransactionId}`);
  }
  
  if (transaction.cryptoTransactionHash) {
    console.log(`Crypto Transaction Hash: ${transaction.cryptoTransactionHash}`);
  }
  
  if (transaction.paybillNumber) {
    console.log(`Paybill Number: ${transaction.paybillNumber}`);
    console.log(`Account Number: ${transaction.accountNumber}`);
  }
  
  if (transaction.tillNumber) {
    console.log(`Till Number: ${transaction.tillNumber}`);
  }
  
  console.log(`Retry Count: ${transaction.retryCount}`);
  console.log(`Created At: ${transaction.createdAt}`);
  
  if (transaction.completedAt) {
    console.log(`Completed At: ${transaction.completedAt}`);
  }
  
  if (transaction.lastRetryAt) {
    console.log(`Last Retry At: ${transaction.lastRetryAt}`);
  }
  
  console.log('----------------------------------');
  
  rl.close();
  await mongoose.disconnect();
}

// Retry a failed transaction
async function retryFailedTransaction(id: string) {
  const transaction = await Escrow.findOne({ transactionId: id });
  
  if (!transaction) {
    console.log(`No transaction found with ID: ${id}`);
    rl.close();
    await mongoose.disconnect();
    return;
  }
  
  if (transaction.status !== 'failed') {
    console.log(`Transaction is not in 'failed' status (current status: ${transaction.status})`);
    rl.close();
    await mongoose.disconnect();
    return;
  }
  
  // Update the transaction status to 'pending' for retry
  transaction.status = 'pending';
  transaction.retryCount = (transaction.retryCount || 0) + 1;
  transaction.lastRetryAt = new Date();
  
  await transaction.save();
  
  console.log('✅ Transaction updated to pending status for retry');
  console.log(`Transaction ID: ${transaction.transactionId}`);
  console.log(`New Retry Count: ${transaction.retryCount}`);
  console.log(`Last Retry At: ${transaction.lastRetryAt}`);
  
  console.log('\nNOTE: The transaction will be processed by the system in the next retry cycle.');
  
  rl.close();
  await mongoose.disconnect();
}

// Display transactions in a formatted way
function displayTransactions(transactions: any[]) {
  transactions.forEach((tx: any, index: number) => {
    console.log(`\n[${index + 1}] Transaction:`);
    console.log('----------------------------------');
    console.log(`ID: ${tx.transactionId}`);
    console.log(`Type: ${tx.type}`);
    console.log(`Status: ${tx.status}`);
    console.log(`Amount: ${tx.amount}`);
    console.log(`Created: ${tx.createdAt.toISOString()}`);
    
    if (tx.completedAt) {
      console.log(`Completed: ${tx.completedAt.toISOString()}`);
    }
    
    if (tx.cryptoTransactionHash) {
      console.log(`Tx Hash: ${tx.cryptoTransactionHash.substring(0, 10)}...`);
    }
    
    console.log('----------------------------------');
  });
}

// Handle promise rejections
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
  process.exit(1);
});

// Run the script
main(); 