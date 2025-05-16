"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const mongoose_1 = __importDefault(require("mongoose"));
const models_1 = require("../models/models");
const ethers_1 = require("ethers");
const fs_1 = __importDefault(require("fs"));
const readline_1 = __importDefault(require("readline"));
// Load environment variables
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
// Create a readline interface for user input
const rl = readline_1.default.createInterface({
    input: process.stdin,
    output: process.stdout
});
// Connect to MongoDB
const connectDatabase = async () => {
    try {
        const mongoUrl = process.env.DEV_MONGO_URL || process.env.MONGO_URL;
        if (!mongoUrl) {
            throw new Error('MongoDB connection string not found in environment variables');
        }
        await mongoose_1.default.connect(mongoUrl);
        console.log('✅ Connected to MongoDB');
    }
    catch (error) {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    }
};
// Generate a new wallet
const generateWallet = () => {
    const wallet = ethers_1.ethers.Wallet.createRandom();
    return {
        address: wallet.address,
        privateKey: wallet.privateKey
    };
};
// Create a new admin user
const createAdminUser = async (phoneNumber, email, password) => {
    try {
        // Generate wallet for admin
        const wallet = generateWallet();
        // Hash password in a real scenario
        // For demo purposes we're using plaintext
        // In production, use bcrypt to hash the password
        // Create user with admin role
        const admin = new models_1.User({
            phoneNumber,
            email,
            password, // Should be hashed in production
            walletAddress: wallet.address,
            privateKey: wallet.privateKey,
            isEmailVerified: true,
            isPhoneVerified: true,
            role: 'admin'
        });
        await admin.save();
        console.log('✅ Admin user created successfully');
        console.log('Admin wallet address:', wallet.address);
        return admin;
    }
    catch (error) {
        console.error('❌ Error creating admin user:', error);
        throw error;
    }
};
// Generate and save platform wallets
const setupPlatformWallets = async () => {
    try {
        // Generate main platform wallet
        const mainWallet = generateWallet();
        // Generate fees wallet
        const feesWallet = generateWallet();
        // Update .env file with the new wallet details
        const envPath = path_1.default.resolve(__dirname, '../../.env');
        let envContent = fs_1.default.readFileSync(envPath, 'utf8');
        // Replace or add platform wallet variables
        const updatedContent = envContent
            .replace(/DEV_PLATFORM_WALLET_ADDRESS=.*/g, `DEV_PLATFORM_WALLET_ADDRESS=${mainWallet.address}`)
            .replace(/DEV_PLATFORM_WALLET_PRIVATE_KEY=.*/g, `DEV_PLATFORM_WALLET_PRIVATE_KEY=${mainWallet.privateKey}`)
            .replace(/FEES_WALLET_ADDRESS=.*/g, `FEES_WALLET_ADDRESS=${feesWallet.address}`)
            .replace(/FEES_WALLET_PRIVATE_KEY=.*/g, `FEES_WALLET_PRIVATE_KEY=${feesWallet.privateKey}`);
        // If variables don't exist, add them
        if (!envContent.includes('DEV_PLATFORM_WALLET_ADDRESS=')) {
            envContent += `\nDEV_PLATFORM_WALLET_ADDRESS=${mainWallet.address}`;
        }
        if (!envContent.includes('DEV_PLATFORM_WALLET_PRIVATE_KEY=')) {
            envContent += `\nDEV_PLATFORM_WALLET_PRIVATE_KEY=${mainWallet.privateKey}`;
        }
        if (!envContent.includes('FEES_WALLET_ADDRESS=')) {
            envContent += `\nFEES_WALLET_ADDRESS=${feesWallet.address}`;
        }
        if (!envContent.includes('FEES_WALLET_PRIVATE_KEY=')) {
            envContent += `\nFEES_WALLET_PRIVATE_KEY=${feesWallet.privateKey}`;
        }
        // Write updated content back to .env file
        fs_1.default.writeFileSync(envPath, updatedContent);
        console.log('✅ Platform wallets created successfully');
        console.log('Main platform wallet address:', mainWallet.address);
        console.log('Fees wallet address:', feesWallet.address);
        console.log('Wallet details saved to .env file');
        return { mainWallet, feesWallet };
    }
    catch (error) {
        console.error('❌ Error setting up platform wallets:', error);
        throw error;
    }
};
// Main function
const main = async () => {
    try {
        await connectDatabase();
        console.log('📝 Setting up platform wallets and admin user...');
        // Ask for confirmation
        rl.question('This will generate new platform wallets and update your .env file. Continue? (y/n): ', async (answer) => {
            if (answer.toLowerCase() !== 'y') {
                console.log('Operation cancelled');
                rl.close();
                process.exit(0);
            }
            // Setup platform wallets
            const wallets = await setupPlatformWallets();
            // Get admin user details
            rl.question('Enter admin phone number: ', (phoneNumber) => {
                rl.question('Enter admin email: ', (email) => {
                    rl.question('Enter admin password: ', async (password) => {
                        try {
                            // Create admin user
                            await createAdminUser(phoneNumber, email, password);
                            console.log('✅ Setup completed successfully');
                            // Instructions for the next steps
                            console.log('\n📣 Next steps:');
                            console.log('1. Restart the server to apply the changes');
                            console.log('2. Fund the platform wallet with tokens');
                            console.log('3. Use the admin user to manage the platform');
                            // Close the readline interface
                            rl.close();
                            // Disconnect from MongoDB
                            await mongoose_1.default.disconnect();
                            process.exit(0);
                        }
                        catch (error) {
                            console.error('❌ Setup failed:', error);
                            rl.close();
                            process.exit(1);
                        }
                    });
                });
            });
        });
    }
    catch (error) {
        console.error('❌ Setup failed:', error);
        rl.close();
        process.exit(1);
    }
};
// Run the script
main();
