import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { User } from '../models/models';
import config from '../config/env';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Phone number to check
const phoneNumber = '+254759280875';

async function checkUser() {
  try {
    console.log(`Connecting to MongoDB: ${config.MONGO_URL}`);
    await mongoose.connect(config.MONGO_URL);
    console.log('Connected to MongoDB');
    
    console.log(`Looking for user with phone number: ${phoneNumber}`);
    const user = await User.findOne({ phoneNumber });
    
    if (user) {
      console.log('✅ User found!');
      console.log('User details:');
      console.log(`- ID: ${user._id}`);
      console.log(`- Phone: ${user.phoneNumber}`);
      console.log(`- Email: ${user.email || 'Not set'}`);
      console.log(`- Wallet Address: ${user.walletAddress || 'No wallet'}`);
      console.log(`- Has Wallet: ${!!user.walletAddress}`);
      console.log(`- Role: ${user.role || 'user'}`);
      console.log(`- Created At: ${user.createdAt}`);
    } else {
      console.log('❌ No user found with this phone number');
      console.log('You need to register this user first');
    }
  } catch (error) {
    console.error('Error checking user:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the script
checkUser()
  .then(() => {
    console.log('Script completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  }); 