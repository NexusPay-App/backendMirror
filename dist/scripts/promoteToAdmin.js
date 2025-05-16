"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const models_1 = require("../models/models");
const readline_1 = __importDefault(require("readline"));
// Create a readline interface for user input
const rl = readline_1.default.createInterface({
    input: process.stdin,
    output: process.stdout
});
// MongoDB connection string
const MONGODB_URL = process.env.DEV_MONGO_URL || process.env.MONGO_URL || "mongodb+srv://productionbranch:JYDbTetcX1sPL4hc@cluster0.y6bk3ba.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
async function main() {
    console.log(`Connecting to MongoDB at: ${MONGODB_URL}`);
    await mongoose_1.default.connect(MONGODB_URL);
    console.log('Connected to MongoDB');
    // Ask for the phone number of the user to promote
    rl.question('Enter the phone number of the user to promote to admin: ', async (phoneNumber) => {
        // Find the user by phone number
        const user = await models_1.User.findOne({ phoneNumber });
        if (!user) {
            console.error(`❌ User with phone number ${phoneNumber} not found`);
            rl.close();
            await mongoose_1.default.disconnect();
            process.exit(1);
        }
        console.log('\nUser found:');
        console.log('----------------------------------');
        console.log(`ID: ${user._id}`);
        console.log(`Phone: ${user.phoneNumber}`);
        console.log(`Email: ${user.email || 'Not set'}`);
        console.log(`Current role: ${user.role || 'user'}`);
        console.log(`Wallet address: ${user.walletAddress}`);
        console.log('----------------------------------\n');
        // Confirm promotion
        rl.question(`Are you sure you want to promote this user to admin role? (y/n): `, async (answer) => {
            if (answer.toLowerCase() !== 'y') {
                console.log('Operation cancelled');
                rl.close();
                await mongoose_1.default.disconnect();
                process.exit(0);
            }
            // Update the user role to admin
            user.role = 'admin';
            await user.save();
            console.log('✅ User has been promoted to admin role successfully');
            console.log('\nUpdated user details:');
            console.log('----------------------------------');
            console.log(`ID: ${user._id}`);
            console.log(`Phone: ${user.phoneNumber}`);
            console.log(`Email: ${user.email || 'Not set'}`);
            console.log(`Current role: ${user.role}`);
            console.log(`Wallet address: ${user.walletAddress}`);
            console.log('----------------------------------\n');
            rl.close();
            await mongoose_1.default.disconnect();
            console.log('Disconnected from MongoDB');
        });
    });
}
// Handle errors
process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
    process.exit(1);
});
main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
