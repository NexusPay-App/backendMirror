"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const models_1 = require("../models/models");
// MongoDB connection string
const MONGODB_URL = "mongodb+srv://productionbranch:JYDbTetcX1sPL4hc@cluster0.y6bk3ba.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
// Get phone number from command line
const phoneNumber = process.argv[2];
if (!phoneNumber) {
    console.error('Please provide a phone number as an argument');
    console.log('Usage: npx ts-node src/scripts/verifyPhone.ts +254712345678');
    process.exit(1);
}
async function main() {
    console.log(`Connecting to MongoDB at: ${MONGODB_URL}`);
    await mongoose_1.default.connect(MONGODB_URL);
    console.log('Connected to MongoDB');
    // Find user with the given phone number
    const user = await models_1.User.findOne({ phoneNumber });
    if (!user) {
        console.error(`No user found with phone number: ${phoneNumber}`);
        process.exit(1);
    }
    console.log('\nUser found:');
    console.log('----------------------------------');
    console.log(`ID: ${user._id}`);
    console.log(`Phone: ${user.phoneNumber}`);
    console.log(`Email: ${user.email}`);
    console.log(`Phone verified: ${user.isPhoneVerified}`);
    console.log(`Email verified: ${user.isEmailVerified}`);
    console.log(`Wallet address: ${user.walletAddress}`);
    console.log('----------------------------------\n');
    if (user.isPhoneVerified) {
        console.log('Phone number is already verified');
    }
    else {
        // Update the user to mark phone as verified
        user.isPhoneVerified = true;
        await user.save();
        console.log('Phone number has been verified successfully!');
    }
    // Disconnect from MongoDB
    await mongoose_1.default.disconnect();
    console.log('Disconnected from MongoDB');
}
main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
