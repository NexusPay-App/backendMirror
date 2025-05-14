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

async function main() {
  try {
    console.log(`Connecting to MongoDB at: ${MONGODB_URL}`);
    await mongoose.connect(MONGODB_URL);
    console.log('Connected to MongoDB');
    
    rl.question('Enter the phone number that has a duplicate: ', async (phoneNumber) => {
      console.log(`\nSearching for users with phone number: ${phoneNumber}`);
      
      // Find users with the specified phone number
      const users = await User.find({ phoneNumber });
      
      if (users.length === 0) {
        console.log('No users found with this phone number.');
        rl.close();
        await mongoose.disconnect();
        return;
      }
      
      console.log(`\nFound ${users.length} users with phone number ${phoneNumber}:`);
      
      users.forEach((user, index) => {
        console.log(`\n[${index + 1}] User Details:`);
        console.log('----------------------------------');
        console.log(`ID: ${user._id}`);
        console.log(`Phone: ${user.phoneNumber}`);
        console.log(`Email: ${user.email || 'Not set'}`);
        console.log(`Role: ${user.role || 'user'}`);
        console.log(`Created: ${user.createdAt}`);
        console.log(`Wallet address: ${user.walletAddress}`);
        console.log('----------------------------------');
      });
      
      console.log('\nOptions to resolve duplicate:');
      console.log('1. Keep only one user and delete the others');
      console.log('2. Update phone number for specific users');
      
      rl.question('\nSelect option (1-2): ', async (option) => {
        if (option === '1') {
          // Delete duplicate users
          if (users.length === 1) {
            console.log('Only one user exists with this phone number. No action needed.');
            rl.close();
            await mongoose.disconnect();
            return;
          }
          
          console.log('\nWhich user do you want to keep? (Enter the number):');
          
          rl.question('User to keep (1-' + users.length + '): ', async (keepIndex) => {
            const index = parseInt(keepIndex) - 1;
            
            if (isNaN(index) || index < 0 || index >= users.length) {
              console.error('❌ Invalid user selection');
              rl.close();
              await mongoose.disconnect();
              return;
            }
            
            // Get the user to keep
            const userToKeep = users[index];
            
            // Delete the rest
            for (let i = 0; i < users.length; i++) {
              if (i !== index) {
                const userToDelete = users[i];
                console.log(`Deleting user: ${userToDelete._id} (${userToDelete.phoneNumber})`);
                await User.deleteOne({ _id: userToDelete._id });
                console.log(`✅ User ${userToDelete._id} deleted`);
              }
            }
            
            console.log(`\n✅ Kept user: ${userToKeep._id} (${userToKeep.phoneNumber})`);
            console.log('Operation completed successfully');
          });
        } else if (option === '2') {
          // Update phone numbers
          console.log('\nWhich user phone number do you want to update? (Enter the number):');
          
          rl.question('User to update (1-' + users.length + '): ', async (updateIndex) => {
            const index = parseInt(updateIndex) - 1;
            
            if (isNaN(index) || index < 0 || index >= users.length) {
              console.error('❌ Invalid user selection');
              rl.close();
              await mongoose.disconnect();
              return;
            }
            
            // Get the user to update
            const userToUpdate = users[index];
            
            rl.question('Enter new phone number: ', async (newPhoneNumber) => {
              if (!newPhoneNumber || newPhoneNumber === phoneNumber) {
                console.error('❌ Invalid new phone number');
                rl.close();
                await mongoose.disconnect();
                return;
              }
              
              // Check if the new phone number already exists
              const existingWithNewPhone = await User.findOne({ phoneNumber: newPhoneNumber });
              
              if (existingWithNewPhone) {
                console.error(`❌ Phone number ${newPhoneNumber} is already in use by another user: ${existingWithNewPhone._id}`);
                rl.close();
                await mongoose.disconnect();
                return;
              }
              
              // Update the phone number
              console.log(`Updating user ${userToUpdate._id} phone from ${userToUpdate.phoneNumber} to ${newPhoneNumber}`);
              
              userToUpdate.phoneNumber = newPhoneNumber;
              await userToUpdate.save();
              
              console.log(`✅ User phone number updated successfully`);
              console.log('\nUpdated user details:');
              console.log('----------------------------------');
              console.log(`ID: ${userToUpdate._id}`);
              console.log(`Phone: ${userToUpdate.phoneNumber}`);
              console.log(`Email: ${userToUpdate.email || 'Not set'}`);
              console.log(`Role: ${userToUpdate.role || 'user'}`);
              console.log('----------------------------------');
            });
          });
        } else {
          console.error('❌ Invalid option');
          rl.close();
          await mongoose.disconnect();
          return;
        }
      });
    });
  } catch (error) {
    console.error('❌ Error:', error);
    rl.close();
    process.exit(1);
  }
}

// Handle promise rejections
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
  process.exit(1);
});

// Run the script
main(); 