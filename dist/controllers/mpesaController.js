"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.withdrawFeesToMainWallet = exports.getPlatformWalletStatus = exports.getTransactionStatus = exports.mpesaQueueWebhook = exports.mpesaB2CWebhook = exports.mpesaSTKPushWebhook = exports.buyCrypto = exports.payToTill = exports.payToPaybill = exports.withdrawToMpesa = exports.mpesaWithdraw = exports.mpesaDeposit = void 0;
const models_1 = require("../models/models");
const businessModel_1 = require("../models/businessModel");
const escrowModel_1 = require("../models/escrowModel");
const mpesa_1 = require("../services/mpesa");
const env_1 = __importDefault(require("../config/env"));
const token_1 = require("../services/token");
const rates_1 = require("../services/rates");
const crypto_1 = require("crypto");
const utils_1 = require("../services/utils");
const platformWallet_1 = require("../services/platformWallet");
/**
 * Initiate an MPESA STK Push to deposit funds and convert to crypto
 */
const mpesaDeposit = async (req, res, next) => {
    try {
        const { amount, phone } = req.body;
        // Debug logging
        console.log("✅ Deposit request body:", req.body);
        // Validate user authentication
        if (!req.user) {
            return res.status(401).json((0, utils_1.standardResponse)(false, "Authentication required", null, { code: "AUTH_REQUIRED", message: "You must be logged in to perform this action" }));
        }
        const authenticatedUser = req.user;
        // Validate input - although we have validators, this is a fallback
        if (!amount || !phone) {
            return res.status(400).json((0, utils_1.standardResponse)(false, "Missing required fields", null, { code: "MISSING_FIELDS", message: "Amount and phone are required" }));
        }
        // Validate amount
        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            return res.status(400).json((0, utils_1.standardResponse)(false, "Invalid amount", null, { code: "INVALID_AMOUNT", message: "Amount must be a positive number" }));
        }
        // Format the phone number
        let formattedPhone = phone.replace(/\D/g, '');
        // Ensure it starts with the correct country code
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '254' + formattedPhone.substring(1);
        }
        else if (!formattedPhone.startsWith('254')) {
            formattedPhone = '254' + formattedPhone;
        }
        // Get conversion rate
        const conversionRate = await (0, rates_1.getConversionRateWithCaching)();
        // Calculate crypto amount based on MPESA amount
        const cryptoAmount = amountNum / conversionRate;
        // Create a unique transaction ID
        const transactionId = (0, crypto_1.randomUUID)();
        // Create an escrow record to track this transaction
        const escrow = new escrowModel_1.Escrow({
            transactionId,
            userId: authenticatedUser._id,
            amount: amountNum,
            cryptoAmount,
            type: 'fiat_to_crypto',
            status: 'pending'
        });
        // Save the initial escrow record
        await escrow.save();
        // Initiate STK Push
        try {
            const queryData = await (0, mpesa_1.initiateSTKPush)(formattedPhone, env_1.default.MPESA_SHORTCODE, amountNum, "NexusPay Deposit", authenticatedUser._id.toString());
            if (!queryData || queryData.ResultCode !== "0") {
                escrow.status = 'failed';
                escrow.completedAt = new Date();
                await escrow.save();
                return res.status(400).json((0, utils_1.standardResponse)(false, "MPESA transaction unsuccessful", null, {
                    code: "STK_PUSH_FAILED",
                    message: queryData?.errorMessage || "Failed to initiate MPESA transaction"
                }));
            }
            // Update escrow with MPESA transaction ID
            escrow.mpesaTransactionId = queryData.CheckoutRequestID;
            await escrow.save();
            return res.json((0, utils_1.standardResponse)(true, "Transaction initiated successfully", {
                transactionId: escrow.transactionId,
                amount: amountNum,
                expectedCryptoAmount: parseFloat(cryptoAmount.toFixed(6)),
                status: 'pending',
                checkoutRequestId: queryData.CheckoutRequestID,
                createdAt: escrow.createdAt,
                estimatedCompletionTime: new Date(Date.now() + 2 * 60 * 1000) // 2 minutes from now
            }));
        }
        catch (mpesaError) {
            // Handle MPESA API errors
            escrow.status = 'failed';
            escrow.completedAt = new Date();
            await escrow.save();
            console.error("❌ MPESA STK Push API Error:", mpesaError);
            return res.status(500).json((0, utils_1.standardResponse)(false, "MPESA transaction failed", null, {
                code: "MPESA_API_ERROR",
                message: mpesaError.response?.data?.errorMessage || mpesaError.message || "Unknown error"
            }));
        }
    }
    catch (error) {
        console.error("❌ Deposit error:", error);
        return (0, utils_1.handleError)(error, res, "Failed to process deposit request");
    }
};
exports.mpesaDeposit = mpesaDeposit;
const mpesaWithdraw = async (req, res, next) => {
    try {
        const { amount, businessId } = req.body;
        if (!req.user) {
            return res.status(401).json({ message: "User not authenticated" });
        }
        const authenticatedUser = req.user;
        if (!amount || !businessId) {
            return res.status(400).json({ message: "Amount and businessId are required" });
        }
        const business = await businessModel_1.Business.findById(businessId);
        if (!business) {
            return res.status(404).json({ message: "Business not found" });
        }
        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            return res.status(400).json({ message: "Invalid amount" });
        }
        const conversionRate = await (0, rates_1.getConversionRateWithCaching)();
        const fiatAmount = amountNum * conversionRate;
        const escrow = new escrowModel_1.Escrow({
            transactionId: (0, crypto_1.randomUUID)(),
            userId: authenticatedUser._id,
            amount: fiatAmount,
            cryptoAmount: amountNum,
            type: 'crypto_to_fiat',
            status: 'pending'
        });
        await escrow.save();
        const merchantIdNumber = parseInt(business.merchantId, 10);
        if (isNaN(merchantIdNumber)) {
            escrow.status = 'failed';
            await escrow.save();
            return res.status(400).json({ message: "Invalid merchant ID format" });
        }
        const serviceAcceptedObj = await (0, mpesa_1.initiateB2C)(fiatAmount, merchantIdNumber);
        if (!serviceAcceptedObj || serviceAcceptedObj.ResponseCode !== "0") {
            escrow.status = 'failed';
            await escrow.save();
            return res.status(400).json({ message: "Failed to initiate withdrawal" });
        }
        escrow.mpesaTransactionId = serviceAcceptedObj.ConversationID;
        await escrow.save();
        res.json({
            message: "Withdrawal initiated",
            transactionId: escrow.transactionId,
            status: 'pending'
        });
    }
    catch (error) {
        console.error("Withdrawal error:", error);
        next(error);
    }
};
exports.mpesaWithdraw = mpesaWithdraw;
/**
 * Withdraw funds from crypto to MPESA
 */
