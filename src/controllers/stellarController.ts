import { Request, Response } from 'express';
import { stellarWalletService } from '../services/stellarWallet';
import { stellarPriceService } from '../services/stellarPrice';
import { stellarMpesaService } from '../services/stellarMpesa';
import { stellarService } from '../services/stellar';
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
 * Create a new Stellar wallet for the authenticated user
 */
export const createWallet = async (req: Request, res: Response) => {
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

    const wallet = await stellarWalletService.createWallet(userId, req.user?.phoneNumber);
    
    // Don't return the secret key in the response
    const { secretKey, ...walletInfo } = wallet;

    return res.status(201).json(standardResponse(
      true,
      'Stellar wallet created successfully',
      {
        accountId: walletInfo.accountId,
        balances: walletInfo.balances,
        isActive: walletInfo.isActive,
        createdAt: walletInfo.createdAt
      }
    ));
  } catch (error: any) {
    logger.error('Error creating Stellar wallet:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to create Stellar wallet',
      null,
      { code: 'WALLET_CREATION_FAILED', message: error.message }
    ));
  }
};

/**
 * Get user's Stellar wallet information
 */
export const getWallet = async (req: Request, res: Response) => {
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

    const wallet = await stellarWalletService.getUserWallet(userId);
    if (!wallet) {
      return res.status(404).json(standardResponse(
        false,
        'Stellar wallet not found',
        null,
        { code: 'WALLET_NOT_FOUND', message: 'Please create a Stellar wallet first' }
      ));
    }

    // Don't return the secret key
    const { secretKey, ...walletInfo } = wallet;

    return res.status(200).json(standardResponse(
      true,
      'Wallet information retrieved successfully',
      walletInfo
    ));
  } catch (error: any) {
    logger.error('Error getting Stellar wallet:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to get wallet information',
      null,
      { code: 'WALLET_FETCH_FAILED', message: error.message }
    ));
  }
};

/**
 * Get user's Stellar secret key (private key)
 * WARNING: This endpoint returns sensitive information. Only accessible by authenticated user.
 */
export const getSecretKey = async (req: Request, res: Response) => {
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

    // Get user with secret key explicitly selected
    const { User } = await import('../models/user');
    const user = await User.findById(userId).select('+stellarSecretKey');
    
    if (!user || !user.stellarAccountId || !user.stellarSecretKey) {
      return res.status(404).json(standardResponse(
        false,
        'Stellar wallet not found',
        null,
        { code: 'WALLET_NOT_FOUND', message: 'Please create a Stellar wallet first' }
      ));
    }

    return res.status(200).json(standardResponse(
      true,
      'Secret key retrieved successfully',
      {
        accountId: user.stellarAccountId,
        secretKey: user.stellarSecretKey,
        warning: 'Keep this secret key secure. Never share it with anyone. Anyone with this key can access your wallet.'
      }
    ));
  } catch (error: any) {
    logger.error('Error getting Stellar secret key:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to get secret key',
      null,
      { code: 'SECRET_KEY_FETCH_FAILED', message: error.message }
    ));
  }
};

/**
 * Get wallet balance for a specific asset
 */
export const getBalance = async (req: Request, res: Response) => {
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

    const { asset = 'XLM' } = req.query;
    const balance = await stellarWalletService.getWalletBalance(userId, asset as string);
    
    // Get USD value
    const usdValue = await stellarPriceService.calculateUSDValue(balance, asset as string);

    return res.status(200).json(standardResponse(
      true,
      'Balance retrieved successfully',
      {
        asset,
        balance,
        usdValue,
        timestamp: new Date()
      }
    ));
  } catch (error: any) {
    logger.error('Error getting balance:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to get balance',
      null,
      { code: 'BALANCE_FETCH_FAILED', message: error.message }
    ));
  }
};

/**
 * Get all wallet balances
 */
export const getAllBalances = async (req: Request, res: Response) => {
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

    const balances = await stellarWalletService.getAllBalances(userId);
    
    // Calculate USD values for all balances
    const balancesWithUSD = await Promise.all(
      balances.map(async (balance) => ({
        ...balance,
        usdValue: await stellarPriceService.calculateUSDValue(balance.balance, balance.asset)
      }))
    );

    return res.status(200).json(standardResponse(
      true,
      'All balances retrieved successfully',
      {
        balances: balancesWithUSD,
        timestamp: new Date()
      }
    ));
  } catch (error: any) {
    logger.error('Error getting all balances:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to get balances',
      null,
      { code: 'BALANCES_FETCH_FAILED', message: error.message }
    ));
  }
};

/**
 * Send payment to another Stellar address
 */
