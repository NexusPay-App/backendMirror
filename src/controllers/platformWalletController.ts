import { Request, Response } from 'express';
import { 
    getPlatformWalletBalance,
    getPlatformWalletStatus,
    sendFromPlatformWallet,
    initializePlatformWallets
} from '../services/platformWallet';
import { PLATFORM_FEE_WALLET } from '../config/platformWallet';
import { handleError } from '../services/utils';

// Get platform wallet balance for a specific token and chain
export const getWalletBalance = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { token } = req.params;
        const { chain = 'arbitrum' } = req.query;

        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'Token parameter is required',
                error: { code: 'INVALID_INPUT', message: 'Token is missing' }
            });
        }

        const balance = await getPlatformWalletBalance(chain as string, token as any);

        return res.json({
            success: true,
            message: 'Balance retrieved successfully',
            data: { token, chain, balance }
        });

    } catch (error) {
        console.error('Error getting wallet balance:', error);
        return handleError(error, res, 'Failed to get wallet balance');
    }
};

// Get platform wallet status (addresses and balances)
export const getPlatformStatus = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { chain = 'arbitrum' } = req.query;
        
        const status = await getPlatformWalletStatus(chain as string);

        return res.json({
            success: true,
            message: 'Platform wallet status retrieved successfully',
            data: { chain, ...status }
        });

    } catch (error) {
        console.error('Error getting platform status:', error);
        return handleError(error, res, 'Failed to get platform status');
    }
};

// Get all token balances across supported chains
export const getAllBalances = async (req: Request, res: Response): Promise<Response> => {
    try {
        const supportedChains = ['arbitrum', 'polygon', 'base', 'optimism', 'celo'];
        const supportedTokens = ['USDC', 'USDT', 'DAI', 'WETH', 'WBTC'];
        
        const balances: Record<string, Record<string, number>> = {};

        // Get balances for each chain and token combination
        for (const chain of supportedChains) {
            balances[chain] = {};
            for (const token of supportedTokens) {
                try {
                    balances[chain][token] = await getPlatformWalletBalance(chain, token as any);
                } catch (error) {
                    console.error(`Error getting balance for ${token} on ${chain}:`, error);
                    balances[chain][token] = 0;
                }
            }
        }

        return res.json({
            success: true,
            message: 'All balances retrieved successfully',
            data: balances
        });

    } catch (error) {
        console.error('Error getting all balances:', error);
        return handleError(error, res, 'Failed to get balances');
    }
};

// Withdraw fees (requires admin signatures)
export const withdrawFees = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { token, amount, toAddress, primaryKey, secondaryKey, chain = 'arbitrum' } = req.body;

        if (!token || !amount || !toAddress || !primaryKey || !secondaryKey) {
            return res.status(400).json({
                success: false,
                message: 'Invalid input parameters',
                error: {
                    code: 'INVALID_INPUT',
                    message: 'Token, amount, toAddress, primaryKey and secondaryKey are required'
                }
            });
        }

        // Use existing sendFromPlatformWallet function which requires 2 signatures
        const result = await sendFromPlatformWallet(
            amount,
            toAddress,
            primaryKey,
            secondaryKey,
            chain,
            token
        );

        return res.json({
            success: true,
            message: 'Withdrawal completed successfully',
            data: { 
                txHash: result.transactionHash,
                chain,
                token,
                amount,
                toAddress
            }
        });

    } catch (error) {
        console.error('Error withdrawing fees:', error);
        return handleError(error, res, 'Failed to withdraw fees');
    }
};

// Transfer fees (same as withdraw but with different naming for clarity)
export const transferFees = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { token, amount, toAddress, primaryKey, secondaryKey, chain = 'arbitrum' } = req.body;

        if (!token || !amount || !toAddress || !primaryKey || !secondaryKey) {
            return res.status(400).json({
                success: false,
                message: 'Invalid input parameters',
                error: {
                    code: 'INVALID_INPUT',
                    message: 'Token, amount, toAddress, primaryKey and secondaryKey are required'
                }
            });
        }

        const result = await sendFromPlatformWallet(
            amount,
            toAddress,
            primaryKey,
            secondaryKey,
            chain,
            token
        );

        return res.json({
            success: true,
            message: 'Transfer completed successfully',
            data: { 
                txHash: result.transactionHash,
                chain,
                token,
                amount,
                toAddress
            }
        });

    } catch (error) {
        console.error('Error transferring fees:', error);
        return handleError(error, res, 'Failed to transfer fees');
    }
}; 