const withdrawToMpesa = async (req, res, next) => {
    try {
        const { amount, phone } = req.body;
        // Validate user authentication
        if (!req.user) {
            return res.status(401).json((0, utils_1.standardResponse)(false, "Authentication required", null, { code: "AUTH_REQUIRED", message: "You must be logged in to perform this action" }));
        }
        const authenticatedUser = req.user;
        // Validate input
        if (!amount || !phone) {
            return res.status(400).json((0, utils_1.standardResponse)(false, "Missing required fields", null, { code: "MISSING_FIELDS", message: "Amount and phone are required" }));
        }
        // Validate amount
        const cryptoAmount = parseFloat(amount);
        if (isNaN(cryptoAmount) || cryptoAmount <= 0) {
            return res.status(400).json((0, utils_1.standardResponse)(false, "Invalid amount", null, { code: "INVALID_AMOUNT", message: "Amount must be a positive number" }));
        }
        // Format phone number
        let formattedPhone = phone.replace(/\D/g, '');
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '254' + formattedPhone.substring(1);
        }
        else if (!formattedPhone.startsWith('254')) {
            formattedPhone = '254' + formattedPhone;
        }
        // Get numeric part of phone for B2C
        const phoneNumber = parseInt(formattedPhone, 10);
        if (isNaN(phoneNumber)) {
            return res.status(400).json((0, utils_1.standardResponse)(false, "Invalid phone number format", null, { code: "INVALID_PHONE", message: "Phone number must be numeric" }));
        }
        // Check if user has sufficient balance
        try {
            const userBalance = await (0, platformWallet_1.getWalletBalance)(authenticatedUser.walletAddress, 'celo');
            if (userBalance < cryptoAmount) {
                return res.status(400).json((0, utils_1.standardResponse)(false, "Insufficient balance", null, {
                    code: "INSUFFICIENT_BALANCE",
                    message: `Your balance (${userBalance.toFixed(6)}) is less than the requested amount (${cryptoAmount.toFixed(6)})`
                }));
            }
        }
        catch (balanceError) {
            console.error("❌ Error checking user balance:", balanceError);
            // Continue with the transaction, we'll catch errors in the token transfer step
        }
        // Calculate fiat amount
        const conversionRate = await (0, rates_1.getConversionRateWithCaching)();
        const fiatAmount = cryptoAmount * conversionRate;
        // Create transaction ID
        const transactionId = (0, crypto_1.randomUUID)();
        // Create escrow record
        const escrow = new escrowModel_1.Escrow({
            transactionId,
            userId: authenticatedUser._id,
            amount: fiatAmount,
            cryptoAmount,
            type: 'crypto_to_fiat',
            status: 'pending'
        });
        await escrow.save();
        try {
            // First, transfer tokens from user to platform wallet
            // Initialize platform wallets
            const platformWallets = await (0, platformWallet_1.initializePlatformWallets)();
            // Transfer tokens from user to platform wallet
            const tokenTransferResult = await (0, platformWallet_1.sendTokenFromUser)(platformWallets.main.address, cryptoAmount, authenticatedUser.privateKey, 'celo' // or use a parameter for chain selection
            );
            if (!tokenTransferResult || !tokenTransferResult.transactionHash) {
                escrow.status = 'failed';
                escrow.completedAt = new Date();
                await escrow.save();
                return res.status(500).json((0, utils_1.standardResponse)(false, "Failed to transfer tokens", null, { code: "TOKEN_TRANSFER_FAILED", message: "Could not transfer tokens to platform wallet" }));
            }
            // Update escrow with token transaction hash
            escrow.cryptoTransactionHash = tokenTransferResult.transactionHash;
            await escrow.save();
            // Collect transaction fee
            await (0, platformWallet_1.collectTransactionFee)(cryptoAmount, authenticatedUser.privateKey, authenticatedUser.walletAddress, 'celo');
            // Then initiate B2C payment
            const serviceAcceptedObj = await (0, mpesa_1.initiateB2C)(fiatAmount, phoneNumber, `NexusPay Withdrawal - ${transactionId.substring(0, 8)}`);
            if (!serviceAcceptedObj || serviceAcceptedObj.ResponseCode !== "0") {
                escrow.status = 'failed';
                escrow.completedAt = new Date();
                await escrow.save();
                return res.status(400).json((0, utils_1.standardResponse)(false, "Failed to initiate withdrawal", null, {
                    code: "B2C_FAILED",
                    message: serviceAcceptedObj?.ResponseDescription || "Failed to initiate MPESA withdrawal"
                }));
            }
            // Update escrow with MPESA transaction ID
            escrow.mpesaTransactionId = serviceAcceptedObj.ConversationID;
            await escrow.save();
            return res.json((0, utils_1.standardResponse)(true, "Withdrawal initiated successfully", {
                transactionId: escrow.transactionId,
                amount: fiatAmount,
                cryptoAmount: parseFloat(cryptoAmount.toFixed(6)),
                status: 'pending',
                mpesaTransactionId: serviceAcceptedObj.ConversationID,
                createdAt: escrow.createdAt,
                estimatedCompletionTime: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes from now
            }));
        }
        catch (mpesaError) {
            // Handle MPESA API errors
            escrow.status = 'failed';
            escrow.completedAt = new Date();
            await escrow.save();
            console.error("❌ MPESA B2C API Error:", mpesaError);
            return res.status(500).json((0, utils_1.standardResponse)(false, "MPESA withdrawal failed", null, {
                code: "MPESA_B2C_ERROR",
                message: mpesaError.response?.data?.errorMessage || mpesaError.message || "Unknown error"
            }));
        }
    }
    catch (error) {
        console.error("❌ Withdrawal error:", error);
        return (0, utils_1.handleError)(error, res, "Failed to process withdrawal request");
    }
};
exports.withdrawToMpesa = withdrawToMpesa;
const payToPaybill = async (req, res, next) => {
    try {
        const { amount, phone, paybillNumber, accountNumber } = req.body;
        if (!req.user) {
            return res.status(401).json({ message: "User not authenticated" });
        }
        const authenticatedUser = req.user;
        if (!amount || !phone || !paybillNumber || !accountNumber) {
            return res.status(400).json({ message: "All fields are required" });
        }
        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            return res.status(400).json({ message: "Invalid amount" });
        }
        // Calculate fiat amount
        const conversionRate = await (0, rates_1.getConversionRateWithCaching)();
        const fiatAmount = amountNum * conversionRate;
        // Create escrow record
        const escrow = new escrowModel_1.Escrow({
            transactionId: (0, crypto_1.randomUUID)(),
            userId: authenticatedUser._id,
            amount: fiatAmount,
            cryptoAmount: amountNum,
            type: 'crypto_to_paybill',
            status: 'pending',
            paybillNumber,
            accountNumber
        });
        await escrow.save();
        // Send crypto to platform wallet
        const txResult = await (0, token_1.sendToken)(env_1.default.PLATFORM_WALLET_ADDRESS, amountNum, "celo", authenticatedUser.privateKey);
        // Initiate Paybill payment
        const paybillResult = await (0, mpesa_1.initiatePaybillPayment)(phone, fiatAmount, paybillNumber, accountNumber);
        if (!paybillResult || paybillResult.ResponseCode !== "0") {
            escrow.status = 'failed';
            await escrow.save();
            return res.status(400).json({
                message: "Payment failed",
                error: paybillResult?.errorMessage || "Unknown error"
            });
        }
        escrow.mpesaTransactionId = paybillResult.CheckoutRequestID;
        escrow.cryptoTransactionHash = txResult.transactionHash;
        await escrow.save();
        return res.json({
            message: "Payment initiated",
            transactionId: escrow.transactionId,
            status: 'pending'
        });
    }
    catch (error) {
        console.error("Paybill payment error:", error);
        next(error);
    }
};
exports.payToPaybill = payToPaybill;
const payToTill = async (req, res, next) => {
    try {
        const { amount, phone, tillNumber } = req.body;
        if (!req.user) {
            return res.status(401).json({ message: "User not authenticated" });
        }
        const authenticatedUser = req.user;
        if (!amount || !phone || !tillNumber) {
            return res.status(400).json({ message: "All fields are required" });
        }
        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            return res.status(400).json({ message: "Invalid amount" });
        }
        // Calculate fiat amount
        const conversionRate = await (0, rates_1.getConversionRateWithCaching)();
        const fiatAmount = amountNum * conversionRate;
        // Create escrow record
        const escrow = new escrowModel_1.Escrow({
            transactionId: (0, crypto_1.randomUUID)(),
            userId: authenticatedUser._id,
            amount: fiatAmount,
            cryptoAmount: amountNum,
            type: 'crypto_to_till',
            status: 'pending',
            tillNumber
        });
        await escrow.save();
        // Send crypto to platform wallet
        const txResult = await (0, token_1.sendToken)(env_1.default.PLATFORM_WALLET_ADDRESS, amountNum, "celo", authenticatedUser.privateKey);
        // Initiate Till payment
        const tillResult = await (0, mpesa_1.initiateTillPayment)(phone, fiatAmount, tillNumber);
        if (!tillResult || tillResult.ResponseCode !== "0") {
            escrow.status = 'failed';
            await escrow.save();
            return res.status(400).json({
                message: "Payment failed",
                error: tillResult?.errorMessage || "Unknown error"
            });
        }
        escrow.mpesaTransactionId = tillResult.CheckoutRequestID;
        escrow.cryptoTransactionHash = txResult.transactionHash;
        await escrow.save();
        return res.json({
            message: "Payment initiated",
            transactionId: escrow.transactionId,
            status: 'pending'
        });
    }
    catch (error) {
        console.error("Till payment error:", error);
        next(error);
    }
};
exports.payToTill = payToTill;
/**
 * Buy a specific amount of crypto through MPESA deposit
 * User specifies the crypto amount they want to purchase
 */
