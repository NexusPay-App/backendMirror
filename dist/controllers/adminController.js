"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.withdrawFeesToMainWallet = exports.fundUserWallet = exports.getPlatformWallets = exports.updateTransactionStatus = exports.getTransactionById = exports.getTransactions = exports.promoteToAdmin = exports.getUserById = exports.getUsers = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const models_1 = require("../models/models");
const escrowModel_1 = require("../models/escrowModel");
const utils_1 = require("../services/utils");
const wallet_1 = require("../services/wallet");
/**
 * Get a list of users with pagination and filtering
 */
const getUsers = async (req, res) => {
    try {
        const { page = 1, limit = 10, role, search } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        // Build query
        const query = {};
        // Filter by role if provided
        if (role) {
            query.role = role;
        }
        // Add search functionality if search term is provided
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { email: searchRegex },
                { phoneNumber: searchRegex }
            ];
        }
        // Calculate skip for pagination
        const skip = (pageNum - 1) * limitNum;
        // Get total count for pagination
        const totalUsers = await models_1.User.countDocuments(query);
        // Get users with pagination
        const users = await models_1.User.find(query)
            .select('-password -privateKey')
            .skip(skip)
            .limit(limitNum)
            .sort({ createdAt: -1 });
        return res.status(200).json((0, utils_1.standardResponse)(true, 'Users retrieved successfully', {
            users,
            pagination: {
                total: totalUsers,
                page: pageNum,
                limit: limitNum,
                pages: Math.ceil(totalUsers / limitNum)
            }
        }));
    }
    catch (error) {
        return (0, utils_1.handleError)(error, res, 'Failed to retrieve users');
    }
};
exports.getUsers = getUsers;
/**
 * Get a user by ID
 */
const getUserById = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await models_1.User.findById(id).select('-password -privateKey');
        if (!user) {
            return res.status(404).json((0, utils_1.standardResponse)(false, 'User not found', null, { code: 'USER_NOT_FOUND', message: 'User with the provided ID does not exist' }));
        }
        return res.status(200).json((0, utils_1.standardResponse)(true, 'User retrieved successfully', { user }));
    }
    catch (error) {
        return (0, utils_1.handleError)(error, res, 'Failed to retrieve user');
    }
};
exports.getUserById = getUserById;
/**
 * Promote a user to admin role
 */
const promoteToAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await models_1.User.findById(id);
        if (!user) {
            return res.status(404).json((0, utils_1.standardResponse)(false, 'User not found', null, { code: 'USER_NOT_FOUND', message: 'User with the provided ID does not exist' }));
        }
        // Check if user is already an admin
        if (user.role === 'admin') {
            return res.status(400).json((0, utils_1.standardResponse)(false, 'User is already an admin', null, { code: 'ALREADY_ADMIN', message: 'The user already has admin role' }));
        }
        // Update role to admin
        user.role = 'admin';
        await user.save();
        return res.status(200).json((0, utils_1.standardResponse)(true, 'User promoted to admin successfully', {
            userId: user._id,
            role: user.role
        }));
    }
    catch (error) {
        return (0, utils_1.handleError)(error, res, 'Failed to promote user to admin');
    }
};
exports.promoteToAdmin = promoteToAdmin;
/**
 * Get all transactions with pagination and filtering
 */
const getTransactions = async (req, res) => {
    try {
        const { page = 1, limit = 10, status, type, startDate, endDate, userId } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        // Build query
        const query = {};
        // Filter by status if provided
        if (status) {
            query.status = status;
        }
        // Filter by type if provided
        if (type) {
            query.type = type;
        }
        // Filter by date range if provided
        if (startDate && endDate) {
            query.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }
        else if (startDate) {
            query.createdAt = { $gte: new Date(startDate) };
        }
        else if (endDate) {
            query.createdAt = { $lte: new Date(endDate) };
        }
        // Filter by user ID if provided
        if (userId) {
            query.userId = userId;
        }
        // Calculate skip for pagination
        const skip = (pageNum - 1) * limitNum;
        // Get total count for pagination
        const totalTransactions = await escrowModel_1.Escrow.countDocuments(query);
        // Get transactions with pagination and populate user details
        const transactions = await escrowModel_1.Escrow.find(query)
            .populate({
            path: 'userId',
            select: 'phoneNumber email walletAddress'
        })
            .skip(skip)
            .limit(limitNum)
            .sort({ createdAt: -1 });
        return res.status(200).json((0, utils_1.standardResponse)(true, 'Transactions retrieved successfully', {
            transactions,
            pagination: {
                total: totalTransactions,
                page: pageNum,
                limit: limitNum,
                pages: Math.ceil(totalTransactions / limitNum)
            }
        }));
    }
    catch (error) {
        return (0, utils_1.handleError)(error, res, 'Failed to retrieve transactions');
    }
};
exports.getTransactions = getTransactions;
/**
 * Get a transaction by ID
 */
