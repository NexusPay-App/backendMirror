import { Request, Response } from 'express';
import { RampService } from '../services/rampService';
import { handleError } from '../services/utils';
import { RampType, PaymentMethod } from '../models/RampTransaction';
import { TokenSymbol } from '../config/tokens';

// Create a new ramp transaction
export const createRampTransaction = async (req: Request, res: Response): Promise<Response> => {
    try {
        const {
            type,
            paymentMethod,
            fiatCurrency,
            fiatAmount,
            cryptoToken
        } = req.body;

        const userId = req.user._id;

        // Validate input
        if (!type || !paymentMethod || !fiatCurrency || !fiatAmount || !cryptoToken) {
            return res.status(400).json({
                success: false,
                message: 'Invalid input parameters',
                error: {
                    code: 'INVALID_INPUT',
                    message: 'All fields are required'
                }
            });
        }

        // Validate amount
        if (fiatAmount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid amount',
                error: {
                    code: 'INVALID_AMOUNT',
                    message: 'Amount must be greater than 0'
                }
            });
        }

        // Create transaction
        const transaction = await RampService.createTransaction({
            userId,
            type: type as RampType,
            paymentMethod: paymentMethod as PaymentMethod,
            fiatCurrency,
            fiatAmount,
            cryptoToken: cryptoToken as TokenSymbol
        });

        return res.json({
            success: true,
            message: 'Ramp transaction created successfully',
            data: transaction
        });

    } catch (error) {
        console.error('Error creating ramp transaction:', error);
        return handleError(error, res, 'Failed to create ramp transaction');
    }
};

// Get user's transactions
export const getUserTransactions = async (req: Request, res: Response): Promise<Response> => {
    try {
        const userId = req.user._id;
        const { type, status } = req.query;

        const transactions = await RampService.getUserTransactions(
            userId,
            type as RampType,
            status as any
        );

        return res.json({
            success: true,
            message: 'Transactions retrieved successfully',
            data: transactions
        });

    } catch (error) {
        console.error('Error getting user transactions:', error);
        return handleError(error, res, 'Failed to get transactions');
    }
};

// Get transaction statistics
export const getTransactionStats = async (req: Request, res: Response): Promise<Response> => {
    try {
        const userId = req.user._id;
        const stats = await RampService.getTransactionStats(userId);

        return res.json({
            success: true,
            message: 'Transaction statistics retrieved successfully',
            data: stats
        });

    } catch (error) {
        console.error('Error getting transaction stats:', error);
        return handleError(error, res, 'Failed to get transaction statistics');
    }
};

// Calculate potential savings
export const calculateSavings = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { amount, currentTier, nextTier } = req.body;

        if (!amount || !currentTier || !nextTier) {
            return res.status(400).json({
                success: false,
                message: 'Invalid input parameters',
                error: {
                    code: 'INVALID_INPUT',
                    message: 'Amount and tier information are required'
                }
            });
        }

        const savings = RampService.calculatePotentialSavings(
            amount,
            currentTier,
            nextTier
        );

        return res.json({
            success: true,
            message: 'Savings calculation completed',
            data: savings
        });

    } catch (error) {
        console.error('Error calculating savings:', error);
        return handleError(error, res, 'Failed to calculate savings');
    }
}; 