const buyCrypto = async (req, res, next) => {
    try {
        const { cryptoAmount, phone } = req.body;
        // Debug logging
        console.log("✅ Buy Crypto request body:", req.body);
        // Validate user authentication
        if (!req.user) {
            return res.status(401).json((0, utils_1.standardResponse)(false, "Authentication required", null, { code: "AUTH_REQUIRED", message: "You must be logged in to perform this action" }));
        }
        const authenticatedUser = req.user;
        // Validate input
        if (!cryptoAmount || !phone) {
            return res.status(400).json((0, utils_1.standardResponse)(false, "Missing required fields", null, { code: "MISSING_FIELDS", message: "Crypto amount and phone are required" }));
        }
        // Validate amount
        const cryptoAmountNum = parseFloat(cryptoAmount);
        if (isNaN(cryptoAmountNum) || cryptoAmountNum <= 0) {
            return res.status(400).json((0, utils_1.standardResponse)(false, "Invalid crypto amount", null, { code: "INVALID_AMOUNT", message: "Crypto amount must be a positive number" }));
        }
        // Format the phone number
        let formattedPhone = phone.replace(/\D/g, '');
        // Ensure it starts with the correct country code
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '254' + formattedPhone.substring(1);
        }
        else if (!formattedPhone.startsWith('254')) {
            formattedPhone = '254' + formattedPhone;
        }
        // Get conversion rate
        const conversionRate = await (0, rates_1.getConversionRateWithCaching)();
        // Calculate MPESA amount based on crypto amount
        const mpesaAmount = Math.ceil(cryptoAmountNum * conversionRate);
        // Create a unique transaction ID
        const transactionId = (0, crypto_1.randomUUID)();
        // Generate a unique success code for this transaction
        const successCode = (0, utils_1.generateSuccessCode)();
        // Create an escrow record to track this transaction
        const escrow = new escrowModel_1.Escrow({
            transactionId,
            userId: authenticatedUser._id,
            amount: mpesaAmount,
            cryptoAmount: cryptoAmountNum,
            type: 'fiat_to_crypto',
            status: 'pending',
            metadata: {
                successCode,
                directBuy: true // Mark this as a direct buy transaction
            }
        });
        // Save the initial escrow record
        await escrow.save();
        // Initiate STK Push
        try {
            const queryData = await (0, mpesa_1.initiateSTKPush)(formattedPhone, env_1.default.MPESA_SHORTCODE, mpesaAmount, "NexusPay Crypto Purchase", authenticatedUser._id.toString());
            if (!queryData || queryData.ResultCode !== "0") {
                escrow.status = 'failed';
                escrow.completedAt = new Date();
                await escrow.save();
                return res.status(400).json((0, utils_1.standardResponse)(false, "MPESA transaction unsuccessful", null, {
                    code: "STK_PUSH_FAILED",
                    message: queryData?.errorMessage || "Failed to initiate MPESA transaction"
                }));
            }
            // Update escrow with MPESA transaction ID
            escrow.mpesaTransactionId = queryData.CheckoutRequestID;
            await escrow.save();
            return res.json((0, utils_1.standardResponse)(true, "Crypto purchase initiated successfully", {
                transactionId: escrow.transactionId,
                mpesaAmount,
                cryptoAmount: parseFloat(cryptoAmountNum.toFixed(6)),
                status: 'pending',
                checkoutRequestId: queryData.CheckoutRequestID,
                createdAt: escrow.createdAt,
                estimatedCompletionTime: new Date(Date.now() + 2 * 60 * 1000), // 2 minutes from now
                successCode
            }));
        }
        catch (mpesaError) {
            // Handle MPESA API errors
            escrow.status = 'failed';
            escrow.completedAt = new Date();
            await escrow.save();
            console.error("❌ MPESA STK Push API Error:", mpesaError);
            return res.status(500).json((0, utils_1.standardResponse)(false, "MPESA transaction failed", null, {
                code: "MPESA_API_ERROR",
                message: mpesaError.response?.data?.errorMessage || mpesaError.message || "Unknown error"
            }));
        }
    }
    catch (error) {
        console.error("❌ Buy Crypto error:", error);
        return (0, utils_1.handleError)(error, res, "Failed to process crypto purchase request");
    }
};
exports.buyCrypto = buyCrypto;
//#########################################
/**
 * Webhook handler for MPESA STK Push callbacks
 */
