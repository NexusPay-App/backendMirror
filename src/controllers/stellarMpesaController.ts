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
    logger.info('Received MPESA callback for Stellar deposit:', callbackData);

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

    // Find the transaction by CheckoutRequestID
    // In a real implementation, you would store this mapping in your database
    const transactionId = CheckoutRequestID; // This should be mapped to your internal transaction ID

    if (ResultCode === 0) {
      // Payment successful
      const amount = CallbackMetadata?.Item?.find((item: any) => item.Name === 'Amount')?.Value;
      const mpesaReceiptNumber = CallbackMetadata?.Item?.find((item: any) => item.Name === 'MpesaReceiptNumber')?.Value;
      const phoneNumber = CallbackMetadata?.Item?.find((item: any) => item.Name === 'PhoneNumber')?.Value;

      // Update transaction status
      await stellarMpesaService.updateTransactionStatus(transactionId, 'completed', {
        mpesaTransactionId: mpesaReceiptNumber
      });

      // Here you would:
      // 1. Convert the MPESA payment to Stellar assets
      // 2. Send the Stellar assets to the user's wallet
      // 3. Update the transaction with the Stellar transaction hash

      logger.info(`Stellar deposit completed: ${transactionId}`);
    } else {
      // Payment failed
      await stellarMpesaService.updateTransactionStatus(transactionId, 'failed', {
        error: ResultDesc
      });

      logger.error(`Stellar deposit failed: ${transactionId} - ${ResultDesc}`);
    }

    // Respond to MPESA
    return res.status(200).json({
      ResultCode: 0,
      ResultDesc: 'Success'
    });
  } catch (error: any) {
    logger.error('Error handling MPESA callback:', error);
    return res.status(500).json({
      ResultCode: 1,
      ResultDesc: 'Internal server error'
    });
  }
};
