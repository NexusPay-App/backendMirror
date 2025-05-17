import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import readline from 'readline';
import { User } from '../models/models';
import mongoose from 'mongoose';
import config from '../config/env';
import { getPlatformWalletStatus } from '../services/platformWallet';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// User's phone number
const PHONE_NUMBER = '+254759280875';

// Host URL - default to localhost for testing
const API_URL = process.env.API_URL || 'http://localhost:3000/api';

/**
 * Main function to test buying crypto with M-Pesa
 */
async function testBuyCrypto() {
  try {
    // Connect to MongoDB
    console.log(`Connecting to MongoDB: ${config.MONGO_URL}`);
    await mongoose.connect(config.MONGO_URL);
    console.log('Connected to MongoDB');
    
    // Check if the user exists
    const user = await User.findOne({ phoneNumber: PHONE_NUMBER });
    if (!user) {
      console.error(`❌ User with phone number ${PHONE_NUMBER} not found. Please register this user first.`);
      return;
    }
    
    console.log(`✅ Found user: ${user._id}`);
    console.log(`- Phone: ${user.phoneNumber}`);
    console.log(`- Wallet: ${user.walletAddress}`);
    
    // Check platform wallet balances
    console.log('\nChecking platform wallet balances...');
    const celoStatus = await getPlatformWalletStatus('celo');
    const arbitrumStatus = await getPlatformWalletStatus('arbitrum');
    
    console.log(`CELO balance: ${celoStatus.main.balance / 1000000} USDT`);
    console.log(`ARBITRUM balance: ${arbitrumStatus.main.balance / 1000000} USDC`);
    
    // Get auth token
    console.log('\nLogging in as test user...');
    const token = await getAuthToken();
    if (!token) {
      console.error('❌ Failed to get auth token. Cannot proceed with test.');
      return;
    }
    console.log('✅ Successfully authenticated');
    
    // Ask user for test parameters
    console.log('\n--- TEST BUY CRYPTO WITH M-PESA ---');
    
    const chain = await promptUser('Enter chain (celo, arbitrum): ');
    if (!['celo', 'arbitrum'].includes(chain)) {
      console.error('❌ Invalid chain. Please choose celo or arbitrum.');
      return;
    }
    
    const tokenType = await promptUser('Enter token type (USDT, USDC): ');
    if (!['USDT', 'USDC'].includes(tokenType)) {
      console.error('❌ Invalid token type. Please choose USDT or USDC.');
      return;
    }
    
    // Check if we have enough balance
    if (chain === 'celo' && celoStatus.main.balance / 1000000 < 0.1) {
      console.error('❌ Insufficient USDT balance on Celo. Please fund the platform wallet first.');
      return;
    }
    
    if (chain === 'arbitrum' && arbitrumStatus.main.balance / 1000000 < 0.1) {
      console.error('❌ Insufficient USDC balance on Arbitrum. Please fund the platform wallet first.');
      return;
    }
    
    const cryptoAmount = await promptUser('Enter crypto amount to buy (e.g., 0.5): ');
    const amount = parseFloat(cryptoAmount);
    if (isNaN(amount) || amount <= 0) {
      console.error('❌ Invalid amount. Please enter a positive number.');
      return;
    }
    
    // Confirm test parameters
    console.log('\nTest parameters:');
    console.log(`- Chain: ${chain}`);
    console.log(`- Token: ${tokenType}`);
    console.log(`- Amount: ${amount} ${tokenType}`);
    console.log(`- Phone: ${PHONE_NUMBER}`);
    
    const confirm = await promptUser('\nProceed with test? (yes/no): ');
    if (confirm.toLowerCase() !== 'yes') {
      console.log('Test cancelled by user');
      return;
    }
    
    // Initiate the buy crypto request
    console.log('\nInitiating buy crypto request...');
    const response = await axios.post(
      `${API_URL}/mpesa/buy-crypto`,
      {
        cryptoAmount: amount,
        phone: PHONE_NUMBER,
        chain,
        tokenType
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Display the response
    console.log('\nAPI Response:');
    console.log(JSON.stringify(response.data, null, 2));
    
    // Get the transaction ID and check status
    if (response.data?.data?.transactionId) {
      const transactionId = response.data.data.transactionId;
      console.log(`\nTransaction ID: ${transactionId}`);
      console.log(`\nThe transaction is in ${response.data.data.status} status.`);
      console.log(`\nThe platform has reserved ${response.data.data.cryptoAmount} ${tokenType} on ${chain} for this transaction.`);
      console.log(`\nPlease complete the M-Pesa payment of ${response.data.data.mpesaAmount} KES when prompted on your phone.`);
      
      // Wait for the user to complete payment
      console.log('\nWaiting for you to complete the M-Pesa payment...');
      await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds wait

      // Check if the transaction status has updated
      try {
        console.log('\nChecking transaction status...');
        const statusResponse = await axios.get(
          `${API_URL}/transactions/status/${transactionId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        console.log('\nUpdated Transaction Status:');
        console.log(JSON.stringify(statusResponse.data, null, 2));
        
        if (statusResponse.data?.data?.status === 'completed') {
          console.log(`\n✅ Transaction completed successfully!`);
          console.log(`- Amount: ${statusResponse.data.data.cryptoAmount} ${tokenType}`);
          console.log(`- Chain: ${chain}`);
          if (statusResponse.data.data.cryptoTransactionHash) {
            console.log(`- Transaction Hash: ${statusResponse.data.data.cryptoTransactionHash}`);
            console.log(`- Explorer URL: ${generateExplorerUrl(chain, statusResponse.data.data.cryptoTransactionHash)}`);
          }
        } else if (statusResponse.data?.data?.status === 'reserved') {
          console.log(`\n⏳ Transaction is still being processed. The crypto is reserved and will be transferred once the payment is confirmed.`);
        } else if (statusResponse.data?.data?.status === 'pending') {
          console.log(`\n⏳ Transaction is still pending. Please complete the M-Pesa payment.`);
        } else if (statusResponse.data?.data?.status === 'failed') {
          console.log(`\n❌ Transaction failed. Please check your M-Pesa and try again.`);
        } else if (statusResponse.data?.data?.status === 'error') {
          console.log(`\n❌ Transaction encountered an error. Please contact support.`);
        }
      } catch (statusError: any) {
        console.error('\nError checking transaction status:', statusError.message);
      }
    }
  } catch (error: any) {
    console.error('❌ Error during test:', error.response?.data || error.message);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    rl.close();
  }
}

/**
 * Helper function to get authentication token
 */
async function getAuthToken(): Promise<string | null> {
  try {
    // For testing, we'll use a simplified login approach
    const response = await axios.post(`${API_URL}/auth/login`, {
      phoneNumber: PHONE_NUMBER,
      // You'd typically need a password or OTP here
      // This is just for test purposes
      password: 'testpassword123'
    });
    
    if (response.data.success && response.data.data.token) {
      return response.data.data.token;
    }
    
    console.error('Failed to login:', response.data.message);
    return null;
  } catch (error: any) {
    console.error('Error getting auth token:', error.response?.data || error.message);
    
    // For testing purposes, we can use a mock token if needed
    const mockToken = await promptUser('Enter a valid token manually for testing: ');
    return mockToken || null;
  }
}

/**
 * Helper function to prompt user for input
 */
async function promptUser(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * Generate an explorer URL for a transaction hash
 */
function generateExplorerUrl(chain: string, txHash: string): string {
  switch (chain.toLowerCase()) {
    case 'ethereum':
      return `https://etherscan.io/tx/${txHash}`;
    case 'polygon':
      return `https://polygonscan.com/tx/${txHash}`;
    case 'arbitrum':
      return `https://arbiscan.io/tx/${txHash}`;
    case 'optimism':
      return `https://optimistic.etherscan.io/tx/${txHash}`;
    case 'base':
      return `https://basescan.org/tx/${txHash}`;
    case 'celo':
      return `https://explorer.celo.org/mainnet/tx/${txHash}`;
    case 'avalanche':
      return `https://snowtrace.io/tx/${txHash}`;
    default:
      return `https://etherscan.io/tx/${txHash}`;
  }
}

// Run the script
testBuyCrypto()
  .then(() => {
    console.log('\nTest completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\nTest failed:', error);
    process.exit(1);
  }); 