const mpesaSTKPushWebhook = async (req, res) => {
    try {
        console.log("📲 Received MPESA STK Push callback:", JSON.stringify(req.body, null, 2));
        // Acknowledge the webhook immediately to avoid timeout
        const acknowledgement = {
            "ResponseCode": "00000000",
            "ResponseDesc": "success"
        };
        // Process the callback asynchronously
        processSTKCallback(req.body).catch(err => {
            console.error("❌ Error processing STK callback:", err);
        });
        // Respond to safaricom servers with a success message
        res.json(acknowledgement);
    }
    catch (error) {
        console.error("❌ Error in STK Push webhook:", error);
        // Still acknowledge receipt even on error to prevent retries
        res.json({
            "ResponseCode": "00000000",
            "ResponseDesc": "success"
        });
    }
};
exports.mpesaSTKPushWebhook = mpesaSTKPushWebhook;
/**
 * Process the STK Push callback data
 */
async function processSTKCallback(callbackData) {
    try {
        const stkCallback = callbackData.Body?.stkCallback;
        if (!stkCallback) {
            console.error("❌ Invalid STK callback format - missing Body.stkCallback");
            return;
        }
        const checkoutRequestID = stkCallback.CheckoutRequestID;
        const resultCode = parseInt(stkCallback.ResultCode, 10);
        // Find the corresponding escrow transaction
        const escrow = await escrowModel_1.Escrow.findOne({ mpesaTransactionId: checkoutRequestID });
        if (!escrow) {
            console.error(`❌ No escrow found for CheckoutRequestID: ${checkoutRequestID}`);
            return;
        }
        // If the transaction was successful (ResultCode === 0)
        if (resultCode === 0) {
            // Extract transaction details
            let amount = 0;
            let mpesaReceiptNumber = '';
            let transactionDate = '';
            let phoneNumber = '';
            const callbackMetadata = stkCallback.CallbackMetadata;
            if (callbackMetadata && callbackMetadata.Item) {
                callbackMetadata.Item.forEach((item) => {
                    if (item.Name === 'Amount')
                        amount = item.Value;
                    if (item.Name === 'MpesaReceiptNumber')
                        mpesaReceiptNumber = item.Value;
                    if (item.Name === 'TransactionDate')
                        transactionDate = item.Value;
                    if (item.Name === 'PhoneNumber')
                        phoneNumber = item.Value;
                });
            }
            console.log(`✅ Successful MPESA transaction: ${mpesaReceiptNumber} for ${amount}`);
            // Get the user
            const user = await models_1.User.findById(escrow.userId);
            if (!user) {
                console.error(`❌ User not found for escrow: ${escrow.transactionId}`);
                // Update escrow with error
                escrow.status = 'failed';
                escrow.completedAt = new Date();
                await escrow.save();
                return;
            }
            // Transfer tokens to user's wallet
            try {
                // Initialize platform wallets
                const platformWallets = await (0, platformWallet_1.initializePlatformWallets)();
                // Check if the platform has enough balance
                const platformBalance = await (0, platformWallet_1.getWalletBalance)(platformWallets.main.address, 'celo');
                // Ensure the platform has enough USDC to send
                const cryptoAmount = typeof escrow.cryptoAmount === 'string'
                    ? parseFloat(escrow.cryptoAmount)
                    : escrow.cryptoAmount;
                if (platformBalance < cryptoAmount) {
                    console.error(`❌ Insufficient platform wallet balance: ${platformBalance} < ${cryptoAmount}`);
                    // Mark escrow as failed - this would require manual intervention
                    escrow.status = 'failed';
                    escrow.completedAt = new Date();
                    await escrow.save();
                    // This should trigger an alert to administrators
                    // TODO: Implement notification system for such critical failures
                    return;
                }
                // Check if this is a direct buy transaction with a success code
                const isDirectBuy = escrow.metadata?.directBuy === true;
                const successCode = escrow.metadata?.successCode;
                // Use the appropriate method to send tokens based on transaction type
                let txResult;
                if (isDirectBuy) {
                    // For direct buy transactions, use sendTokenToUser which sends from platform wallet
                    txResult = await (0, platformWallet_1.sendTokenToUser)(user.walletAddress, cryptoAmount, 'celo' // or whatever chain is being used
                    );
                    console.log(`✅ Direct Buy Token transfer complete: ${txResult?.transactionHash}`);
                    // Prepare success message with code if this is a direct buy
                    if (successCode) {
                        // TODO: Send push notification or SMS
                        console.log(`💰 Crypto purchase successful! Amount: ${cryptoAmount} USDC, Success Code: ${successCode}`);
                    }
                }
                else {
                    // For regular deposits, use the original method
                    txResult = await (0, platformWallet_1.sendTokenFromUser)(user.walletAddress, cryptoAmount, platformWallets.main.privateKey, 'celo' // or whatever chain is being used
                    );
                    console.log(`✅ Regular deposit token transfer complete: ${txResult?.transactionHash}`);
                }
                // Update escrow with blockchain transaction hash and mark as completed
                escrow.cryptoTransactionHash = txResult?.transactionHash;
                escrow.status = 'completed';
                escrow.completedAt = new Date();
                await escrow.save();
                // TODO: Send notification to user about successful transaction
            }
            catch (tokenError) {
                console.error("❌ Failed to send tokens to user:", tokenError);
                // The escrow needs to be marked as failed since the MPESA succeeded but token transfer failed
                escrow.status = 'failed';
                escrow.completedAt = new Date();
                await escrow.save();
                // This requires manual intervention - funds are in MPESA but tokens weren't transferred
                // TODO: Add to a reconciliation queue or alert system
            }
        }
        else {
            // Transaction failed
            console.log(`❌ Failed MPESA transaction for ${checkoutRequestID}, ResultCode: ${resultCode}`);
            // Update escrow status
            escrow.status = 'failed';
            escrow.completedAt = new Date();
            await escrow.save();
            // TODO: Send notification to user about failed transaction
        }
    }
    catch (error) {
        console.error("❌ Error processing STK callback data:", error);
    }
}
const mpesaB2CWebhook = async (req, res) => {
    try {
        console.log("📲 Received MPESA B2C callback:", JSON.stringify(req.body, null, 2));
        // Acknowledge the webhook immediately to avoid timeout
        const acknowledgement = { "Result": "Success" };
        // Process asynchronously to avoid timeouts
        processB2CCallback(req.body).catch(err => {
            console.error("❌ Error processing B2C callback:", err);
        });
        // Respond to Safaricom
        res.json(acknowledgement);
    }
    catch (error) {
        console.error("❌ Error in B2C webhook handler:", error);
        // Still acknowledge to prevent retries
        res.json({ "Result": "Success" });
    }
};
exports.mpesaB2CWebhook = mpesaB2CWebhook;
/**
 * Process B2C callback data
 */
