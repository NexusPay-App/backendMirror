import { Request, Response } from 'express';
import { stellarMpesaService } from '../services/stellarMpesa';
import { stellarWalletService } from '../services/stellarWallet';
import { standardResponse } from '../services/utils';
import pino from 'pino';

// Configure logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty'
  }
});

/**
 * Initiate Stellar deposit via MPESA
 */
export const initiateDeposit = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json(standardResponse(
        false,
        'User not authenticated',
        null,
        { code: 'AUTH_REQUIRED', message: 'Authentication required' }
      ));
    }

    const { phoneNumber, amountKES, asset = 'XLM', memo } = req.body;

    // Validate required fields
    if (!phoneNumber || !amountKES) {
      return res.status(400).json(standardResponse(
        false,
        'Missing required fields',
        null,
        { code: 'VALIDATION_ERROR', message: 'phoneNumber and amountKES are required' }
      ));
    }

    // Validate amount
    if (amountKES <= 0) {
      return res.status(400).json(standardResponse(
        false,
        'Invalid amount',
        null,
        { code: 'INVALID_AMOUNT', message: 'Amount must be greater than 0' }
      ));
    }

    // Ensure user has a Stellar wallet
    let wallet = await stellarWalletService.getUserWallet(userId);
    if (!wallet) {
      // Create wallet if it doesn't exist
      wallet = await stellarWalletService.createWallet(userId, phoneNumber);
    }

    const result = await stellarMpesaService.initiateDeposit({
      userId,
      phoneNumber,
      amountKES,
      asset,
      memo
    });

    return res.status(200).json(standardResponse(
      true,
      'Deposit initiated successfully',
      {
        transactionId: result.transactionId,
        status: result.status,
        message: result.message
      }
    ));
  } catch (error: any) {
    logger.error('Error initiating Stellar deposit:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to initiate deposit',
      null,
      { code: 'DEPOSIT_FAILED', message: error.message }
    ));
  }
};

/**
 * Initiate Stellar withdrawal to MPESA
 */
export const initiateWithdrawal = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json(standardResponse(
        false,
        'User not authenticated',
        null,
        { code: 'AUTH_REQUIRED', message: 'Authentication required' }
      ));
    }

    const { phoneNumber, amountAsset, asset = 'XLM', memo } = req.body;

    // Validate required fields
    if (!phoneNumber || !amountAsset) {
      return res.status(400).json(standardResponse(
        false,
        'Missing required fields',
        null,
        { code: 'VALIDATION_ERROR', message: 'phoneNumber and amountAsset are required' }
      ));
    }

    // Validate amount
    if (parseFloat(amountAsset) <= 0) {
      return res.status(400).json(standardResponse(
        false,
        'Invalid amount',
        null,
        { code: 'INVALID_AMOUNT', message: 'Amount must be greater than 0' }
      ));
    }

    // Check if user has a Stellar wallet
    const wallet = await stellarWalletService.getUserWallet(userId);
    if (!wallet) {
      return res.status(404).json(standardResponse(
        false,
        'Stellar wallet not found',
        null,
        { code: 'WALLET_NOT_FOUND', message: 'Please create a Stellar wallet first' }
      ));
    }

    const result = await stellarMpesaService.initiateWithdrawal({
      userId,
      phoneNumber,
      amountAsset,
      asset,
      memo
    });

    return res.status(200).json(standardResponse(
      true,
      'Withdrawal initiated successfully',
      {
        transactionId: result.transactionId,
        status: result.status,
        message: result.message
      }
    ));
  } catch (error: any) {
    logger.error('Error initiating Stellar withdrawal:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to initiate withdrawal',
      null,
      { code: 'WITHDRAWAL_FAILED', message: error.message }
    ));
  }
};

/**
 * Get transaction status
 */
export const getTransactionStatus = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json(standardResponse(
        false,
        'User not authenticated',
        null,
        { code: 'AUTH_REQUIRED', message: 'Authentication required' }
      ));
    }

    const { transactionId } = req.params;
    if (!transactionId) {
      return res.status(400).json(standardResponse(
        false,
        'Transaction ID is required',
        null,
        { code: 'VALIDATION_ERROR', message: 'Transaction ID parameter is required' }
      ));
    }

    const transaction = await stellarMpesaService.getTransactionStatus(transactionId);
    if (!transaction) {
      return res.status(404).json(standardResponse(
        false,
        'Transaction not found',
        null,
        { code: 'TRANSACTION_NOT_FOUND', message: 'Transaction not found' }
      ));
    }

    // Verify the transaction belongs to the authenticated user
    if (transaction.userId !== userId) {
      return res.status(403).json(standardResponse(
        false,
        'Access denied',
        null,
        { code: 'ACCESS_DENIED', message: 'You can only view your own transactions' }
      ));
    }

    return res.status(200).json(standardResponse(
      true,
      'Transaction status retrieved successfully',
      transaction
    ));
  } catch (error: any) {
    logger.error('Error getting transaction status:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to get transaction status',
      null,
      { code: 'STATUS_FETCH_FAILED', message: error.message }
    ));
  }
};

