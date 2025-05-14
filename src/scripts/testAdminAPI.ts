import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { User } from '../models/models';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Configuration
const API_BASE_URL = 'http://localhost:8000/api';
const MONGODB_URL = process.env.DEV_MONGO_URL || "mongodb+srv://productionbranch:JYDbTetcX1sPL4hc@cluster0.y6bk3ba.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const JWT_SECRET = process.env.JWT_SECRET;

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
  
  try {
    console.log('\n=== TESTING ADMIN ENDPOINTS ===\n');
    
    // Test 1: Get Users
    console.log('TEST 1: Get Users');
    const usersResponse = await axios.get(`${API_BASE_URL}/admin/users`, { headers });
    console.log(`Status: ${usersResponse.status}`);
    console.log('Data:', JSON.stringify(usersResponse.data, null, 2).slice(0, 300) + '...');
    
    if (usersResponse.data.success) {
      const userId = usersResponse.data.data.users[0]._id;
      
      // Test 2: Get User by ID
      console.log('\nTEST 2: Get User by ID');
      const userResponse = await axios.get(`${API_BASE_URL}/admin/users/${userId}`, { headers });
      console.log(`Status: ${userResponse.status}`);
      console.log('Data:', JSON.stringify(userResponse.data, null, 2));
      
      // Test 3: Get Transactions
      console.log('\nTEST 3: Get Transactions');
      const transactionsResponse = await axios.get(`${API_BASE_URL}/admin/transactions`, { headers });
      console.log(`Status: ${transactionsResponse.status}`);
      console.log('Data:', JSON.stringify(transactionsResponse.data, null, 2).slice(0, 300) + '...');
      
      // Test 4: Get Platform Wallets
      console.log('\nTEST 4: Get Platform Wallets');
      const walletsResponse = await axios.get(`${API_BASE_URL}/admin/platform-wallets`, { headers });
      console.log(`Status: ${walletsResponse.status}`);
      console.log('Data:', JSON.stringify(walletsResponse.data, null, 2));
      
      // Only run transaction update test if there are transactions
      if (transactionsResponse.data.data.transactions && transactionsResponse.data.data.transactions.length > 0) {
        const transactionId = transactionsResponse.data.data.transactions[0].transactionId;
        
        // Test 5: Get Transaction by ID
        console.log('\nTEST 5: Get Transaction by ID');
        const transactionResponse = await axios.get(`${API_BASE_URL}/admin/transactions/${transactionId}`, { headers });
        console.log(`Status: ${transactionResponse.status}`);
        console.log('Data:', JSON.stringify(transactionResponse.data, null, 2));
        
        // Test 6: Update Transaction Status
        console.log('\nTEST 6: Update Transaction Status');
        const updateData = {
          status: 'pending',
          notes: 'Testing update from admin API'
        };
        const updateResponse = await axios.put(
          `${API_BASE_URL}/admin/transactions/${transactionId}/status`, 
          updateData,
          { headers }
        );
        console.log(`Status: ${updateResponse.status}`);
        console.log('Data:', JSON.stringify(updateResponse.data, null, 2));
      } else {
        console.log('\nNo transactions found, skipping transaction tests');
      }
    }
    
    console.log('\n=== TESTING COMPLETED SUCCESSFULLY ===\n');
  } catch (error: any) {
    console.error('Error testing admin endpoints:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

// Main function
async function main() {
  try {
    const token = await generateAdminToken();
    console.log('Successfully generated admin token');
    
    await testAdminEndpoints(token);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

// Run the tests
main(); 