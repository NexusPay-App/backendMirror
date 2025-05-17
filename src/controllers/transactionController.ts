import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Escrow } from '../models/escrowModel';
import { standardResponse, handleError } from '../services/utils';

/**
 * Get transaction history for authenticated user
 */
export const getTransactionHistory = async (req: Request, res: Response) => {
  try {
    // Make sure user is authenticated
    if (!req.user) {
      return res.status(401).json(standardResponse(
        false,
        'Authentication required',
        null,
        { code: 'AUTH_REQUIRED', message: 'You must be logged in to view your transaction history' }
      ));
    }

    const userId = req.user._id;
    console.log(`Fetching transaction history for user: ${userId}`);

    // Pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Get total count for pagination
    const totalTransactions = await Escrow.countDocuments({ userId });

    // Fetch transactions for user with pagination
    const transactions = await Escrow.find({ userId })
      .sort({ createdAt: -1 }) // Latest first
      .skip(skip)
      .limit(limit);

    console.log(`Found ${transactions.length} transactions for user ${userId}`);

    // Format for response
    const formattedTransactions = transactions.map((tx: any) => {
      const metadata = tx.metadata || {};
      const tokenType = metadata.tokenType || 'USDC';
      const chain = metadata.chain || 'celo';
      
      // Enhanced transaction logging with TX hash
      if (tx.cryptoTransactionHash) {
        console.log(`Transaction ${tx.transactionId}: ${tx.cryptoAmount} ${tokenType} on ${chain} - Status: ${tx.status} - TX Hash: ${tx.cryptoTransactionHash}`);
      } else {
        console.log(`Transaction ${tx.transactionId}: ${tx.cryptoAmount} ${tokenType} on ${chain} - Status: ${tx.status} - No TX Hash yet`);
      }
      
      return {
        id: tx.transactionId,
        type: tx.type,
        status: tx.status,
        fiatAmount: tx.amount,
        cryptoAmount: tx.cryptoAmount,
        tokenType: tokenType,
        chain: chain,
        createdAt: tx.createdAt,
        completedAt: tx.completedAt || null,
        mpesaTransactionId: tx.mpesaTransactionId || null,
        cryptoTransactionHash: tx.cryptoTransactionHash || null,
        txExplorerUrl: tx.cryptoTransactionHash ? generateExplorerUrl(chain, tx.cryptoTransactionHash) : null,
        usdValue: `$${tx.cryptoAmount} USD`
      };
    });

    return res.json(standardResponse(
      true,
      'Transaction history retrieved successfully',
      {
        transactions: formattedTransactions,
        pagination: {
          total: totalTransactions,
          page,
          limit,
          pages: Math.ceil(totalTransactions / limit)
        }
      }
    ));
  } catch (error) {
    return handleError(error, res, 'Failed to retrieve transaction history');
  }
};

/**
 * Get a specific transaction by ID
 */
export const getTransactionById = async (req: Request, res: Response) => {
  try {
    // Make sure user is authenticated
    if (!req.user) {
      return res.status(401).json(standardResponse(
        false,
        'Authentication required',
        null,
        { code: 'AUTH_REQUIRED', message: 'You must be logged in to view transaction details' }
      ));
    }

    const userId = req.user._id;
    const { id } = req.params;

    console.log(`Looking up transaction ${id} for user ${userId}`);

    // Find transaction that belongs to the user
    const transaction = await Escrow.findOne({
      $and: [
        { userId },
        {
          $or: [
            { _id: mongoose.isValidObjectId(id) ? id : null },
            { transactionId: id }
          ]
        }
      ]
    });

    if (!transaction) {
      return res.status(404).json(standardResponse(
        false,
        'Transaction not found',
        null,
        { code: 'TRANSACTION_NOT_FOUND', message: 'Transaction with the provided ID does not exist or does not belong to you' }
      ));
    }

    // Format for detailed view with metadata information
    const metadata = (transaction as any).metadata || {};
    const tokenType = metadata.tokenType || 'USDC';
    const chain = metadata.chain || 'celo';
    
    // Enhanced transaction logging with TX hash
    if (transaction.cryptoTransactionHash) {
      console.log(`Transaction details: ${id}`);
      console.log(`- Type: ${transaction.type}`);
      console.log(`- Status: ${transaction.status}`);
      console.log(`- Token: ${transaction.cryptoAmount} ${tokenType} on ${chain}`);
      console.log(`- Value: ~$${transaction.cryptoAmount} USD`);
      console.log(`- TX Hash: ${transaction.cryptoTransactionHash}`);
      console.log(`- Explorer URL: ${generateExplorerUrl(chain, transaction.cryptoTransactionHash)}`);
    } else {
      console.log(`Transaction details: ${transaction.cryptoAmount} ${tokenType} on ${chain}, status: ${transaction.status}, equivalent: $${transaction.cryptoAmount} USD - No TX Hash yet`);
    }

    const formattedTransaction = {
      id: transaction.transactionId,
      type: transaction.type,
      status: transaction.status,
      fiatAmount: transaction.amount,
      cryptoAmount: transaction.cryptoAmount,
      tokenType: tokenType,
      chain: chain,
      createdAt: transaction.createdAt,
      completedAt: transaction.completedAt || null,
      mpesaTransactionId: transaction.mpesaTransactionId || null,
      cryptoTransactionHash: transaction.cryptoTransactionHash || null,
      retryCount: transaction.retryCount,
      estimatedValue: `$${transaction.cryptoAmount} USD`,
      txExplorerUrl: transaction.cryptoTransactionHash ? generateExplorerUrl(chain, transaction.cryptoTransactionHash) : null
    };

    return res.json(standardResponse(
      true,
      'Transaction details retrieved successfully',
      { transaction: formattedTransaction }
    ));
  } catch (error) {
    return handleError(error, res, 'Failed to retrieve transaction details');
  }
};

/**
 * Generate blockchain explorer URL based on chain and transaction hash
 */
function generateExplorerUrl(chain: string, txHash: string): string {
  const explorers: {[key: string]: string} = {
    'celo': 'https://explorer.celo.org/mainnet/tx/',
    'polygon': 'https://polygonscan.com/tx/',
    'arbitrum': 'https://arbiscan.io/tx/',
    'base': 'https://basescan.org/tx/',
    'optimism': 'https://optimistic.etherscan.io/tx/',
    'ethereum': 'https://etherscan.io/tx/',
    'binance': 'https://bscscan.com/tx/',
    'bnb': 'https://bscscan.com/tx/',
    'avalanche': 'https://snowtrace.io/tx/',
    'fantom': 'https://ftmscan.com/tx/',
    'gnosis': 'https://gnosisscan.io/tx/',
    'scroll': 'https://scrollscan.com/tx/',
    'moonbeam': 'https://moonbeam.moonscan.io/tx/',
    'fuse': 'https://explorer.fuse.io/tx/',
    'aurora': 'https://explorer.aurora.dev/tx/'
  };
  
  const baseUrl = explorers[chain] || explorers['celo']; // Default to Celo if chain not found
  return `${baseUrl}${txHash}`;
} 