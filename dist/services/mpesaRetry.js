"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.retryAllFailedTransactions = exports.retryFailedWithdrawals = exports.retryFailedDeposits = void 0;
const escrowModel_1 = require("../models/escrowModel");
const models_1 = require("../models/models");
const mpesa_1 = require("./mpesa");
const utils_1 = require("./utils");
const env_1 = __importDefault(require("../config/env"));
const token_1 = require("./token");
/**
 * Retry failed MPESA deposits
 * @param minutes Only retry transactions that are less than this many minutes old
 * @returns Number of transactions successfully retried
 */
const retryFailedDeposits = async (minutes = 60) => {
    console.log('🔄 Checking for failed deposits to retry...');
    try {
        // Find failed deposit transactions that are less than X minutes old
        const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
        const failedTransactions = await escrowModel_1.Escrow.find({
            type: 'fiat_to_crypto',
            status: 'failed',
            createdAt: { $gt: cutoffTime },
            retryCount: { $lt: 3 } // Maximum 3 retry attempts
        });
        console.log(`Found ${failedTransactions.length} failed deposits to retry`);
        let successCount = 0;
        for (const transaction of failedTransactions) {
            try {
                // Get user information
                const user = await models_1.User.findById(transaction.userId);
                if (!user) {
                    console.error(`User not found for transaction ${transaction.transactionId}`);
                    continue;
                }
                // Get phone number from transaction or user
                const phone = user.phoneNumber;
                if (!phone) {
                    console.error(`Phone number not found for transaction ${transaction.transactionId}`);
                    continue;
                }
                // Increment retry count
                transaction.retryCount = (transaction.retryCount || 0) + 1;
                await transaction.save();
                // Retry STK push
                const result = await (0, utils_1.retryOperation)(async () => {
                    return (0, mpesa_1.initiateSTKPush)(phone, env_1.default.MPESA_SHORTCODE, transaction.amount, `NexusPay Retry ${transaction.retryCount}`, user._id.toString());
                });
                if (result && result.ResultCode === "0") {
                    // Update transaction with new MPESA ID and set status to pending
                    transaction.status = 'pending';
                    transaction.mpesaTransactionId = result.CheckoutRequestID;
                    transaction.lastRetryAt = new Date();
                    await transaction.save();
                    console.log(`✅ Successfully retried transaction ${transaction.transactionId}`);
                    successCount++;
                }
                else {
                    console.error(`Failed to retry transaction ${transaction.transactionId}: ${result?.errorMessage || 'Unknown error'}`);
                }
            }
            catch (error) {
                console.error(`Error retrying transaction ${transaction.transactionId}:`, error);
            }
        }
        return successCount;
    }
    catch (error) {
        console.error('Error retrying failed deposits:', error);
        return 0;
    }
};
exports.retryFailedDeposits = retryFailedDeposits;
/**
 * Retry failed MPESA withdrawals
 * @param minutes Only retry transactions that are less than this many minutes old
 * @returns Number of transactions successfully retried
 */
const retryFailedWithdrawals = async (minutes = 60) => {
    console.log('🔄 Checking for failed withdrawals to retry...');
    try {
        // Find failed withdrawal transactions that are less than X minutes old
        const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
        const failedTransactions = await escrowModel_1.Escrow.find({
            type: 'crypto_to_fiat',
            status: 'failed',
            createdAt: { $gt: cutoffTime },
            retryCount: { $lt: 3 } // Maximum 3 retry attempts
        });
        console.log(`Found ${failedTransactions.length} failed withdrawals to retry`);
        let successCount = 0;
        for (const transaction of failedTransactions) {
            try {
                // Get user information
                const user = await models_1.User.findById(transaction.userId);
                if (!user) {
                    console.error(`User not found for transaction ${transaction.transactionId}`);
                    continue;
                }
                // Extract phone from user data or transaction data
                const phoneNumber = user.phoneNumber?.replace(/\D/g, '');
                if (!phoneNumber) {
                    console.error(`Phone number not found for transaction ${transaction.transactionId}`);
                    continue;
                }
                // Format phone number for B2C
                let formattedPhone = phoneNumber;
                if (formattedPhone.startsWith('0')) {
                    formattedPhone = '254' + formattedPhone.substring(1);
                }
                else if (!formattedPhone.startsWith('254')) {
                    formattedPhone = '254' + formattedPhone;
                }
                // Extract numeric part only
                const phoneNumberInt = parseInt(formattedPhone, 10);
                if (isNaN(phoneNumberInt)) {
                    console.error(`Invalid phone number format for transaction ${transaction.transactionId}`);
                    continue;
                }
                // Increment retry count
                transaction.retryCount = (transaction.retryCount || 0) + 1;
                await transaction.save();
                // First check if we need to transfer tokens again
                if (!transaction.cryptoTransactionHash) {
                    // Crypto hasn't been transferred yet
                    try {
                        const cryptoAmount = typeof transaction.cryptoAmount === 'string'
                            ? parseFloat(transaction.cryptoAmount)
                            : transaction.cryptoAmount;
                        await (0, token_1.sendToken)(env_1.default.PLATFORM_WALLET_ADDRESS, cryptoAmount, "celo", user.privateKey);
                    }
                    catch (tokenError) {
                        console.error(`Failed to transfer tokens for transaction ${transaction.transactionId}:`, tokenError);
                        continue;
                    }
                }
                // Retry B2C
                const result = await (0, utils_1.retryOperation)(async () => {
                    return (0, mpesa_1.initiateB2C)(transaction.amount, phoneNumberInt, `NexusPay Retry ${transaction.retryCount} - ${transaction.transactionId.substring(0, 8)}`);
                });
                if (result && result.ResponseCode === "0") {
                    // Update transaction with new MPESA ID and set status to pending
                    transaction.status = 'pending';
                    transaction.mpesaTransactionId = result.ConversationID;
                    transaction.lastRetryAt = new Date();
                    await transaction.save();
                    console.log(`✅ Successfully retried withdrawal ${transaction.transactionId}`);
                    successCount++;
                }
                else {
                    console.error(`Failed to retry withdrawal ${transaction.transactionId}: ${result?.ResponseDescription || 'Unknown error'}`);
                }
            }
            catch (error) {
                console.error(`Error retrying withdrawal ${transaction.transactionId}:`, error);
            }
        }
        return successCount;
    }
    catch (error) {
        console.error('Error retrying failed withdrawals:', error);
        return 0;
    }
};
exports.retryFailedWithdrawals = retryFailedWithdrawals;
/**
 * Scheduled function to retry all types of failed transactions
 * This should be called periodically by a cron job or scheduler
 */
const retryAllFailedTransactions = async () => {
    try {
        console.log('🔄 Starting scheduled retry of failed transactions');
        // Retry deposits
        const depositRetries = await (0, exports.retryFailedDeposits)();
        console.log(`✅ Retried ${depositRetries} failed deposits`);
        // Retry withdrawals
        const withdrawalRetries = await (0, exports.retryFailedWithdrawals)();
        console.log(`✅ Retried ${withdrawalRetries} failed withdrawals`);
        console.log('🔄 Completed scheduled retry of failed transactions');
    }
    catch (error) {
        console.error('❌ Error during scheduled retry of failed transactions:', error);
    }
};
exports.retryAllFailedTransactions = retryAllFailedTransactions;
