"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const models_1 = require("../models/models");
// MongoDB connection string
const MONGODB_URL = "mongodb+srv://productionbranch:JYDbTetcX1sPL4hc@cluster0.y6bk3ba.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
async function main() {
    console.log(`Connecting to MongoDB at: ${MONGODB_URL}`);
    await mongoose_1.default.connect(MONGODB_URL);
    console.log('Connected to MongoDB');
    // Find all users
    const users = await models_1.User.find({}).limit(10);
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
    await mongoose_1.default.disconnect();
    console.log('Disconnected from MongoDB');
}
main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
