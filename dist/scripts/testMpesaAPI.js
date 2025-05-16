"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/scripts/testMpesaAPI.ts
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = require("dotenv");
const readline_1 = __importDefault(require("readline"));
(0, dotenv_1.config)();
// Create readline interface
const rl = readline_1.default.createInterface({
    input: process.stdin,
    output: process.stdout
});
// Base URL for API requests
const API_URL = process.env.API_URL || 'http://localhost:8000/api';
// Auth token (will be set after login)
let authToken = '';
// Helper to prompt user for input
const prompt = (question) => {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
};
// Login function to get auth token
async function login() {
    try {
        const phone = await prompt('Enter phone number: ');
        // Request OTP
        console.log('Requesting OTP...');
        await axios_1.default.post(`${API_URL}/auth/otp`, { phone });
        const otp = await prompt('Enter OTP received: ');
        // Verify OTP and get token
        console.log('Verifying OTP...');
        const response = await axios_1.default.post(`${API_URL}/auth/verify-otp`, { phone, otp });
        authToken = response.data.data.token;
        console.log('Login successful! Token acquired.');
        return true;
    }
    catch (error) {
        const axiosError = error;
        console.error('Login failed:', axiosError.response?.data || axiosError.message);
        return false;
    }
}
// Test MPESA Deposit
async function testDeposit() {
    try {
        const amount = await prompt('Enter deposit amount (KES): ');
        const phone = await prompt('Enter phone number for STK push: ');
        console.log(`Initiating deposit of ${amount} KES to ${phone}...`);
        const response = await axios_1.default.post(`${API_URL}/mpesa/deposit`, { amount, phone }, { headers: { Authorization: `Bearer ${authToken}` } });
        console.log('Deposit initiated successfully:');
        console.log(JSON.stringify(response.data, null, 2));
        // If successful, get the transaction ID for later status check
        if (response.data.success && response.data.data.transactionId) {
            return response.data.data.transactionId;
        }
        return null;
    }
    catch (error) {
        const axiosError = error;
        console.error('Deposit failed:', axiosError.response?.data || axiosError.message);
        return null;
    }
}
// Test MPESA Withdrawal
async function testWithdrawal() {
    try {
        const amount = await prompt('Enter withdrawal amount (crypto): ');
        const phone = await prompt('Enter phone number for withdrawal: ');
        console.log(`Initiating withdrawal of ${amount} crypto to ${phone}...`);
        const response = await axios_1.default.post(`${API_URL}/mpesa/withdraw`, { amount, phone }, { headers: { Authorization: `Bearer ${authToken}` } });
        console.log('Withdrawal initiated successfully:');
        console.log(JSON.stringify(response.data, null, 2));
        // If successful, get the transaction ID for later status check
        if (response.data.success && response.data.data.transactionId) {
            return response.data.data.transactionId;
        }
        return null;
    }
    catch (error) {
        const axiosError = error;
        console.error('Withdrawal failed:', axiosError.response?.data || axiosError.message);
        return null;
    }
}
// Test Paybill Payment
async function testPaybill() {
    try {
        const amount = await prompt('Enter payment amount (crypto): ');
        const businessNumber = await prompt('Enter paybill number: ');
        const accountNumber = await prompt('Enter account number: ');
        console.log(`Initiating payment of ${amount} crypto to paybill ${businessNumber}...`);
        const response = await axios_1.default.post(`${API_URL}/mpesa/paybill`, {
            amount,
            phone: '254700000000', // Default phone for platform payments
            businessNumber,
            accountNumber
        }, { headers: { Authorization: `Bearer ${authToken}` } });
        console.log('Paybill payment initiated successfully:');
        console.log(JSON.stringify(response.data, null, 2));
        return response.data.data?.transactionId || null;
    }
    catch (error) {
        const axiosError = error;
        console.error('Paybill payment failed:', axiosError.response?.data || axiosError.message);
        return null;
    }
}
// Test Transaction Status
async function checkTransactionStatus(transactionId) {
    try {
        console.log(`Checking status for transaction: ${transactionId}...`);
        const response = await axios_1.default.get(`${API_URL}/mpesa/transaction/${transactionId}`, { headers: { Authorization: `Bearer ${authToken}` } });
        console.log('Transaction status:');
        console.log(JSON.stringify(response.data, null, 2));
    }
    catch (error) {
        const axiosError = error;
        console.error('Status check failed:', axiosError.response?.data || axiosError.message);
    }
}
// Main menu
async function showMenu() {
    console.log('\n===== MPESA API TEST MENU =====');
    console.log('1. Test Deposit (STK Push)');
    console.log('2. Test Withdrawal (B2C)');
    console.log('3. Test Paybill Payment');
    console.log('4. Check Transaction Status');
    console.log('5. Exit');
    const choice = await prompt('\nEnter your choice (1-5): ');
    switch (choice) {
        case '1':
            const depositTxnId = await testDeposit();
            if (depositTxnId) {
                await checkTransactionStatus(depositTxnId);
            }
            break;
        case '2':
            const withdrawalTxnId = await testWithdrawal();
            if (withdrawalTxnId) {
                await checkTransactionStatus(withdrawalTxnId);
            }
            break;
        case '3':
            const paybillTxnId = await testPaybill();
            if (paybillTxnId) {
                await checkTransactionStatus(paybillTxnId);
            }
            break;
        case '4':
            const txnId = await prompt('Enter transaction ID: ');
            await checkTransactionStatus(txnId);
            break;
        case '5':
            console.log('Exiting...');
            rl.close();
            return;
        default:
            console.log('Invalid choice. Please try again.');
    }
    await showMenu();
}
// Main function
async function main() {
    console.log('====== NEXUSPAY MPESA API TEST TOOL ======');
    // First, login to get auth token
    const loggedIn = await login();
    if (loggedIn) {
        await showMenu();
    }
    else {
        console.log('Failed to login. Exiting...');
        rl.close();
    }
}
// Run the main function
main().catch((error) => {
    console.error('Unhandled error:', error);
    rl.close();
});
