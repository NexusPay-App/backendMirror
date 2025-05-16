"use strict";
// import { Request, Response } from 'express';
// import { User } from '../models/models';
// import { Business } from '../models/businessModel';
// import { ethers } from 'ethers';
// import { africastalking } from '../services/auth';
// import { sendToken } from '../services/token';
// import { Chain } from '../types/token';
// import { getAllTokenTransferEvents } from '../services/token';
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWallet = exports.migrate = exports.unify = exports.tokenTransferEvents = exports.pay = exports.send = void 0;
const models_1 = require("../models/models");
const businessModel_1 = require("../models/businessModel");
const ethers_1 = require("ethers");
const auth_1 = require("../services/auth");
const token_1 = require("../services/token");
const wallets_1 = require("thirdweb/wallets");
const thirdweb_1 = require("thirdweb");
const env_1 = __importDefault(require("../config/env"));
const bcrypt = __importStar(require("bcrypt"));
const send = async (req, res) => {
    const { recipientIdentifier, amount, senderAddress, chain } = req.body;
    if (!recipientIdentifier || !amount || !senderAddress || !chain) {
        console.log("Send request failed: Missing required parameters");
        return res.status(400).send({ message: "Required parameters are missing!" });
    }
    console.log("Received send request:", { amount, senderAddress, recipientIdentifier, chain });
    let recipientAddress = recipientIdentifier;
    let recipientPhone = '';
    try {
        const sender = await models_1.User.findOne({ walletAddress: senderAddress });
        if (!sender) {
            console.error("Sender not found for address:", senderAddress);
            return res.status(404).send({ message: "Sender wallet not found!" });
        }
        if (!ethers_1.ethers.utils.isAddress(recipientIdentifier)) {
            const recipient = await models_1.User.findOne({ phoneNumber: recipientIdentifier });
            if (!recipient) {
                console.log("Recipient not found for phoneNumber:", recipientIdentifier);
                return res.status(404).send({ message: "Recipient not found!" });
            }
            recipientAddress = recipient.walletAddress;
            recipientPhone = recipient.phoneNumber;
        }
        if (chain !== 'celo' && chain !== 'arbitrum') {
            console.log("Invalid chain:", chain);
            return res.status(400).send({ message: "Unsupported chain!" });
        }
        console.log("Sending token with params:", {
            recipientAddress,
            amount,
            chain,
            senderPrivateKey: sender.privateKey ? "exists" : "missing"
        });
        if (!sender.privateKey) {
            console.log("Sender private key missing for:", senderAddress);
            return res.status(400).send({ message: "Sender private key not found in database!" });
        }
        const result = await (0, token_1.sendToken)(recipientAddress, amount, chain, sender.privateKey);
        const currentDateTime = new Date().toLocaleString('en-KE', {
            timeZone: 'Africa/Nairobi'
        });
        const transactionCode = Math.random().toString(36).substring(2, 12).toUpperCase();
        const amountDisplay = `${amount} USDC`;
        if (recipientPhone) {
            await auth_1.africastalking.SMS.send({
                to: recipientPhone,
                message: `${transactionCode} Confirmed. ${amountDisplay} received from ${sender.phoneNumber} on ${currentDateTime}`,
                from: 'NEXUSPAY'
            });
            console.log(`SMS sent to recipient: ${recipientPhone}`);
        }
        await auth_1.africastalking.SMS.send({
            to: sender.phoneNumber,
            message: `${transactionCode} Confirmed. ${amountDisplay} sent to ${recipientPhone || recipientAddress} on ${currentDateTime}`,
            from: 'NEXUSPAY'
        });
        console.log(`SMS sent to sender: ${sender.phoneNumber}`);
        res.send({
            message: 'Token sent successfully!',
            transactionCode,
            amount: amountDisplay,
            recipient: recipientPhone || recipientAddress,
            timestamp: currentDateTime,
            transactionHash: result.transactionHash
        });
    }
    catch (error) {
        console.error("Error in send API:", error);
        res.status(500).send({
            message: 'Failed to send token.',
            error: error.message || 'Unknown error occurred'
        });
    }
};
exports.send = send;
const pay = async (req, res) => {
    const { senderAddress, businessUniqueCode, amount, confirm, chain } = req.body;
    if (!businessUniqueCode || !amount || !senderAddress) {
        console.log("Pay request failed: Missing required parameters");
        return res.status(400).send({ message: "Required parameters are missing!" });
    }
    const sender = await models_1.User.findOne({ walletAddress: senderAddress });
    const business = await businessModel_1.Business.findOne({ uniqueCode: businessUniqueCode });
    if (!business) {
        console.log("Business not found for uniqueCode:", businessUniqueCode);
        return res.status(404).send({ message: "Business not found!" });
    }
    if (!sender) {
        console.log("Sender not found for address:", senderAddress);
        return res.status(404).send({ message: "Sender not found!" });
    }
    if (!confirm) {
        console.log("Payment confirmation required for:", businessUniqueCode);
        return res.status(200).send({
            message: "Please confirm the payment to the business.",
            businessName: business.businessName
        });
    }
    try {
        if (!sender.privateKey) {
            console.log("Sender private key missing for:", senderAddress);
            return res.status(400).send({ message: "Sender private key not found in database!" });
        }
        const result = await (0, token_1.sendToken)(business.walletAddress, amount, chain || 'celo', sender.privateKey);
        console.log(`Payment successful to ${business.walletAddress}: ${result.transactionHash}`);
        res.send({
            message: 'Token sent successfully to the business!',
            paid: true,
            transactionHash: result.transactionHash
        });
    }
    catch (error) {
        console.error("Error in pay API:", error);
        res.status(500).send({
            message: 'Failed to send token.',
            error: error.message || 'Unknown error occurred'
        });
    }
};
exports.pay = pay;
const tokenTransferEvents = async (req, res) => {
    const { address, chain } = req.query;
    if (!address) {
        console.log("Token transfer events request failed: Address missing");
        return res.status(400).send('Address is required as a query parameter.');
    }
    if (!chain) {
        console.log("Token transfer events request failed: Chain missing");
        return res.status(400).send('Chain is required as a query parameter.');
    }
    if (!['arbitrum', 'celo'].includes(chain)) {
        console.log("Invalid chain for token transfer events:", chain);
        return res.status(400).send('Invalid chain parameter. Supported chains are arbitrum and celo.');
    }
    try {
        const events = await (0, token_1.getAllTokenTransferEvents)(chain, address);
        console.log(`Fetched token transfer events for ${address} on ${chain}`);
        res.json(events);
    }
    catch (error) {
        console.error('Error fetching token transfer events:', error);
        res.status(500).send({
            message: 'Internal server error',
            error: error.message || 'Unknown error occurred'
        });
    }
};
exports.tokenTransferEvents = tokenTransferEvents;
const unify = async (req, res) => {
    const { phoneNumber, password, otp } = req.body;
    if (!phoneNumber) {
        console.log("Unify request failed: Phone number missing");
        return res.status(400).send({ message: "Phone number is required." });
    }
    try {
        console.log(`Unifying wallets for phoneNumber: ${phoneNumber}`);
        const user = await models_1.User.findOne({ phoneNumber });
        if (!user) {
            console.log(`User not found for phoneNumber: ${phoneNumber}`);
            return res.status(404).send({ message: "Phone number not registered." });
        }
        const status = {
            phoneNumberExists: true,
            isLocked: user.lockoutUntil && Date.now() < user.lockoutUntil,
            failedAttempts: user.failedPasswordAttempts,
            isUnified: user.isUnified,
        };
        console.log(`User status for ${phoneNumber}:`, status);
        if (user.isUnified) {
            console.log(`Wallets already unified for ${phoneNumber}. Current wallet: ${user.walletAddress}`);
            return res.status(200).send({
                message: "Wallets have already been unified.",
                unifiedWalletAddress: user.walletAddress,
            });
        }
        if (status.isLocked) {
            const timeLeft = Math.ceil((user.lockoutUntil - Date.now()) / (1000 * 60));
            console.log(`User locked out until: ${new Date(user.lockoutUntil).toISOString()}`);
            return res.status(429).send({
                message: `Too many failed attempts. Please try again in ${timeLeft} minutes using OTP or password.`,
            });
        }
        if (!otp) {
            if (!password) {
                console.log(`No password provided for ${phoneNumber}, prompting OTP`);
                const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
                console.log(`Generated OTP: ${generatedOtp} for ${phoneNumber}`);
                try {
                    const smsResponse = await auth_1.africastalking.SMS.send({
                        to: phoneNumber,
                        message: `Your unification OTP is ${generatedOtp}. Valid for 5 minutes.`,
                        from: 'NEXUSPAY'
                    });
                    console.log(`SMS sent successfully to ${phoneNumber}:`, smsResponse);
                }
                catch (smsError) {
                    console.error(`Failed to send SMS to ${phoneNumber}:`, smsError);
                    return res.status(500).send({ message: "Failed to send OTP. Please try again." });
                }
                user.tempOtp = generatedOtp;
                user.otpExpires = Date.now() + 5 * 60 * 1000;
                await user.save();
                console.log(`OTP saved for ${phoneNumber}, expires at: ${new Date(user.otpExpires).toISOString()}`);
                return res.status(200).send({ message: "OTP sent to your phone. Please provide it to proceed." });
            }
            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                user.failedPasswordAttempts += 1;
                console.log(`Incorrect password for ${phoneNumber}. Attempts: ${user.failedPasswordAttempts}`);
                if (user.failedPasswordAttempts >= 5) {
                    user.lockoutUntil = Date.now() + 60 * 60 * 1000;
                    user.failedPasswordAttempts = 0;
                    await user.save();
                    console.log(`User locked out until: ${new Date(user.lockoutUntil).toISOString()}`);
                    return res.status(429).send({
                        message: "Too many failed attempts. Please try again in 1 hour using OTP or password.",
                    });
                }
                await user.save();
                return res.status(401).send({
                    message: "Incorrect password. Please verify your password or use OTP instead.",
                    attempts: user.failedPasswordAttempts,
                });
            }
            user.failedPasswordAttempts = 0;
            await user.save();
            console.log(`Password authenticated for ${phoneNumber}`);
        }
        else {
            if (user.tempOtp !== otp || !user.otpExpires || Date.now() > user.otpExpires) {
                console.log(`OTP validation failed for ${phoneNumber}: tempOtp=${user.tempOtp}, otp=${otp}, expires=${user.otpExpires}`);
                return res.status(400).send({ message: "Invalid or expired OTP." });
            }
            console.log(`OTP validated successfully for ${phoneNumber}`);
        }
        const unifiedAddress = await (0, token_1.unifyWallets)(user.privateKey);
        console.log(`Unified address generated: ${unifiedAddress}`);
        user.walletAddress = unifiedAddress;
        user.isUnified = true;
        user.tempOtp = undefined;
        user.otpExpires = undefined;
        await user.save();
        console.log(`User updated with unified address: ${unifiedAddress}, marked as unified`);
        res.send({
            message: "Wallets unified successfully!",
            unifiedWalletAddress: unifiedAddress,
        });
    }
    catch (error) {
        console.error(`Error in unify API for ${phoneNumber}:`, error);
        res.status(500).send({
            message: "Failed to unify wallets.",
            error: error.message || "Unknown error occurred",
        });
    }
};
exports.unify = unify;
const migrate = async (req, res) => {
    const { phoneNumber, password, otp } = req.body;
    console.log("Raw request body:", req.body);
    if (!phoneNumber) {
        console.log("Migrate request failed: Phone number missing");
        return res.status(400).send({ message: "Phone number is required." });
    }
    try {
        console.log(`Migrating funds for phoneNumber: ${phoneNumber}`);
        const user = await models_1.User.findOne({ phoneNumber });
        if (!user) {
            console.log(`User not found for phoneNumber: ${phoneNumber}`);
            return res.status(404).send({ message: "User not found." });
        }
        if (!user.isUnified || !user.walletAddress) {
            console.log(`User ${phoneNumber} has no unified wallet to migrate to`);
            return res.status(400).send({ message: "User wallet is not unified. Please unify wallets first." });
        }
        if (!otp) {
            if (!password) {
                console.log(`No password provided for ${phoneNumber}, prompting OTP`);
                const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
                console.log(`Generated OTP: ${generatedOtp} for ${phoneNumber}`);
                try {
                    const smsResponse = await auth_1.africastalking.SMS.send({
                        to: phoneNumber,
                        message: `Your migration OTP is ${generatedOtp}. Valid for 5 minutes.`,
                        from: 'NEXUSPAY'
                    });
                    console.log(`SMS sent successfully to ${phoneNumber}:`, smsResponse);
                }
                catch (smsError) {
                    console.error(`Failed to send SMS to ${phoneNumber}:`, smsError);
                    return res.status(500).send({ message: "Failed to send OTP. Please try again." });
                }
                user.tempOtp = generatedOtp;
                user.otpExpires = Date.now() + 5 * 60 * 1000;
                await user.save();
                console.log(`OTP saved for ${phoneNumber}, expires at: ${new Date(user.otpExpires).toISOString()}`);
                return res.status(200).send({ message: "OTP sent to your phone. Please provide it to proceed." });
            }
            console.log(`Attempting password validation for ${phoneNumber}`);
            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                console.log(`Incorrect password for ${phoneNumber}`);
                return res.status(401).send({ message: "Incorrect password. Please verify your password or use OTP." });
            }
            console.log(`Password authenticated for ${phoneNumber}`);
        }
        else {
            if (user.tempOtp !== otp || !user.otpExpires || Date.now() > user.otpExpires) {
                console.log(`OTP validation failed for ${phoneNumber}: tempOtp=${user.tempOtp}, otp=${otp}, expires=${user.otpExpires}`);
                return res.status(400).send({ message: "Invalid or expired OTP." });
            }
            console.log(`OTP validated successfully for ${phoneNumber}`);
        }
        if (!user.privateKey) {
            console.log(`Private key missing for ${phoneNumber}`);
            return res.status(400).send({ message: "Private key not found in database!" });
        }
        const personalAccount = (0, wallets_1.privateKeyToAccount)({ client: auth_1.client, privateKey: user.privateKey });
        const unifiedWalletAddress = user.walletAddress;
        const chains = [
            { name: 'celo', chainId: env_1.default.celo.chainId, tokenAddress: env_1.default.celo.tokenAddress },
            { name: 'arbitrum', chainId: env_1.default.arbitrum.chainId, tokenAddress: env_1.default.arbitrum.tokenAddress },
        ];
        const migrationResults = [];
        // Log unified wallet address
        console.log(`Unified wallet address: ${unifiedWalletAddress}`);
        for (const chain of chains) {
            try {
                const sourceWallet = (0, wallets_1.smartWallet)({
                    chain: (0, thirdweb_1.defineChain)(chain.chainId),
                    sponsorGas: false,
                });
                const sourceAccount = await sourceWallet.connect({
                    client: auth_1.client,
                    personalAccount
                });
                console.log(`Previous ${chain.name} address: ${sourceAccount.address}`);
                // Check balance
                const contract = (0, thirdweb_1.getContract)({
                    client: auth_1.client,
                    chain: (0, thirdweb_1.defineChain)(chain.chainId),
                    address: chain.tokenAddress,
                });
                const balance = await (0, thirdweb_1.readContract)({
                    contract,
                    method: "function balanceOf(address) view returns (uint256)",
                    params: [sourceAccount.address],
                });
                const decimals = 6;
                const balanceInUSDC = Number(balance) / 10 ** decimals;
                console.log(`USDC balance on ${chain.name} for ${sourceAccount.address}: ${balanceInUSDC}`);
                if (balanceInUSDC > 0) {
                    const result = await (0, token_1.migrateFunds)(sourceAccount.address, unifiedWalletAddress, chain.name, user.privateKey);
                    migrationResults.push({ chain: chain.name, transactionHash: result.transactionHash });
                    console.log(`Funds migrated on ${chain.name}: ${result.transactionHash}`);
                }
                else {
                    migrationResults.push({ chain: chain.name, message: "No balance to migrate" });
                    console.log(`No USDC balance to migrate on ${chain.name}`);
                }
            }
            catch (error) {
                console.error(`Migration failed for ${chain.name}:`, {
                    errorMessage: error.message,
                    errorDetails: error.shortMessage || error.details,
                });
                migrationResults.push({ chain: chain.name, error: error.message || "Migration failed" });
            }
        }
        user.tempOtp = undefined;
        user.otpExpires = undefined;
        await user.save();
        console.log(`OTP cleared for ${phoneNumber}`);
        res.send({
            message: "Funds migration attempted for all chains.",
            unifiedWalletAddress,
            migrationResults,
        });
    }
    catch (error) {
        console.error(`Error in migrate API for ${phoneNumber}:`, error);
        res.status(500).send({
            message: "Failed to migrate funds.",
            error: error.message || "Unknown error occurred",
        });
    }
};
exports.migrate = migrate;
const getWallet = async (req, res) => {
    const { phoneNumber } = req.query;
    if (!phoneNumber || typeof phoneNumber !== 'string') {
        console.log("Get wallet request failed: Phone number missing or invalid");
        return res.status(400).send({ message: "Phone number is required as a query parameter." });
    }
    try {
        console.log(`Fetching wallet details for phoneNumber (raw): ${phoneNumber}`);
        const normalizedPhoneNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
        console.log(`Fetching wallet details for phoneNumber (normalized): ${normalizedPhoneNumber}`);
        const user = await models_1.User.findOne({ phoneNumber: normalizedPhoneNumber });
        if (!user) {
            console.log(`User not found for phoneNumber: ${normalizedPhoneNumber}`);
            return res.status(404).send({ message: "Phone number not registered." });
        }
        const walletDetails = {
            phoneNumber: user.phoneNumber,
            unifiedWalletAddress: user.walletAddress,
            isUnified: user.isUnified,
        };
        console.log(`Wallet details for ${normalizedPhoneNumber}:`, walletDetails);
        const balances = {};
        const chains = [
            { name: 'celo', chainId: env_1.default.celo.chainId, tokenAddress: env_1.default.celo.tokenAddress },
            { name: 'arbitrum', chainId: env_1.default.arbitrum.chainId, tokenAddress: env_1.default.arbitrum.tokenAddress },
        ];
        for (const chain of chains) {
            try {
                console.log(`Fetching balance for ${chain.name} - Chain ID: ${chain.chainId}, Token Address: ${chain.tokenAddress}`);
                const contract = (0, thirdweb_1.getContract)({
                    client: auth_1.client,
                    chain: (0, thirdweb_1.defineChain)(chain.chainId),
                    address: chain.tokenAddress,
                });
                const balance = await (0, thirdweb_1.readContract)({
                    contract,
                    method: "function balanceOf(address) view returns (uint256)",
                    params: [user.walletAddress],
                });
                console.log(`Raw balance on ${chain.name} for ${user.walletAddress}: ${balance}`);
                const decimals = 6;
                const balanceInUSDC = Number(balance) / 10 ** decimals;
                balances[chain.name] = balanceInUSDC;
                console.log(`Balance on ${chain.name} for ${user.walletAddress}: ${balanceInUSDC} USDC`);
            }
            catch (error) {
                console.error(`Failed to fetch balance on ${chain.name} for ${normalizedPhoneNumber}:`, {
                    errorMessage: error.message,
                    errorDetails: error.shortMessage || error.details,
                    chainId: chain.chainId,
                    tokenAddress: chain.tokenAddress,
                });
                balances[chain.name] = 0;
                console.log(`Set balance on ${chain.name} to 0 due to fetch error`);
            }
        }
        res.send({
            message: "Wallet details retrieved successfully",
            wallet: {
                ...walletDetails,
                balances,
            },
        });
    }
    catch (error) {
        console.error(`Error in getWallet API for ${phoneNumber}:`, error);
        res.status(500).send({
            message: "Failed to retrieve wallet details.",
            error: error.message || "Unknown error occurred",
        });
    }
};
exports.getWallet = getWallet;
//################ end new Code for Migrations #####################
