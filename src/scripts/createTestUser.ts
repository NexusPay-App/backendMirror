import mongoose from 'mongoose';
import { User } from '../models/models';
import bcrypt from 'bcrypt';
import { createAccount, SALT_ROUNDS } from '../services/auth';

// MongoDB connection string
const MONGODB_URL = "mongodb+srv://productionbranch:JYDbTetcX1sPL4hc@cluster0.y6bk3ba.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// Default values if not provided
const DEFAULT_PHONE = '+254712345678';
const DEFAULT_PASSWORD = 'TestPassword123';

// Get phone number and password from command line
const phoneNumber = process.argv[2] || DEFAULT_PHONE;
const password = process.argv[3] || DEFAULT_PASSWORD;

async function main() {
  console.log(`Connecting to MongoDB at: ${MONGODB_URL}`);
  await mongoose.connect(MONGODB_URL);
  console.log('Connected to MongoDB');

  // Check if user already exists
  let user = await User.findOne({ phoneNumber });
  
  if (user) {
    console.log(`\nUser with phone ${phoneNumber} already exists:`);
    console.log('----------------------------------');
    console.log(`ID: ${user._id}`);
    console.log(`Phone: ${user.phoneNumber}`);
    console.log(`Phone verified: ${user.isPhoneVerified}`);
    console.log(`Wallet address: ${user.walletAddress}`);
    console.log('----------------------------------\n');
    
    // Ensure the phone is verified
    if (!user.isPhoneVerified) {
      user.isPhoneVerified = true;
      await user.save();
      console.log('✅ Phone number has been verified');
    }
    
    // Update the password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    user.password = hashedPassword;
    await user.save();
    console.log('✅ Password has been updated');
  } else {
    // Create a new user
    console.log(`Creating new user with phone: ${phoneNumber}`);
    
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const userSmartAccount = await createAccount();
    const { pk, walletAddress } = userSmartAccount;
    
    // Create new user with unified wallet
    const newUser = new User({
      phoneNumber,
      walletAddress,
      password: hashedPassword,
      privateKey: pk,
      isPhoneVerified: true,
      isUnified: true
    });
    
    await newUser.save();
    console.log('\n✅ Test user created successfully:');
    console.log('----------------------------------');
    console.log(`ID: ${newUser._id}`);
    console.log(`Phone: ${newUser.phoneNumber}`);
    console.log(`Phone verified: ${newUser.isPhoneVerified}`);
    console.log(`Wallet address: ${newUser.walletAddress}`);
    console.log('----------------------------------\n');
  }

  console.log(`\nTest User Login Details:`);
  console.log('==================================');
  console.log(`Phone: ${phoneNumber}`);
  console.log(`Password: ${password}`);
  console.log('==================================\n');

  // Disconnect from MongoDB
  await mongoose.disconnect();
  console.log('Disconnected from MongoDB');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
}); 