"use strict";
// import { Request, Response } from 'express';
// import bcrypt from 'bcrypt';
// import { ThirdwebSDK } from "@thirdweb-dev/sdk";
// import { Business } from '../models/businessModel';
// import { User } from '../models/models';
// import { createAccount, generateOTP, otpStore, africastalking, SALT_ROUNDS } from '../services/auth';
// import { handleError } from '../services/utils';
// import config from "../config/env";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transferFundsToPersonal = exports.completeBusinessCreation = exports.requestBusinessCreation = void 0;
const sdk_1 = require("@thirdweb-dev/sdk");
const businessModel_1 = require("../models/businessModel");
const models_1 = require("../models/models");
const auth_1 = require("../services/auth");
const utils_1 = require("../services/utils");
const env_1 = __importDefault(require("../config/env"));
// Utility: Generate Unique Merchant ID (Borderless Till Number)
function generateMerchantId() {
    const timestamp = Date.now().toString().slice(-5);
    const randomDigits = Math.floor(10000 + Math.random() * 90000).toString();
    return `NX-${timestamp}${randomDigits}`;
}
// Step 1: Request Business Creation (Sends OTP)
const requestBusinessCreation = async (req, res) => {
    const { userId, businessName, ownerName, location, businessType, phoneNumber } = req.body;
    if (!userId || !businessName || !ownerName || !location || !businessType || !phoneNumber) {
        return res.status(400).send({ message: 'All fields are required!' });
    }
    try {
        const user = await models_1.User.findById(userId);
        if (!user) {
            return res.status(404).send({ message: 'User not found. Please create a personal account first.' });
        }
        const existingBusiness = await businessModel_1.Business.findOne({ userId, businessName });
        if (existingBusiness) {
            return res.status(409).send({ message: 'A business with this name already exists for this user.' });
        }
        // Generate OTP for verification
        const otp = (0, auth_1.generateOTP)();
        auth_1.otpStore[phoneNumber] = otp;
        console.log(`✅ Business Creation OTP for ${phoneNumber}: ${otp}`);
        await auth_1.africastalking.SMS.send({
            to: [phoneNumber],
            message: `Your business creation verification code is: ${otp}`,
            from: 'NEXUSPAY',
        });
        return res.send({ message: 'OTP sent successfully. Please verify to complete business creation.' });
    }
    catch (error) {
        console.error('❌ Error in business creation request:', error);
        return (0, utils_1.handleError)(error, res, 'Failed to process business creation request.');
    }
};
exports.requestBusinessCreation = requestBusinessCreation;
// Step 2: Complete Business Creation (Creates Business Wallet)
const completeBusinessCreation = async (req, res) => {
    const { userId, phoneNumber, otp, businessName, ownerName, location, businessType } = req.body;
    if (!userId || !phoneNumber || !otp || !businessName || !ownerName || !location || !businessType) {
        return res.status(400).send({ message: 'All fields are required!' });
    }
    if (!auth_1.otpStore[phoneNumber] || auth_1.otpStore[phoneNumber] !== otp) {
        return res.status(400).send({ message: 'Invalid or expired OTP.' });
    }
    delete auth_1.otpStore[phoneNumber]; // Clear OTP after verification
    try {
        const user = await models_1.User.findById(userId);
        if (!user) {
            return res.status(404).send({ message: 'User not found. Please create a personal account first.' });
        }
        // Create Business Wallet Using Thirdweb SDK
        const { pk, walletAddress } = await (0, auth_1.createAccount)(); // Create business wallet
        const merchantId = generateMerchantId(); // Universal till number
        const business = new businessModel_1.Business({
            businessName,
            ownerName,
            location,
            businessType,
            phoneNumber,
            merchantId, // Borderless till number
            walletAddress,
            privateKey: pk,
            userId: user._id,
        });
        await business.save();
        return res.send({
            message: 'Business created successfully!',
            walletAddress,
            merchantId,
        });
    }
    catch (error) {
        console.error('❌ Error in completing business creation:', error);
        return res.status(500).send({ message: 'Failed to create business.' });
    }
};
exports.completeBusinessCreation = completeBusinessCreation;
// Step 3: Secure Business-to-Personal Wallet Transfers (OTP Required)
const transferFundsToPersonal = async (req, res) => {
    const { businessId, amount, otp } = req.body;
    if (!businessId || !amount || !otp) {
        return res.status(400).send({ message: 'Business ID, amount, and OTP are required!' });
    }
    const business = await businessModel_1.Business.findById(businessId);
    if (!business) {
        return res.status(404).send({ message: 'Business account not found.' });
    }
    const user = await models_1.User.findById(business.userId);
    if (!user) {
        return res.status(404).send({ message: 'User account not found.' });
    }
    if (!auth_1.otpStore[user.phoneNumber] || auth_1.otpStore[user.phoneNumber] !== otp) {
        return res.status(400).send({ message: 'Invalid or expired OTP.' });
    }
    delete auth_1.otpStore[user.phoneNumber]; // Clear OTP after verification
    try {
        // Initialize Thirdweb SDK for blockchain transactions
        const sdk = sdk_1.ThirdwebSDK.fromPrivateKey(business.privateKey, // Business wallet private key
        env_1.default.arbitrum.chainId, // Use Arbitrum chain from config
        { secretKey: env_1.default.THIRDWEB_SECRET_KEY });
        const businessWallet = sdk.wallet;
        // Transfer funds from Business Wallet to User's Personal Wallet
        const tx = await businessWallet.transfer(user.walletAddress, amount);
        console.log(`✅ Business-to-Personal Transfer: ${tx.receipt.transactionHash}`);
        return res.send({
            message: 'Funds transferred successfully!',
            transactionHash: tx.receipt.transactionHash,
        });
    }
    catch (error) {
        console.error('❌ Error transferring funds:', error);
        return res.status(500).send({ message: 'Failed to transfer funds.' });
    }
};
exports.transferFundsToPersonal = transferFundsToPersonal;
