import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { User } from '../models/models';
import { program } from 'commander';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000/api';
const MONGODB_URL = process.env.DEV_MONGO_URL || "mongodb+srv://productionbranch:JYDbTetcX1sPL4hc@cluster0.y6bk3ba.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const JWT_SECRET = process.env.JWT_SECRET;

// Command-line interface setup
program
  .version('1.0.0')
  .description('Test NexusPay Admin API endpoints')
  .option('-e, --endpoint <endpoint>', 'Specific endpoint to test (users, user, transactions, transaction, wallets, fund, withdraw)')
  .option('-i, --id <id>', 'ID for specific resource tests')
  .option('-a, --all', 'Test all endpoints')
  .parse(process.argv);

const options = program.opts();

// Generate a test admin token
async function generateAdminToken(): Promise<string> {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URL);
    
    // Get first user to make admin for testing
    const user = await User.findOne();
    
    if (!user) {
      throw new Error('No user found to make admin');
    }
    
    // Make user admin if not already
    if (user.role !== 'admin') {
      user.role = 'admin';
      await user.save();
      console.log(`Made user ${user._id} an admin for testing`);
    } else {
      console.log(`User ${user._id} is already an admin`);
    }
    
    // Generate JWT token
    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET not found in environment variables');
    }
    
    const token = jwt.sign(
      { id: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    return token;
  } catch (error) {
    console.error('Error generating admin token:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

// Test endpoints with token
async function testAdminEndpoints(token: string) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
  
  const testFunctions = {
    // User management tests
    users: async () => {
      console.log('\nTEST: Get All Users');
      const response = await axios.get(`${API_BASE_URL}/admin/users`, { headers });
      console.log(`Status: ${response.status}`);
      console.log('Data:', JSON.stringify(response.data, null, 2).slice(0, 300) + '...');
      return response.data;
    },
    
    user: async (userId?: string) => {
      if (!userId) {
        // Get a user ID first if not provided
        const usersResponse = await axios.get(`${API_BASE_URL}/admin/users`, { headers });
        userId = usersResponse.data.data.users[0]._id;
      }
      
      console.log(`\nTEST: Get User by ID (${userId})`);
      const response = await axios.get(`${API_BASE_URL}/admin/users/${userId}`, { headers });
      console.log(`Status: ${response.status}`);
      console.log('Data:', JSON.stringify(response.data, null, 2));
      return response.data;
    },
    
    promote: async (userId?: string) => {
      if (!userId) {
        // Get a user ID first if not provided
        const usersResponse = await axios.get(`${API_BASE_URL}/admin/users`, { headers });
        userId = usersResponse.data.data.users[0]._id;
      }
      
      console.log(`\nTEST: Promote User to Admin (${userId})`);
      const response = await axios.post(`${API_BASE_URL}/admin/users/promote/${userId}`, {}, { headers });
      console.log(`Status: ${response.status}`);
      console.log('Data:', JSON.stringify(response.data, null, 2));
      return response.data;
    },
    
    // Transaction management tests
    transactions: async () => {
      console.log('\nTEST: Get All Transactions');
      const response = await axios.get(`${API_BASE_URL}/admin/transactions`, { headers });
      console.log(`Status: ${response.status}`);
      console.log('Data:', JSON.stringify(response.data, null, 2).slice(0, 300) + '...');
      return response.data;
    },
    
    transaction: async (transactionId?: string) => {
      if (!transactionId) {
        // Get a transaction ID first if not provided
        const txResponse = await axios.get(`${API_BASE_URL}/admin/transactions`, { headers });
        if (txResponse.data.data.transactions && txResponse.data.data.transactions.length > 0) {
          transactionId = txResponse.data.data.transactions[0].transactionId;
        } else {
          console.log('No transactions found to test with');
          return null;
        }
      }
      
      console.log(`\nTEST: Get Transaction by ID (${transactionId})`);
      const response = await axios.get(`${API_BASE_URL}/admin/transactions/${transactionId}`, { headers });
      console.log(`Status: ${response.status}`);
      console.log('Data:', JSON.stringify(response.data, null, 2));
      return response.data;
    },
    
    updateTransaction: async (transactionId?: string) => {
      if (!transactionId) {
        // Get a transaction ID first if not provided
        const txResponse = await axios.get(`${API_BASE_URL}/admin/transactions`, { headers });
        if (txResponse.data.data.transactions && txResponse.data.data.transactions.length > 0) {
          transactionId = txResponse.data.data.transactions[0].transactionId;
        } else {
          console.log('No transactions found to test with');
          return null;
        }
      }
      
      console.log(`\nTEST: Update Transaction Status (${transactionId})`);
      const updateData = {
        status: 'pending',
        notes: 'Testing update from admin API'
      };
      const response = await axios.put(
        `${API_BASE_URL}/admin/transactions/${transactionId}/status`, 
        updateData,
        { headers }
      );
      console.log(`Status: ${response.status}`);
      console.log('Data:', JSON.stringify(response.data, null, 2));
      return response.data;
    },
    
    // Wallet management tests
    wallets: async () => {
      console.log('\nTEST: Get Platform Wallets');
      const response = await axios.get(`${API_BASE_URL}/admin/platform-wallets`, { headers });
      console.log(`Status: ${response.status}`);
      console.log('Data:', JSON.stringify(response.data, null, 2));
      return response.data;
    },
    
    fund: async (userId?: string) => {
      if (!userId) {
        // Get a user ID first if not provided
        const usersResponse = await axios.get(`${API_BASE_URL}/admin/users`, { headers });
        userId = usersResponse.data.data.users[0]._id;
      }
      
      console.log(`\nTEST: Fund User Wallet (${userId})`);
      const fundData = {
        userId,
        amount: '0.001',
        currency: 'USDC',
        network: 'Polygon'
      };
      try {
        const response = await axios.post(
          `${API_BASE_URL}/admin/wallets/fund`,
          fundData,
          { headers }
        );
        console.log(`Status: ${response.status}`);
        console.log('Data:', JSON.stringify(response.data, null, 2));
        return response.data;
      } catch (error: any) {
        console.error('Error funding wallet:', error.message);
        if (error.response) {
          console.error('Response:', error.response.data);
        }
        return null;
      }
    },
    
    withdraw: async () => {
      console.log('\nTEST: Withdraw Fees to Main Wallet');
      try {
        const response = await axios.post(
          `${API_BASE_URL}/admin/wallets/withdraw-fees`,
          {},
          { headers }
        );
        console.log(`Status: ${response.status}`);
        console.log('Data:', JSON.stringify(response.data, null, 2));
        return response.data;
      } catch (error: any) {
        console.error('Error withdrawing fees:', error.message);
        if (error.response) {
          console.error('Response:', error.response.data);
        }
        return null;
      }
    }
  };
  
  try {
    console.log('\n=== TESTING ADMIN ENDPOINTS ===\n');
    
    if (options.all) {
      // Test all endpoints in sequence
      await testFunctions.users();
      const usersData = await testFunctions.users();
      
      if (usersData?.data?.users?.length > 0) {
        const userId = usersData.data.users[0]._id;
        await testFunctions.user(userId);
        
        // Don't promote in automatic testing to avoid making all users admins
        // await testFunctions.promote(userId);
      }
      
      const txData = await testFunctions.transactions();
      
      if (txData?.data?.transactions?.length > 0) {
        const txId = txData.data.transactions[0].transactionId;
        await testFunctions.transaction(txId);
        await testFunctions.updateTransaction(txId);
      }
      
      await testFunctions.wallets();
      // Skipping fund and withdraw in automatic tests to avoid actual blockchain transactions
    } else if (options.endpoint) {
      // Test specific endpoint
      const endpoint = options.endpoint.toLowerCase();
      const id = options.id;
      
      if (endpoint === 'users') await testFunctions.users();
      else if (endpoint === 'user') await testFunctions.user(id);
      else if (endpoint === 'promote') await testFunctions.promote(id);
      else if (endpoint === 'transactions') await testFunctions.transactions();
      else if (endpoint === 'transaction') await testFunctions.transaction(id);
      else if (endpoint === 'update') await testFunctions.updateTransaction(id);
      else if (endpoint === 'wallets') await testFunctions.wallets();
      else if (endpoint === 'fund') await testFunctions.fund(id);
      else if (endpoint === 'withdraw') await testFunctions.withdraw();
      else {
        console.error(`Unknown endpoint: ${endpoint}`);
        console.log('Available endpoints: users, user, promote, transactions, transaction, update, wallets, fund, withdraw');
      }
    } else {
      // Default behavior - run non-destructive tests
      await testFunctions.users();
      await testFunctions.transactions();
      await testFunctions.wallets();
    }
    
    console.log('\n=== TESTING COMPLETED SUCCESSFULLY ===\n');
  } catch (error: any) {
    console.error('Error testing admin endpoints:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('\nConnection refused. Make sure the server is running with:');
      console.error('  npm run dev\n');
      console.error('Then try running the tests again.\n');
    } else if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Full error:', error);
    }
  }
}

// Main function
async function main() {
  try {
    const token = await generateAdminToken();
    console.log('\nYOUR ADMIN TOKEN (Copy this for manual testing):');
    console.log('=================================================');
    console.log(token);
    console.log('=================================================\n');
    
    console.log('Successfully generated admin token');
    
    await testAdminEndpoints(token);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

// Run the tests
main(); 