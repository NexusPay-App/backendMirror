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
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
// Load environment variables
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
// Phone number to generate token for
const phoneNumber = '+254759280875';
async function generateToken() {
    try {
        console.log(`Connecting to MongoDB: ${env_1.default.MONGO_URL}`);
        await mongoose_1.default.connect(env_1.default.MONGO_URL);
        console.log('Connected to MongoDB');
        console.log(`Looking for user with phone number: ${phoneNumber}`);
        const user = await models_1.User.findOne({ phoneNumber });
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
        const jwtSecret = env_1.default.JWT_SECRET || 'nexuspay-secret-key';
        const token = jsonwebtoken_1.default.sign(tokenPayload, jwtSecret, { expiresIn: '24h' });
        console.log('\n✅ Generated JWT Token:');
        console.log(token);
        console.log('\nThis token is valid for 24 hours and can be used for API testing.');
        console.log('Use this token in the Authorization header as: Bearer <token>');
        // For convenience, also output the curl command
        console.log('\nExample API calls:');
        console.log(`curl -X POST "${env_1.default.MPESA_WEBHOOK_URL || 'http://localhost:3000'}/api/mpesa/buy-crypto" \\`);
        console.log(`  -H "Authorization: Bearer ${token}" \\`);
        console.log('  -H "Content-Type: application/json" \\');
        console.log(`  -d '{"cryptoAmount": 0.5, "phone": "${phoneNumber}", "chain": "celo", "tokenType": "USDT"}'`);
    }
    catch (error) {
        console.error('Error generating token:', error);
    }
    finally {
        await mongoose_1.default.disconnect();
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