export const sendPayment = async (req: Request, res: Response) => {
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

    const { toAccountId, amount, asset = 'XLM', memo } = req.body;

    // Validate required fields
    if (!toAccountId || !amount) {
      return res.status(400).json(standardResponse(
        false,
        'Missing required fields',
        null,
        { code: 'VALIDATION_ERROR', message: 'toAccountId and amount are required' }
      ));
    }

    // Validate recipient address
    if (!stellarWalletService.validateAddress(toAccountId)) {
      return res.status(400).json(standardResponse(
        false,
        'Invalid recipient address',
        null,
        { code: 'INVALID_ADDRESS', message: 'Please provide a valid Stellar address' }
      ));
    }

    const result = await stellarWalletService.sendPayment(
      userId,
      toAccountId,
      amount,
      asset,
      memo
    );

    return res.status(200).json(standardResponse(
      true,
      'Payment sent successfully',
      {
        transactionId: result.transactionId,
        transactionHash: result.transactionHash,
        status: result.status,
        fee: result.fee,
        timestamp: result.timestamp
      }
    ));
  } catch (error: any) {
    logger.error('Error sending payment:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to send payment',
      null,
      { code: 'PAYMENT_FAILED', message: error.message }
    ));
  }
};

/**
 * Get transaction history
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

    const { limit = 10, cursor } = req.query;
    const history = await stellarWalletService.getTransactionHistory(
      userId,
      parseInt(limit as string),
      cursor as string
    );

    return res.status(200).json(standardResponse(
      true,
      'Transaction history retrieved successfully',
      history
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
 * Create trustline for an asset
 */
export const createTrustline = async (req: Request, res: Response) => {
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

    const { assetCode, issuer, limit } = req.body;

    if (!assetCode || !issuer) {
      return res.status(400).json(standardResponse(
        false,
        'Missing required fields',
        null,
        { code: 'VALIDATION_ERROR', message: 'assetCode and issuer are required' }
      ));
    }

    const result = await stellarWalletService.createTrustline(
      userId,
      assetCode,
      issuer,
      limit
    );

    return res.status(200).json(standardResponse(
      true,
      'Trustline created successfully',
      {
        transactionHash: result.transactionHash,
        assetCode,
        issuer
      }
    ));
  } catch (error: any) {
    logger.error('Error creating trustline:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to create trustline',
      null,
      { code: 'TRUSTLINE_FAILED', message: error.message }
    ));
  }
};

/**
 * Fund wallet with testnet XLM (testnet only)
 */
export const fundWallet = async (req: Request, res: Response) => {
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

    const result = await stellarWalletService.fundWallet(userId);

    return res.status(200).json(standardResponse(
      result.success,
      result.message,
      { success: result.success }
    ));
  } catch (error: any) {
    logger.error('Error funding wallet:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to fund wallet',
      null,
      { code: 'FUNDING_FAILED', message: error.message }
    ));
  }
};

/**
 * Get current asset prices
 */
export const getPrices = async (req: Request, res: Response) => {
  try {
    const { asset } = req.query;
    
    if (asset) {
      const price = await stellarPriceService.getAssetPrice(asset as string);
      const priceData = await stellarPriceService.getPriceData(asset as string);
      
      return res.status(200).json(standardResponse(
        true,
        'Price retrieved successfully',
        priceData
      ));
    } else {
      const prices = await stellarPriceService.getAllPrices();
      
      return res.status(200).json(standardResponse(
        true,
        'All prices retrieved successfully',
        {
          prices,
          timestamp: new Date()
        }
      ));
    }
  } catch (error: any) {
    logger.error('Error getting prices:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to get prices',
      null,
      { code: 'PRICE_FETCH_FAILED', message: error.message }
    ));
  }
};

/**
 * Get network information
 */
export const getNetworkInfo = async (req: Request, res: Response) => {
  try {
    const networkInfo = await stellarWalletService.getNetworkInfo();
    
    return res.status(200).json(standardResponse(
      true,
      'Network information retrieved successfully',
      networkInfo
    ));
  } catch (error: any) {
    logger.error('Error getting network info:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to get network information',
      null,
      { code: 'NETWORK_INFO_FAILED', message: error.message }
    ));
  }
};

/**
 * Validate Stellar address
 */
export const validateAddress = async (req: Request, res: Response) => {
  try {
    const { address } = req.body;
    
    if (!address) {
      return res.status(400).json(standardResponse(
        false,
        'Address is required',
        null,
        { code: 'VALIDATION_ERROR', message: 'Address parameter is required' }
      ));
    }

    const isValid = stellarWalletService.validateAddress(address);
    
    return res.status(200).json(standardResponse(
      true,
      'Address validation completed',
      {
        address,
        isValid
      }
    ));
  } catch (error: any) {
    logger.error('Error validating address:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to validate address',
      null,
      { code: 'VALIDATION_FAILED', message: error.message }
    ));
  }
};