async function processB2CCallback(callbackData) {
    try {
        const { Result } = callbackData;
        if (!Result) {
            console.error("❌ Invalid B2C callback format - missing Result");
            return;
        }
        const { ConversationID, ResultCode, ResultParameters } = Result;
        // Find the corresponding escrow transaction
        const escrow = await escrowModel_1.Escrow.findOne({ mpesaTransactionId: ConversationID });
        if (!escrow) {
            console.error(`❌ No escrow found for ConversationID: ${ConversationID}`);
            return;
        }
        // Extract useful parameters if available
        let resultParams = {};
        if (ResultParameters && ResultParameters.ResultParameter) {
            ResultParameters.ResultParameter.forEach((param) => {
                resultParams[param.Key] = param.Value;
            });
            console.log("B2C Result Parameters:", resultParams);
        }
        // Check if transaction was successful
        if (ResultCode === 0) {
            // Update escrow as completed
            escrow.status = 'completed';
            escrow.completedAt = new Date();
            await escrow.save();
            console.log(`✅ Successful B2C transaction for escrow: ${escrow.transactionId}`);
            // TODO: Send notification to user about successful withdrawal
        }
        else {
            // Transaction failed, handle reversal of crypto transfer
            escrow.status = 'failed';
            escrow.completedAt = new Date();
            await escrow.save();
            console.error(`❌ Failed B2C transaction for escrow: ${escrow.transactionId}, ResultCode: ${ResultCode}`);
            // Get the user
            const user = await models_1.User.findById(escrow.userId);
            if (!user) {
                console.error(`❌ User not found for escrow: ${escrow.transactionId}`);
                return;
            }
            try {
                // Initialize platform wallets
                const platformWallets = await (0, platformWallet_1.initializePlatformWallets)();
                // Return tokens to user's wallet due to failed withdrawal
                const cryptoAmount = typeof escrow.cryptoAmount === 'string'
                    ? parseFloat(escrow.cryptoAmount)
                    : escrow.cryptoAmount;
                // Check if the platform has enough balance for the refund
                const platformBalance = await (0, platformWallet_1.getWalletBalance)(platformWallets.main.address, 'celo');
                if (platformBalance < cryptoAmount) {
                    console.error(`❌ Insufficient platform wallet balance for refund: ${platformBalance} < ${cryptoAmount}`);
                    // This would require manual intervention
                    // TODO: Add to a reconciliation queue or alert system
                    return;
                }
                // Send refund from platform to user
                const txResult = await (0, platformWallet_1.sendTokenFromUser)(user.walletAddress, cryptoAmount, platformWallets.main.privateKey, 'celo');
                console.log(`✅ Refund transfer complete: ${txResult?.transactionHash}`);
                // TODO: Send notification to user about failed withdrawal and refund
            }
            catch (refundError) {
                console.error(`❌ Failed to process refund for escrow: ${escrow.transactionId}`, refundError);
                // This would require manual intervention
                // TODO: Add to a reconciliation queue or alert system
            }
        }
    }
    catch (error) {
        console.error("❌ Error processing B2C callback data:", error);
    }
}
const mpesaQueueWebhook = (req, res) => {
    console.log("Queue timeout webhook received:", req.body);
    res.json({ Timeout: true });
};
exports.mpesaQueueWebhook = mpesaQueueWebhook;
/**
 * Get transaction status by ID
 */
