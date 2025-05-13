// Script to identify and remove duplicate phoneNumber entries in MongoDB
// Run with: node cleanup-duplicates.js

const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Get MongoDB URI from environment
const MONGO_URI = process.env.DEV_MONGO_URL || process.env.MONGO_URL;

if (!MONGO_URI) {
  console.error('❌ MongoDB URI not found in environment variables');
  process.exit(1);
}

console.log('Connecting to MongoDB...');
mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB');
    
    // Get the User model collection directly
    const User = mongoose.connection.collection('users');
    
    // Find users with null phoneNumber
    console.log('Looking for users with null phoneNumber...');
    const usersWithNullPhone = await User.find({ phoneNumber: null }).toArray();
    console.log(`Found ${usersWithNullPhone.length} users with null phoneNumber`);
    
    if (usersWithNullPhone.length > 0) {
      // Display the first few users
      console.log('First few users with null phoneNumber:');
      usersWithNullPhone.slice(0, 3).forEach((user, i) => {
        console.log(`User ${i+1}: ${user._id} - ${user.email || 'No email'}`);
      });
      
      // Ask for confirmation before deletion
      console.log('\n⚠️ WARNING: This will delete all but one user with null phoneNumber');
      console.log('To proceed, run this script with the --confirm flag');
      
      // Check if --confirm flag is provided
      if (process.argv.includes('--confirm')) {
        // Keep the first user, delete the rest
        const keepUser = usersWithNullPhone[0];
        const deleteIds = usersWithNullPhone.slice(1).map(u => u._id);
        
        if (deleteIds.length > 0) {
          const result = await User.deleteMany({ _id: { $in: deleteIds } });
          console.log(`✅ Deleted ${result.deletedCount} duplicate users`);
        } else {
          console.log('No duplicate users to delete');
        }
      }
    }
    
    // Find users with duplicate phoneNumbers (not null)
    console.log('\nLooking for duplicate phoneNumbers...');
    const duplicatePhones = await User.aggregate([
      { $match: { phoneNumber: { $ne: null } } },
      { $group: { _id: "$phoneNumber", count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();
    
    console.log(`Found ${duplicatePhones.length} phoneNumbers with duplicates`);
    
    if (duplicatePhones.length > 0) {
      duplicatePhones.forEach(dup => {
        console.log(`PhoneNumber: ${dup._id} has ${dup.count} occurrences`);
      });
      
      // Ask for confirmation before deletion
      console.log('\n⚠️ WARNING: This will delete all but one user for each duplicate phoneNumber');
      console.log('To proceed, run this script with the --confirm flag');
      
      // Check if --confirm flag is provided
      if (process.argv.includes('--confirm')) {
        let totalDeleted = 0;
        
        for (const dup of duplicatePhones) {
          // Keep the first user, delete the rest
          const deleteIds = dup.ids.slice(1);
          const result = await User.deleteMany({ _id: { $in: deleteIds } });
          totalDeleted += result.deletedCount;
        }
        
        console.log(`✅ Deleted ${totalDeleted} users with duplicate phoneNumbers`);
      }
    }
    
    mongoose.disconnect();
    console.log('✅ Done. Disconnected from MongoDB');
  })
  .catch(err => {
    console.error('❌ Error connecting to MongoDB:', err);
    process.exit(1);
  }); 