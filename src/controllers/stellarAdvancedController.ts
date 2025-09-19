import { Request, Response } from 'express';
import { stellarAdvancedService } from '../services/stellarAdvanced';
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
 * Create a multi-signature wallet
 */
export const createMultiSigWallet = async (req: Request, res: Response) => {
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

    const { signers, threshold } = req.body;

    // Validate required fields
    if (!signers || !Array.isArray(signers) || signers.length === 0) {
      return res.status(400).json(standardResponse(
        false,
        'Invalid signers',
        null,
        { code: 'VALIDATION_ERROR', message: 'At least one signer is required' }
      ));
    }

    if (!threshold || !threshold.low || !threshold.medium || !threshold.high) {
      return res.status(400).json(standardResponse(
        false,
        'Invalid threshold',
        null,
        { code: 'VALIDATION_ERROR', message: 'All threshold levels are required' }
      ));
    }

    // Validate signers
    for (const signer of signers) {
      if (!signer.publicKey || typeof signer.weight !== 'number' || signer.weight < 1 || signer.weight > 255) {
        return res.status(400).json(standardResponse(
          false,
          'Invalid signer configuration',
          null,
          { code: 'VALIDATION_ERROR', message: 'Each signer must have a valid publicKey and weight (1-255)' }
        ));
      }
    }

    const multiSigWallet = await stellarAdvancedService.createMultiSigWallet(
      userId,
      signers,
      threshold
    );

    return res.status(201).json(standardResponse(
      true,
      'Multi-signature wallet created successfully',
      multiSigWallet
    ));
  } catch (error: any) {
    logger.error('Error creating multi-sig wallet:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to create multi-signature wallet',
      null,
      { code: 'MULTISIG_CREATION_FAILED', message: error.message }
    ));
  }
};

/**
 * Get user's multi-signature wallets
 */
export const getMultiSigWallets = async (req: Request, res: Response) => {
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

    const wallets = await stellarAdvancedService.getUserMultiSigWallets(userId);

    return res.status(200).json(standardResponse(
      true,
      'Multi-signature wallets retrieved successfully',
      { wallets }
    ));
  } catch (error: any) {
    logger.error('Error getting multi-sig wallets:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to get multi-signature wallets',
      null,
      { code: 'MULTISIG_FETCH_FAILED', message: error.message }
    ));
  }
};

/**
 * Create a payment channel
 */
export const createPaymentChannel = async (req: Request, res: Response) => {
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

    const { destinationAccountId, asset, amount, durationHours = 24 } = req.body;

    // Validate required fields
    if (!destinationAccountId || !asset || !amount) {
      return res.status(400).json(standardResponse(
        false,
        'Missing required fields',
        null,
        { code: 'VALIDATION_ERROR', message: 'destinationAccountId, asset, and amount are required' }
      ));
    }

    // Validate amount
    if (parseFloat(amount) <= 0) {
      return res.status(400).json(standardResponse(
        false,
        'Invalid amount',
        null,
        { code: 'INVALID_AMOUNT', message: 'Amount must be greater than 0' }
      ));
    }

    // Get user's wallet address (you would get this from your wallet service)
    const sourceAccountId = 'USER_WALLET_ADDRESS'; // This should come from your wallet service

    const paymentChannel = await stellarAdvancedService.createPaymentChannel(
      sourceAccountId,
      destinationAccountId,
      asset,
      amount,
      durationHours
    );

    return res.status(201).json(standardResponse(
      true,
      'Payment channel created successfully',
      paymentChannel
    ));
  } catch (error: any) {
    logger.error('Error creating payment channel:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to create payment channel',
      null,
      { code: 'CHANNEL_CREATION_FAILED', message: error.message }
    ));
  }
};

/**
 * Execute payment through a channel
 */
export const executeChannelPayment = async (req: Request, res: Response) => {
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

    const { channelId, amount, memo } = req.body;

    if (!channelId || !amount) {
      return res.status(400).json(standardResponse(
        false,
        'Missing required fields',
        null,
        { code: 'VALIDATION_ERROR', message: 'channelId and amount are required' }
      ));
    }

    const result = await stellarAdvancedService.executeChannelPayment(
      channelId,
      amount,
      memo
    );

    return res.status(200).json(standardResponse(
      true,
      'Channel payment executed successfully',
      result
    ));
  } catch (error: any) {
    logger.error('Error executing channel payment:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to execute channel payment',
      null,
      { code: 'CHANNEL_PAYMENT_FAILED', message: error.message }
    ));
  }
};

/**
 * Get user's payment channels
 */
export const getPaymentChannels = async (req: Request, res: Response) => {
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

    const channels = await stellarAdvancedService.getUserPaymentChannels(userId);

    return res.status(200).json(standardResponse(
      true,
      'Payment channels retrieved successfully',
      { channels }
    ));
  } catch (error: any) {
    logger.error('Error getting payment channels:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to get payment channels',
      null,
      { code: 'CHANNELS_FETCH_FAILED', message: error.message }
    ));
  }
};

/**
 * Get asset information
 */
