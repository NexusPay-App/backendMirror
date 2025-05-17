"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const models_1 = require("../models/models");
const env_1 = __importDefault(require("../config/env"));
// Load environment variables
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
// Phone number to check
const phoneNumber = '+254759280875';
async function checkUser() {
    try {
        console.log(`Connecting to MongoDB: ${env_1.default.MONGO_URL}`);
        await mongoose_1.default.connect(env_1.default.MONGO_URL);
        console.log('Connected to MongoDB');
        console.log(`Looking for user with phone number: ${phoneNumber}`);
        const user = await models_1.User.findOne({ phoneNumber });
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
        }
        else {
            console.log('❌ No user found with this phone number');
            console.log('You need to register this user first');
        }
    }
    catch (error) {
        console.error('Error checking user:', error);
    }
    finally {
        await mongoose_1.default.disconnect();
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