/**
 * Get user's transaction history
 */
export const getTransactionHistory = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json(standardResponse(
        false,
        'User not authenticated',
        null,
        { code: 'AUTH_REQUIRED', message: 'Authentication required' }
      ));
    }

    const { limit = 10 } = req.query;
    const history = await stellarMpesaService.getUserTransactionHistory(
      userId,
      parseInt(limit as string)
    );

    return res.status(200).json(standardResponse(
      true,
      'Transaction history retrieved successfully',
      {
        transactions: history,
        count: history.length,
        timestamp: new Date()
      }
    ));
  } catch (error: any) {
    logger.error('Error getting transaction history:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to get transaction history',
      null,
      { code: 'HISTORY_FETCH_FAILED', message: error.message }
    ));
  }
};

/**
 * Get exchange rates
 */
export const getExchangeRates = async (req: Request, res: Response) => {
  try {
    const rates = await stellarMpesaService.getExchangeRates();

    return res.status(200).json(standardResponse(
      true,
      'Exchange rates retrieved successfully',
      rates
    ));
  } catch (error: any) {
    logger.error('Error getting exchange rates:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to get exchange rates',
      null,
      { code: 'RATES_FETCH_FAILED', message: error.message }
    ));
  }
};

/**
 * Convert KES to Stellar asset amount
 */
export const convertKesToAsset = async (req: Request, res: Response) => {
  try {
    const { amountKES, asset = 'XLM' } = req.body;

    if (!amountKES) {
      return res.status(400).json(standardResponse(
        false,
        'Amount in KES is required',
        null,
        { code: 'VALIDATION_ERROR', message: 'amountKES is required' }
      ));
    }

    if (amountKES <= 0) {
      return res.status(400).json(standardResponse(
        false,
        'Invalid amount',
        null,
        { code: 'INVALID_AMOUNT', message: 'Amount must be greater than 0' }
      ));
    }

    const conversion = await stellarMpesaService.convertKesToStellarAsset(amountKES, asset);

    return res.status(200).json(standardResponse(
      true,
      'Currency conversion completed successfully',
      {
        amountKES,
        amountAsset: conversion.amountAsset,
        asset,
        exchangeRate: conversion.exchangeRate,
        usdValue: conversion.usdValue,
        timestamp: new Date()
      }
    ));
  } catch (error: any) {
    logger.error('Error converting KES to asset:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to convert currency',
      null,
      { code: 'CONVERSION_FAILED', message: error.message }
    ));
  }
};

/**
 * Convert Stellar asset amount to KES
 */
export const convertAssetToKes = async (req: Request, res: Response) => {
  try {
    const { amountAsset, asset = 'XLM' } = req.body;

    if (!amountAsset) {
      return res.status(400).json(standardResponse(
        false,
        'Amount in asset is required',
        null,
        { code: 'VALIDATION_ERROR', message: 'amountAsset is required' }
      ));
    }

    if (parseFloat(amountAsset) <= 0) {
      return res.status(400).json(standardResponse(
        false,
        'Invalid amount',
        null,
        { code: 'INVALID_AMOUNT', message: 'Amount must be greater than 0' }
      ));
    }

    const conversion = await stellarMpesaService.convertStellarAssetToKes(amountAsset, asset);

    return res.status(200).json(standardResponse(
      true,
      'Currency conversion completed successfully',
      {
        amountAsset,
        amountKES: conversion.amountKES,
        asset,
        exchangeRate: conversion.exchangeRate,
        usdValue: conversion.usdValue,
        timestamp: new Date()
      }
    ));
  } catch (error: any) {
    logger.error('Error converting asset to KES:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to convert currency',
      null,
      { code: 'CONVERSION_FAILED', message: error.message }
    ));
  }
};

/**
 * MPESA callback handler for Stellar deposits
 */