export const getAssetInfo = async (req: Request, res: Response) => {
  try {
    const { assetCode, issuer } = req.query;

    if (!assetCode) {
      return res.status(400).json(standardResponse(
        false,
        'Asset code is required',
        null,
        { code: 'VALIDATION_ERROR', message: 'assetCode parameter is required' }
      ));
    }

    const assetInfo = await stellarAdvancedService.getAssetInfo(
      assetCode as string,
      issuer as string
    );

    return res.status(200).json(standardResponse(
      true,
      'Asset information retrieved successfully',
      assetInfo
    ));
  } catch (error: any) {
    logger.error('Error getting asset info:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to get asset information',
      null,
      { code: 'ASSET_INFO_FAILED', message: error.message }
    ));
  }
};

/**
 * Create a swap offer
 */
export const createSwapOffer = async (req: Request, res: Response) => {
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

    const { fromAsset, toAsset, fromAmount, toAmount, expiresInHours = 24 } = req.body;

    if (!fromAsset || !toAsset || !fromAmount || !toAmount) {
      return res.status(400).json(standardResponse(
        false,
        'Missing required fields',
        null,
        { code: 'VALIDATION_ERROR', message: 'fromAsset, toAsset, fromAmount, and toAmount are required' }
      ));
    }

    const swapOffer = await stellarAdvancedService.createSwapOffer(
      fromAsset,
      toAsset,
      fromAmount,
      toAmount,
      expiresInHours
    );

    return res.status(201).json(standardResponse(
      true,
      'Swap offer created successfully',
      swapOffer
    ));
  } catch (error: any) {
    logger.error('Error creating swap offer:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to create swap offer',
      null,
      { code: 'SWAP_OFFER_FAILED', message: error.message }
    ));
  }
};

/**
 * Get available swap offers
 */
export const getSwapOffers = async (req: Request, res: Response) => {
  try {
    const { fromAsset, toAsset, limit = 10 } = req.query;

    const offers = await stellarAdvancedService.getSwapOffers(
      fromAsset as string,
      toAsset as string,
      parseInt(limit as string)
    );

    return res.status(200).json(standardResponse(
      true,
      'Swap offers retrieved successfully',
      { offers }
    ));
  } catch (error: any) {
    logger.error('Error getting swap offers:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to get swap offers',
      null,
      { code: 'SWAP_OFFERS_FAILED', message: error.message }
    ));
  }
};

/**
 * Execute a swap
 */
export const executeSwap = async (req: Request, res: Response) => {
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

    const { offerId, userAccountId, amount } = req.body;

    if (!offerId || !userAccountId || !amount) {
      return res.status(400).json(standardResponse(
        false,
        'Missing required fields',
        null,
        { code: 'VALIDATION_ERROR', message: 'offerId, userAccountId, and amount are required' }
      ));
    }

    const result = await stellarAdvancedService.executeSwap(
      offerId,
      userAccountId,
      amount
    );

    return res.status(200).json(standardResponse(
      true,
      'Swap executed successfully',
      result
    ));
  } catch (error: any) {
    logger.error('Error executing swap:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to execute swap',
      null,
      { code: 'SWAP_EXECUTION_FAILED', message: error.message }
    ));
  }
};

/**
 * Get network statistics
 */
export const getNetworkStats = async (req: Request, res: Response) => {
  try {
    const stats = await stellarAdvancedService.getNetworkStats();

    return res.status(200).json(standardResponse(
      true,
      'Network statistics retrieved successfully',
      stats
    ));
  } catch (error: any) {
    logger.error('Error getting network stats:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to get network statistics',
      null,
      { code: 'NETWORK_STATS_FAILED', message: error.message }
    ));
  }
};

/**
 * Create a time-locked payment
 */
export const createTimeLockedPayment = async (req: Request, res: Response) => {
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

    const { toAccountId, amount, asset, unlockTime, memo } = req.body;

    if (!toAccountId || !amount || !asset || !unlockTime) {
      return res.status(400).json(standardResponse(
        false,
        'Missing required fields',
        null,
        { code: 'VALIDATION_ERROR', message: 'toAccountId, amount, asset, and unlockTime are required' }
      ));
    }

    // Validate unlock time
    const unlockDate = new Date(unlockTime);
    if (unlockDate <= new Date()) {
      return res.status(400).json(standardResponse(
        false,
        'Invalid unlock time',
        null,
        { code: 'INVALID_UNLOCK_TIME', message: 'Unlock time must be in the future' }
      ));
    }

    const fromAccountId = 'USER_WALLET_ADDRESS'; // This should come from your wallet service

    const result = await stellarAdvancedService.createTimeLockedPayment(
      fromAccountId,
      toAccountId,
      amount,
      asset,
      unlockDate,
      memo
    );

    return res.status(201).json(standardResponse(
      true,
      'Time-locked payment created successfully',
      result
    ));
  } catch (error: any) {
    logger.error('Error creating time-locked payment:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to create time-locked payment',
      null,
      { code: 'TIME_LOCKED_FAILED', message: error.message }
    ));
  }
};
