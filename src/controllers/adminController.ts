// src/controllers/adminController.ts
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { User } from '../models/models';
import { Escrow } from '../models/escrowModel';
import { standardResponse, handleError } from '../services/utils';
import { transferTokens, getWalletBalance } from '../services/wallet';
import config from '../config/env';

/**
 * Get a list of users with pagination and filtering
 */
export const getUsers = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 10, role, search } = req.query;
    
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    
    // Build query
    const query: any = {};
    
    // Filter by role if provided
    if (role) {
      query.role = role;
    }
    
    // Add search functionality if search term is provided
    if (search) {
      const searchRegex = new RegExp(search as string, 'i');
      query.$or = [
        { email: searchRegex },
        { phoneNumber: searchRegex }
      ];
    }
    
    // Calculate skip for pagination
    const skip = (pageNum - 1) * limitNum;
    
    // Get total count for pagination
    const totalUsers = await User.countDocuments(query);
    
    // Get users with pagination
    const users = await User.find(query)
      .select('-password -privateKey')
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 });
    
    return res.status(200).json(standardResponse(
      true,
      'Users retrieved successfully',
      {
        users,
        pagination: {
          total: totalUsers,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(totalUsers / limitNum)
        }
      }
    ));
  } catch (error) {
    return handleError(error, res, 'Failed to retrieve users');
  }
};

/**
 * Get a user by ID
 */
export const getUserById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id).select('-password -privateKey');
    
    if (!user) {
      return res.status(404).json(standardResponse(
        false,
        'User not found',
        null,
        { code: 'USER_NOT_FOUND', message: 'User with the provided ID does not exist' }
      ));
    }
    
    return res.status(200).json(standardResponse(
      true,
      'User retrieved successfully',
      { user }
    ));
  } catch (error) {
    return handleError(error, res, 'Failed to retrieve user');
  }
};

/**
 * Promote a user to admin role
 */
export const promoteToAdmin = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id);
    
    if (!user) {
      return res.status(404).json(standardResponse(
        false,
        'User not found',
        null,
        { code: 'USER_NOT_FOUND', message: 'User with the provided ID does not exist' }
      ));
    }
    
    // Check if user is already an admin
    if (user.role === 'admin') {
      return res.status(400).json(standardResponse(
        false,
        'User is already an admin',
        null,
        { code: 'ALREADY_ADMIN', message: 'The user already has admin role' }
      ));
    }
    
    // Update role to admin
    user.role = 'admin';
    await user.save();
    
    return res.status(200).json(standardResponse(
      true,
      'User promoted to admin successfully',
      {
        userId: user._id,
        role: user.role
      }
    ));
  } catch (error) {
    return handleError(error, res, 'Failed to promote user to admin');
  }
};

/**
 * Get all transactions with pagination and filtering
 */
export const getTransactions = async (req: Request, res: Response) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      type, 
      startDate, 
      endDate,
      userId 
    } = req.query;
    
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    
    // Build query
    const query: any = {};
    
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
        $gte: new Date(startDate as string),
        $lte: new Date(endDate as string)
      };
    } else if (startDate) {
      query.createdAt = { $gte: new Date(startDate as string) };
    } else if (endDate) {
      query.createdAt = { $lte: new Date(endDate as string) };
    }
    
    // Filter by user ID if provided
    if (userId) {
      query.userId = userId;
    }
    
    // Calculate skip for pagination
    const skip = (pageNum - 1) * limitNum;
    
    // Get total count for pagination
    const totalTransactions = await Escrow.countDocuments(query);
    
    // Get transactions with pagination and populate user details
    const transactions = await Escrow.find(query)
      .populate({
        path: 'userId',
        select: 'phoneNumber email walletAddress'
      })
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 });
    
    return res.status(200).json(standardResponse(
      true,
      'Transactions retrieved successfully',
      {
        transactions,
        pagination: {
          total: totalTransactions,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(totalTransactions / limitNum)
        }
      }
    ));
  } catch (error) {
    return handleError(error, res, 'Failed to retrieve transactions');
  }
};