const getTransactionById = async (req, res) => {
    try {
        const { id } = req.params;
        // Find transaction by ID or transactionId
        const transaction = await escrowModel_1.Escrow.findOne({
            $or: [
                { _id: mongoose_1.default.isValidObjectId(id) ? id : null },
                { transactionId: id }
            ]
        }).populate({
            path: 'userId',
            select: 'phoneNumber email walletAddress'
        });
        if (!transaction) {
            return res.status(404).json((0, utils_1.standardResponse)(false, 'Transaction not found', null, { code: 'TRANSACTION_NOT_FOUND', message: 'Transaction with the provided ID does not exist' }));
        }
        return res.status(200).json((0, utils_1.standardResponse)(true, 'Transaction retrieved successfully', { transaction }));
    }
    catch (error) {
        return (0, utils_1.handleError)(error, res, 'Failed to retrieve transaction');
    }
};
exports.getTransactionById = getTransactionById;
/**
 * Update transaction status (for manual intervention)
 */
const updateTransactionStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;
        if (!['pending', 'completed', 'failed'].includes(status)) {
            return res.status(400).json((0, utils_1.standardResponse)(false, 'Invalid status', null, { code: 'INVALID_STATUS', message: 'Status must be one of: pending, completed, failed' }));
        }
        // Find transaction by ID or transactionId
        const transaction = await escrowModel_1.Escrow.findOne({
            $or: [
                { _id: mongoose_1.default.isValidObjectId(id) ? id : null },
                { transactionId: id }
            ]
        });
        if (!transaction) {
            return res.status(404).json((0, utils_1.standardResponse)(false, 'Transaction not found', null, { code: 'TRANSACTION_NOT_FOUND', message: 'Transaction with the provided ID does not exist' }));
        }
        // Update transaction status
        transaction.status = status;
        // If completing, set completedAt
        if (status === 'completed' && !transaction.completedAt) {
            transaction.completedAt = new Date();
        }
        // If retrying, increment retryCount and set lastRetryAt
        if (status === 'pending' && transaction.status === 'failed') {
            transaction.retryCount = (transaction.retryCount || 0) + 1;
            transaction.lastRetryAt = new Date();
        }
        await transaction.save();
        // Return updated transaction
        return res.status(200).json((0, utils_1.standardResponse)(true, 'Transaction status updated successfully', {
            transactionId: transaction.transactionId,
            status: transaction.status,
            retryCount: transaction.retryCount,
            lastRetryAt: transaction.lastRetryAt,
            completedAt: transaction.completedAt
        }));
    }
    catch (error) {
        return (0, utils_1.handleError)(error, res, 'Failed to update transaction status');
    }
};
exports.updateTransactionStatus = updateTransactionStatus;
/**
 * Get platform wallet status (balance and addresses)
 */
const getPlatformWallets = async (req, res) => {
    try {
        // Get platform wallet addresses from environment variables
        const mainWalletAddress = process.env.DEV_PLATFORM_WALLET_ADDRESS;
        const feesWalletAddress = process.env.FEES_WALLET_ADDRESS;
        if (!mainWalletAddress || !feesWalletAddress) {
            return res.status(500).json((0, utils_1.standardResponse)(false, 'Platform wallet configuration not found', null, { code: 'CONFIG_MISSING', message: 'Platform wallet configuration is missing' }));
        }
        // Get balances
        const mainWalletBalance = await (0, wallet_1.getWalletBalance)(mainWalletAddress);
        const feesWalletBalance = await (0, wallet_1.getWalletBalance)(feesWalletAddress);
        return res.status(200).json((0, utils_1.standardResponse)(true, 'Platform wallet status retrieved successfully', {
            mainWallet: {
                address: mainWalletAddress,
                balance: mainWalletBalance
            },
            feesWallet: {
                address: feesWalletAddress,
                balance: feesWalletBalance
            }
        }));
    }
    catch (error) {
        return (0, utils_1.handleError)(error, res, 'Failed to retrieve platform wallet status');
    }
};
exports.getPlatformWallets = getPlatformWallets;
/**
 * Fund a user's wallet from platform main wallet
 */