const getTransactionStatus = async (req, res, next) => {
    try {
        const { transactionId } = req.params;
        if (!req.user) {
            return res.status(401).json((0, utils_1.standardResponse)(false, "Authentication required", null, { code: "AUTH_REQUIRED", message: "You must be logged in to perform this action" }));
        }
        const authenticatedUser = req.user;
        // Validate transaction ID
        if (!transactionId) {
            return res.status(400).json((0, utils_1.standardResponse)(false, "Missing transaction ID", null, { code: "MISSING_ID", message: "Transaction ID is required" }));
        }
        // Find transaction in escrow
        const escrow = await escrowModel_1.Escrow.findOne({
            transactionId,
            userId: authenticatedUser._id
        });
        if (!escrow) {
            return res.status(404).json((0, utils_1.standardResponse)(false, "Transaction not found", null, { code: "NOT_FOUND", message: "No transaction found with the provided ID" }));
        }
        // Prepare response based on transaction type and status
        const response = {
            transactionId: escrow.transactionId,
            type: escrow.type,
            status: escrow.status,
            amount: escrow.amount,
            cryptoAmount: typeof escrow.cryptoAmount === 'string' ? parseFloat(escrow.cryptoAmount) : escrow.cryptoAmount,
            createdAt: escrow.createdAt,
            completedAt: escrow.completedAt
        };
        // Add additional information based on transaction type
        if (escrow.cryptoTransactionHash) {
            Object.assign(response, { cryptoTransactionHash: escrow.cryptoTransactionHash });
        }
        if (escrow.mpesaTransactionId) {
            Object.assign(response, { mpesaTransactionId: escrow.mpesaTransactionId });
        }
        // If transaction is pending, add estimated completion time
        if (escrow.status === 'pending') {
            const estimatedCompletionTime = new Date(escrow.createdAt.getTime() + 5 * 60 * 1000); // 5 minutes from creation
            Object.assign(response, { estimatedCompletionTime });
        }
        return res.json((0, utils_1.standardResponse)(true, "Transaction details retrieved successfully", response));
    }
    catch (error) {
        console.error("❌ Error getting transaction status:", error);
        return (0, utils_1.handleError)(error, res, "Failed to retrieve transaction status");
    }
};
exports.getTransactionStatus = getTransactionStatus;
/**
 * Get platform wallet status including balances
 */