export const handleMpesaCallback = async (req: Request, res: Response) => {
  try {
    const callbackData = req.body;
    logger.info('Received MPESA callback for Stellar deposit:', JSON.stringify(callbackData));

    // Extract transaction details from MPESA callback
    const { 
      Body: { 
        stkCallback: { 
          CheckoutRequestID, 
          ResultCode, 
          ResultDesc,
          CallbackMetadata 
        } 
      } 
    } = callbackData;

    // Find transaction by CheckoutRequestID
    const { StellarTransaction } = await import('../models/stellarTransaction');
    const { redis, isRedisConnected } = await import('../config/redis');
    
    // First try cache for quick lookup
    let transactionId: string | null = null;
    if (isRedisConnected()) {
      const cacheKey = `stellar:mpesa:checkout:${CheckoutRequestID}`;
      transactionId = await redis.get(cacheKey);
    }

    // If not in cache, query database
    if (!transactionId) {
      const stellarTx = await StellarTransaction.findOne({ 
        mpesaCheckoutRequestId: CheckoutRequestID 
      });
      
      if (!stellarTx) {
        logger.error(`Transaction not found for CheckoutRequestID: ${CheckoutRequestID}`);
        return res.status(200).json({
          ResultCode: 0,
          ResultDesc: 'Transaction not found'
        });
      }
      
      transactionId = stellarTx.transactionId;
    }

    if (ResultCode === 0) {
      // Payment successful - process the deposit
      const amount = CallbackMetadata?.Item?.find((item: any) => item.Name === 'Amount')?.Value;
      const mpesaReceiptNumber = CallbackMetadata?.Item?.find((item: any) => item.Name === 'MpesaReceiptNumber')?.Value;
      const phoneNumber = CallbackMetadata?.Item?.find((item: any) => item.Name === 'PhoneNumber')?.Value;

      logger.info(`MPESA payment successful: ${mpesaReceiptNumber}, processing Stellar deposit...`);

      // Get transaction details
      const stellarTx = await StellarTransaction.findOne({ transactionId });
      if (!stellarTx) {
        throw new Error('Transaction not found');
      }

      // Send Stellar assets from platform to user wallet
      const { stellarService } = await import('../services/stellar');
      const { getStellarConfig } = await import('../config/stellar');
      const { stellarWalletService } = await import('../services/stellarWallet');
      const stellarConfig = getStellarConfig();

      if (!stellarConfig.platformWalletSecret) {
        throw new Error('Platform wallet not configured');
      }

      // Get user wallet
      const userWallet = await stellarWalletService.getUserWallet(stellarTx.userId.toString());
      if (!userWallet) {
        throw new Error('User wallet not found');
      }

      // Get asset issuer
      const assetIssuer = stellarTx.asset === 'USDC' ? stellarConfig.usdcIssuer 
        : stellarTx.asset === 'USDT' ? stellarConfig.usdtIssuer
        : stellarTx.asset === 'BTC' ? stellarConfig.btcIssuer
        : undefined;

      // Send payment from platform to user
      const transferResult = await stellarService.sendPayment(
        stellarConfig.platformWalletSecret,
        userWallet.accountId,
        stellarTx.amount,
        stellarTx.asset,
        assetIssuer,
        `Deposit from M-Pesa: ${transactionId}`
      );

      // Update transaction with success details
      stellarTx.status = 'completed';
      stellarTx.mpesaReceiptNumber = mpesaReceiptNumber;
      stellarTx.mpesaTransactionId = mpesaReceiptNumber;
      stellarTx.stellarTransactionHash = transferResult.transactionHash;
      stellarTx.toAccountId = userWallet.accountId;
      stellarTx.completedAt = new Date();
      await stellarTx.save();

      logger.info(`✅ Stellar deposit completed: ${transactionId}, tx: ${transferResult.transactionHash}`);
    } else {
      // Payment failed
      const stellarTx = await StellarTransaction.findOne({ transactionId });
      if (stellarTx) {
        stellarTx.status = 'failed';
        stellarTx.error = ResultDesc;
        stellarTx.completedAt = new Date();
        await stellarTx.save();
      }

      logger.error(`❌ Stellar deposit failed: ${transactionId} - ${ResultDesc}`);
    }

    // Respond to MPESA
    return res.status(200).json({
      ResultCode: 0,
      ResultDesc: 'Success'
    });
  } catch (error: any) {
    logger.error('Error handling MPESA callback:', error);
    // Still return success to MPESA to prevent retries
    return res.status(200).json({
      ResultCode: 0,
      ResultDesc: 'Accepted'
    });
  }
};