const fundUserWallet = async (req, res) => {
    try {
        const { userId, amount, chainName = 'celo' } = req.body;
        // Validate amount
        if (amount <= 0) {
            return res.status(400).json((0, utils_1.standardResponse)(false, 'Invalid amount', null, { code: 'INVALID_AMOUNT', message: 'Amount must be greater than 0' }));
        }
        // Get user
        const user = await models_1.User.findById(userId);
        if (!user) {
            return res.status(404).json((0, utils_1.standardResponse)(false, 'User not found', null, { code: 'USER_NOT_FOUND', message: 'User with the provided ID does not exist' }));
        }
        // Get platform wallet details
        const platformWalletAddress = process.env.DEV_PLATFORM_WALLET_ADDRESS;
        const platformWalletPrivateKey = process.env.DEV_PLATFORM_WALLET_PRIVATE_KEY;
        if (!platformWalletAddress || !platformWalletPrivateKey) {
            return res.status(500).json((0, utils_1.standardResponse)(false, 'Platform wallet configuration not found', null, { code: 'CONFIG_MISSING', message: 'Platform wallet configuration is missing' }));
        }
        // Check platform wallet balance
        const platformBalance = await (0, wallet_1.getWalletBalance)(platformWalletAddress);
        if (platformBalance < amount) {
            return res.status(400).json((0, utils_1.standardResponse)(false, 'Insufficient platform wallet balance', null, {
                code: 'INSUFFICIENT_BALANCE',
                message: `Platform wallet balance (${platformBalance}) is less than the requested amount (${amount})`
            }));
        }
        // Transfer tokens to user
        const result = await (0, wallet_1.transferTokens)(platformWalletPrivateKey, user.walletAddress, amount, chainName);
        // Return success response
        return res.status(200).json((0, utils_1.standardResponse)(true, 'User wallet funded successfully', {
            userId: user._id,
            amount,
            transactionHash: result.transactionHash,
            recipientAddress: user.walletAddress
        }));
    }
    catch (error) {
        return (0, utils_1.handleError)(error, res, 'Failed to fund user wallet');
    }
};
exports.fundUserWallet = fundUserWallet;
/**
 * Withdraw fees to main platform wallet
 */
const withdrawFeesToMainWallet = async (req, res) => {
    try {
        const { amount } = req.body;
        // Get platform wallet details
        const mainWalletAddress = process.env.DEV_PLATFORM_WALLET_ADDRESS;
        const feesWalletAddress = process.env.FEES_WALLET_ADDRESS;
        const feesWalletPrivateKey = process.env.FEES_WALLET_PRIVATE_KEY;
        if (!mainWalletAddress || !feesWalletAddress || !feesWalletPrivateKey) {
            return res.status(500).json((0, utils_1.standardResponse)(false, 'Platform wallet configuration not found', null, { code: 'CONFIG_MISSING', message: 'Platform wallet configuration is missing' }));
        }
        // Check fees wallet balance
        const feesBalance = await (0, wallet_1.getWalletBalance)(feesWalletAddress);
        // If amount not specified, use full balance
        const transferAmount = amount || feesBalance;
        if (feesBalance < transferAmount) {
            return res.status(400).json((0, utils_1.standardResponse)(false, 'Insufficient fees wallet balance', null, {
                code: 'INSUFFICIENT_BALANCE',
                message: `Fees wallet balance (${feesBalance}) is less than the requested amount (${transferAmount})`
            }));
        }
        // Transfer tokens to main wallet
        const result = await (0, wallet_1.transferTokens)(feesWalletPrivateKey, mainWalletAddress, transferAmount, 'celo' // Default to Celo chain
        );
        // Return success response
        return res.status(200).json((0, utils_1.standardResponse)(true, 'Fees withdrawn to main wallet successfully', {
            amount: transferAmount,
            transactionHash: result.transactionHash,
            fromAddress: feesWalletAddress,
            toAddress: mainWalletAddress
        }));
    }
    catch (error) {
        return (0, utils_1.handleError)(error, res, 'Failed to withdraw fees to main wallet');
    }
};
exports.withdrawFeesToMainWallet = withdrawFeesToMainWallet;
