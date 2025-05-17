import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { User } from '../models/models';
import config from '../config/env';
import jwt from 'jsonwebtoken';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Phone number to generate token for
const phoneNumber = '+254759280875';

async function generateToken() {
  try {
    console.log(`Connecting to MongoDB: ${config.MONGO_URL}`);
    await mongoose.connect(config.MONGO_URL);
    console.log('Connected to MongoDB');
    
    console.log(`Looking for user with phone number: ${phoneNumber}`);
    const user = await User.findOne({ phoneNumber });
    
    if (!user) {
      console.error(`❌ No user found with phone number ${phoneNumber}`);
      return;
    }
    
    console.log('✅ User found!');
    console.log(`- ID: ${user._id}`);
    console.log(`- Phone: ${user.phoneNumber}`);
    console.log(`- Wallet: ${user.walletAddress || 'No wallet'}`);
    
    // Generate JWT token valid for 24 hours
    const tokenPayload = {
      userId: user._id,
      phone: user.phoneNumber,
      wallet: user.walletAddress,
      role: user.role || 'user'
    };
    
    const jwtSecret = config.JWT_SECRET || 'nexuspay-secret-key';
    const token = jwt.sign(tokenPayload, jwtSecret, { expiresIn: '24h' });
    
    console.log('\n✅ Generated JWT Token:');
    console.log(token);
    console.log('\nThis token is valid for 24 hours and can be used for API testing.');
    console.log('Use this token in the Authorization header as: Bearer <token>');
    
    // For convenience, also output the curl command
    console.log('\nExample API calls:');
    console.log(`curl -X POST "${config.MPESA_WEBHOOK_URL || 'http://localhost:3000'}/api/mpesa/buy-crypto" \\`);
    console.log(`  -H "Authorization: Bearer ${token}" \\`);
    console.log('  -H "Content-Type: application/json" \\');
    console.log(`  -d '{"cryptoAmount": 0.5, "phone": "${phoneNumber}", "chain": "celo", "tokenType": "USDT"}'`);
    
  } catch (error) {
    console.error('Error generating token:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the script
generateToken()
  .then(() => {
    console.log('\nScript completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\nScript failed:', error);
    process.exit(1);
  }); 