/**
 * Get a transaction by ID
 */
export const getTransactionById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Find transaction by ID or transactionId
    const transaction = await Escrow.findOne({
      $or: [
        { _id: mongoose.isValidObjectId(id) ? id : null },
        { transactionId: id }
      ]
    }).populate({
      path: 'userId',
      select: 'phoneNumber email walletAddress'
    });
    
    if (!transaction) {
      return res.status(404).json(standardResponse(
        false,
        'Transaction not found',
        null,
        { code: 'TRANSACTION_NOT_FOUND', message: 'Transaction with the provided ID does not exist' }
      ));
    }
    
    return res.status(200).json(standardResponse(
      true,
      'Transaction retrieved successfully',
      { transaction }
    ));
  } catch (error) {
    return handleError(error, res, 'Failed to retrieve transaction');
  }
};

/**
 * Update transaction status (for manual intervention)
 */
export const updateTransactionStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    if (!['pending', 'completed', 'failed'].includes(status)) {
      return res.status(400).json(standardResponse(
        false,
        'Invalid status',
        null,
        { code: 'INVALID_STATUS', message: 'Status must be one of: pending, completed, failed' }
      ));
    }
    
    // Find transaction by ID or transactionId
    const transaction = await Escrow.findOne({
      $or: [
        { _id: mongoose.isValidObjectId(id) ? id : null },
        { transactionId: id }
      ]
    });
    
    if (!transaction) {
      return res.status(404).json(standardResponse(
        false,
        'Transaction not found',
        null,
        { code: 'TRANSACTION_NOT_FOUND', message: 'Transaction with the provided ID does not exist' }
      ));
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
    return res.status(200).json(standardResponse(
      true,
      'Transaction status updated successfully',
      {
        transactionId: transaction.transactionId,
        status: transaction.status,
        retryCount: transaction.retryCount,
        lastRetryAt: transaction.lastRetryAt,
        completedAt: transaction.completedAt
      }
    ));
  } catch (error) {
    return handleError(error, res, 'Failed to update transaction status');
  }
};

/**
 * Get platform wallet status (balance and addresses)
 */
export const getPlatformWallets = async (req: Request, res: Response) => {
  try {
    // Get platform wallet addresses from environment variables
    const mainWalletAddress = process.env.DEV_PLATFORM_WALLET_ADDRESS;
    const feesWalletAddress = process.env.FEES_WALLET_ADDRESS;
    
    if (!mainWalletAddress || !feesWalletAddress) {
      return res.status(500).json(standardResponse(
        false,
        'Platform wallet configuration not found',
        null,
        { code: 'CONFIG_MISSING', message: 'Platform wallet configuration is missing' }
      ));
    }
    
    // Get balances
    const mainWalletBalance = await getWalletBalance(mainWalletAddress);
    const feesWalletBalance = await getWalletBalance(feesWalletAddress);
    
    return res.status(200).json(standardResponse(
      true,
      'Platform wallet status retrieved successfully',
      {
        mainWallet: {
          address: mainWalletAddress,
          balance: mainWalletBalance
        },
        feesWallet: {
          address: feesWalletAddress,
          balance: feesWalletBalance
        }
      }
    ));
  } catch (error) {
    return handleError(error, res, 'Failed to retrieve platform wallet status');
  }
};

/**
 * Fund a user's wallet from platform main wallet
 */
