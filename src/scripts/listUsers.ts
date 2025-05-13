import mongoose from 'mongoose';
import { User } from '../models/models';

// MongoDB connection string
const MONGODB_URL = "mongodb+srv://productionbranch:JYDbTetcX1sPL4hc@cluster0.y6bk3ba.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

async function main() {
  console.log(`Connecting to MongoDB at: ${MONGODB_URL}`);
  await mongoose.connect(MONGODB_URL);
  console.log('Connected to MongoDB');

  // Find all users
  const users = await User.find({}).limit(10);
  
  if (users.length === 0) {
    console.log('No users found in the database');
    process.exit(0);
  }
  
  console.log('\nUsers found:');
  console.log('==================================');
  
  users.forEach((user, index) => {
    console.log(`\nUser ${index + 1}:`);
    console.log('----------------------------------');
    console.log(`ID: ${user._id}`);
    console.log(`Phone: ${user.phoneNumber || 'Not set'}`);
    console.log(`Email: ${user.email || 'Not set'}`);
    console.log(`Phone verified: ${user.isPhoneVerified}`);
    console.log(`Email verified: ${user.isEmailVerified}`);
    console.log(`Wallet address: ${user.walletAddress}`);
    console.log('----------------------------------');
  });
  
  console.log('\n==================================');
  console.log(`Total users in database: ${users.length}`);

  // Disconnect from MongoDB
  await mongoose.disconnect();
  console.log('Disconnected from MongoDB');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
}); 