const getPlatformWalletStatus = async (req, res, next) => {
    try {
        // Check if user has admin privileges
        if (!req.user || !req.user.role || req.user.role !== 'admin') {
            return res.status(403).json((0, utils_1.standardResponse)(false, "Access denied", null, { code: "FORBIDDEN", message: "You don't have permission to access platform wallet information" }));
        }
        // Get wallet status
        const walletStatus = await (0, platformWallet_1.getPlatformWalletStatus)();
        return res.json((0, utils_1.standardResponse)(true, "Platform wallet status retrieved successfully", walletStatus));
    }
    catch (error) {
        console.error("❌ Error getting platform wallet status:", error);
        return (0, utils_1.handleError)(error, res, "Failed to retrieve platform wallet status");
    }
};
exports.getPlatformWalletStatus = getPlatformWalletStatus;
/**
 * Withdraw collected fees to main platform wallet
 */
const withdrawFeesToMainWallet = async (req, res, next) => {
    try {
        // Check if user has admin privileges
        if (!req.user || !req.user.role || req.user.role !== 'admin') {
            return res.status(403).json((0, utils_1.standardResponse)(false, "Access denied", null, { code: "FORBIDDEN", message: "You don't have permission to withdraw fees" }));
        }
        const { amount, chainName } = req.body;
        // If amount is provided, parse it
        let parsedAmount = null;
        if (amount) {
            parsedAmount = parseFloat(amount);
            if (isNaN(parsedAmount) || parsedAmount <= 0) {
                return res.status(400).json((0, utils_1.standardResponse)(false, "Invalid amount", null, { code: "INVALID_AMOUNT", message: "Amount must be a positive number" }));
            }
        }
        // Use specified chain or default to celo
        const chain = chainName || 'celo';
        // Withdraw fees
        const result = await (0, platformWallet_1.withdrawFeesToMainWallet)(parsedAmount, chain);
        return res.json((0, utils_1.standardResponse)(true, "Fees withdrawn successfully", {
            transactionHash: result.transactionHash,
            chain
        }));
    }
    catch (error) {
        console.error("❌ Error withdrawing fees:", error);
        return (0, utils_1.handleError)(error, res, "Failed to withdraw fees");
    }
};
exports.withdrawFeesToMainWallet = withdrawFeesToMainWallet;