export const fundUserWallet = async (req: Request, res: Response) => {
  try {
    const { userId, amount, chainName = 'celo' } = req.body;
    
    // Validate amount
    if (amount <= 0) {
      return res.status(400).json(standardResponse(
        false,
        'Invalid amount',
        null,
        { code: 'INVALID_AMOUNT', message: 'Amount must be greater than 0' }
      ));
    }
    
    // Get user
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json(standardResponse(
        false,
        'User not found',
        null,
        { code: 'USER_NOT_FOUND', message: 'User with the provided ID does not exist' }
      ));
    }
    
    // Get platform wallet details
    const platformWalletAddress = process.env.DEV_PLATFORM_WALLET_ADDRESS;
    const platformWalletPrivateKey = process.env.DEV_PLATFORM_WALLET_PRIVATE_KEY;
    
    if (!platformWalletAddress || !platformWalletPrivateKey) {
      return res.status(500).json(standardResponse(
        false,
        'Platform wallet configuration not found',
        null,
        { code: 'CONFIG_MISSING', message: 'Platform wallet configuration is missing' }
      ));
    }
    
    // Check platform wallet balance
    const platformBalance = await getWalletBalance(platformWalletAddress);
    
    if (platformBalance < amount) {
      return res.status(400).json(standardResponse(
        false,
        'Insufficient platform wallet balance',
        null,
        { 
          code: 'INSUFFICIENT_BALANCE', 
          message: `Platform wallet balance (${platformBalance}) is less than the requested amount (${amount})` 
        }
      ));
    }
    
    // Transfer tokens to user
    const result = await transferTokens(
      platformWalletPrivateKey,
      user.walletAddress,
      amount,
      chainName
    );
    
    // Return success response
    return res.status(200).json(standardResponse(
      true,
      'User wallet funded successfully',
      {
        userId: user._id,
        amount,
        transactionHash: result.transactionHash,
        recipientAddress: user.walletAddress
      }
    ));
  } catch (error) {
    return handleError(error, res, 'Failed to fund user wallet');
  }
};

/**
 * Withdraw fees to main platform wallet
 */
export const withdrawFeesToMainWallet = async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;
    
    // Get platform wallet details
    const mainWalletAddress = process.env.DEV_PLATFORM_WALLET_ADDRESS;
    const feesWalletAddress = process.env.FEES_WALLET_ADDRESS;
    const feesWalletPrivateKey = process.env.FEES_WALLET_PRIVATE_KEY;
    
    if (!mainWalletAddress || !feesWalletAddress || !feesWalletPrivateKey) {
      return res.status(500).json(standardResponse(
        false,
        'Platform wallet configuration not found',
        null,
        { code: 'CONFIG_MISSING', message: 'Platform wallet configuration is missing' }
      ));
    }
    
    // Check fees wallet balance
    const feesBalance = await getWalletBalance(feesWalletAddress);
    
    // If amount not specified, use full balance
    const transferAmount = amount || feesBalance;
    
    if (feesBalance < transferAmount) {
      return res.status(400).json(standardResponse(
        false,
        'Insufficient fees wallet balance',
        null,
        { 
          code: 'INSUFFICIENT_BALANCE', 
          message: `Fees wallet balance (${feesBalance}) is less than the requested amount (${transferAmount})` 
        }
      ));
    }
    
    // Transfer tokens to main wallet
    const result = await transferTokens(
      feesWalletPrivateKey,
      mainWalletAddress,
      transferAmount,
      'celo'  // Default to Celo chain
    );
    
    // Return success response
    return res.status(200).json(standardResponse(
      true,
      'Fees withdrawn to main wallet successfully',
      {
        amount: transferAmount,
        transactionHash: result.transactionHash,
        fromAddress: feesWalletAddress,
        toAddress: mainWalletAddress
      }
    ));
  } catch (error) {
    return handleError(error, res, 'Failed to withdraw fees to main wallet');
  }
}; 

/**
 * Manually trigger transaction status correction
 * This endpoint allows admins to fix transaction statuses based on blockchain data
 */
export const triggerTransactionStatusCorrection = async (req: Request, res: Response) => {
  try {
    // Check if user is admin
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json(standardResponse(
        false,
        'Admin access required',
        null,
        { code: 'ADMIN_ACCESS_REQUIRED', message: 'Only administrators can trigger transaction status correction' }
      ));
    }

    console.log('🔧 Admin triggered transaction status correction...');

    // Find all transactions that have blockchain hashes but are marked as failed or error
    const failedTransactionsWithHashes = await Escrow.find({
      cryptoTransactionHash: { $exists: true, $ne: null },
      status: { $in: ['failed', 'error'] }
    });

    console.log(`📊 Found ${failedTransactionsWithHashes.length} transactions with blockchain hashes marked as failed/error`);

    let correctedCount = 0;
    let errorCount = 0;

    // Process each transaction
    for (const tx of failedTransactionsWithHashes) {
      try {
        console.log(`🔄 Processing transaction: ${tx.transactionId}`);
        
        // Update the transaction status to completed
        await Escrow.findByIdAndUpdate(tx._id, {
          status: 'completed',
          completedAt: tx.completedAt || new Date(),
          'metadata.statusCorrected': true,
          'metadata.correctedAt': new Date(),
          'metadata.originalStatus': tx.status,
          'metadata.correctionReason': 'Blockchain hash exists, transaction was successful'
        });
        
        console.log(`✅ Corrected transaction ${tx.transactionId}: ${tx.status} → completed`);
        correctedCount++;
        
      } catch (error) {
        console.error(`❌ Error correcting transaction ${tx.transactionId}:`, error);
        errorCount++;
      }
    }

    // Also check for transactions marked as completed but have no blockchain hash
    const completedTransactionsWithoutHashes = await Escrow.find({
      cryptoTransactionHash: { $exists: false },
      status: 'completed'
    });

    let markedAsFailed = 0;

    for (const tx of completedTransactionsWithoutHashes) {
      const transactionAge = Math.floor((Date.now() - new Date(tx.createdAt).getTime()) / (1000 * 60 * 60)); // hours
      
      // If transaction is older than 24 hours and has no blockchain hash, mark as failed
      if (transactionAge > 24) {
        try {
          await Escrow.findByIdAndUpdate(tx._id, {
            status: 'failed',
            'metadata.statusCorrected': true,
            'metadata.correctedAt': new Date(),
            'metadata.originalStatus': 'completed',
            'metadata.correctionReason': 'No blockchain hash found after 24 hours'
          });
          
          console.log(`✅ Marked transaction ${tx.transactionId} as failed (no blockchain hash after 24h)`);
          markedAsFailed++;
        } catch (error) {
          console.error(`❌ Error marking transaction ${tx.transactionId} as failed:`, error);
        }
      }
    }

    return res.json(standardResponse(
      true,
      'Transaction status correction completed successfully',
      {
        summary: {
          totalProcessed: failedTransactionsWithHashes.length,
          successfullyCorrected: correctedCount,
          errorsEncountered: errorCount,
          markedAsFailed: markedAsFailed,
          completedWithoutHashes: completedTransactionsWithoutHashes.length
        },
        details: {
          correctedTransactions: correctedCount > 0 ? failedTransactionsWithHashes.map(tx => ({
            transactionId: tx.transactionId,
            originalStatus: tx.status,
            newStatus: 'completed',
            blockchainHash: tx.cryptoTransactionHash,
            type: tx.type,
            amount: tx.cryptoAmount
          })) : [],
          failedTransactions: markedAsFailed > 0 ? completedTransactionsWithoutHashes
            .filter(tx => {
              const transactionAge = Math.floor((Date.now() - new Date(tx.createdAt).getTime()) / (1000 * 60 * 60));
              return transactionAge > 24;
            })
            .map(tx => ({
              transactionId: tx.transactionId,
              originalStatus: 'completed',
              newStatus: 'failed',
              reason: 'No blockchain hash found after 24 hours',
              type: tx.type,
              amount: tx.cryptoAmount
            })) : []
        }
      }
    ));

  } catch (error) {
    console.error('❌ Error in transaction status correction:', error);
    return handleError(error, res, 'Failed to trigger transaction status correction');
  }
}; 