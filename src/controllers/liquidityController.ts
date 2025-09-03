import { Request, Response } from 'express';
import { LiquidityService } from '../services/liquidityService';
import { handleError } from '../services/utils';
import { TokenSymbol } from '../config/tokens';
import { generateOTP, otpStore } from '../services/auth';
import LiquidityProvider from '../models/LiquidityProvider';
import { SMSService } from '../services/smsService';

// List of supported chains
const SUPPORTED_CHAINS = [
    'arbitrum',
    'celo',
    'optimism',
    'polygon',
    'base',
    'avalanche',
    'bnb',
    'scroll',
    'gnosis',
    'fantom',
    'somnia',
    'moonbeam',
    'fuse',
    'aurora',
    'lisk'
] as const;

type SupportedChain = typeof SUPPORTED_CHAINS[number];

// Provide liquidity
export const provideLiquidity = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { token, amount, chain } = req.body;
        const userId = req.user._id;
        const walletAddress = req.user.walletAddress;

        if (!token || !amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid input parameters',
                error: { code: 'INVALID_INPUT', message: 'Token and amount are required' }
            });
        }

        // Validate chain
        if (chain && !SUPPORTED_CHAINS.includes(chain)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid chain',
                error: { 
                    code: 'INVALID_CHAIN', 
                    message: `Chain must be one of: ${SUPPORTED_CHAINS.join(', ')}` 
                }
            });
        }

        const provision = await LiquidityService.provideLiquidity(
            userId,
            walletAddress,
            token as TokenSymbol,
            amount,
            (chain || 'arbitrum') as SupportedChain
        );

        return res.json({
            success: true,
            message: 'Liquidity provided successfully',
            data: provision
        });

    } catch (error) {
        console.error('Error in liquidity provision:', error);
        return handleError(error, res, 'Failed to provide liquidity');
    }
};

// Get liquidity positions
export const getLiquidityPositions = async (req: Request, res: Response): Promise<Response> => {
    try {
        const userId = req.user._id;
        const positions = await LiquidityService.getUserPositions(userId);

        // Calculate current yields for all positions
        const positionsWithYields = await Promise.all(
            positions.map(async (position) => {
                const currentYield = await LiquidityService.calculateYield(position);
                return {
                    ...position.toObject(),
                    currentYield
                };
            })
        );

        return res.json({
            success: true,
            message: 'Liquidity positions retrieved successfully',
            data: positionsWithYields
        });

    } catch (error) {
        console.error('Error getting liquidity positions:', error);
        return handleError(error, res, 'Failed to get liquidity positions');
    }
};

// Get liquidity stats for a token
export const getLiquidityStats = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { token } = req.params;

        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'Token parameter is required',
                error: { code: 'INVALID_INPUT', message: 'Token parameter is missing' }
            });
        }

        const stats = await LiquidityService.getLiquidityStats(token as TokenSymbol);

        return res.json({
            success: true,
            message: 'Liquidity stats retrieved successfully',
            data: stats
        });

    } catch (error) {
        console.error('Error getting liquidity stats:', error);
        return handleError(error, res, 'Failed to get liquidity stats');
    }
};

// Withdraw liquidity
export const withdrawLiquidity = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { token, amount, otp, chain } = req.body;
        const userId = req.user._id;

        if (!token || !amount || amount <= 0 || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Invalid input parameters',
                error: { 
                    code: 'INVALID_INPUT', 
                    message: 'Token, amount, and OTP are required' 
                }
            });
        }

        // Validate chain
        if (chain && !SUPPORTED_CHAINS.includes(chain)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid chain',
                error: { 
                    code: 'INVALID_CHAIN', 
                    message: `Chain must be one of: ${SUPPORTED_CHAINS.join(', ')}` 
                }
            });
        }

        const result = await LiquidityService.withdrawLiquidity(
            userId,
            token as TokenSymbol,
            amount,
            otp,
            (chain || 'arbitrum') as SupportedChain
        );

        return res.json(result);

    } catch (error) {
        console.error('Error in liquidity withdrawal:', error);
        return handleError(error, res, 'Failed to withdraw liquidity');
    }
};

// Delete liquidity position
export const deletePosition = async (req: Request, res: Response): Promise<Response> => {
    try {
        const userId = req.user._id;
        const { positionId } = req.params;

        if (!positionId) {
            return res.status(400).json({
                success: false,
                message: 'Position ID is required',
                error: { code: 'MISSING_POSITION_ID', message: 'Position ID is required' }
            });
        }

        await LiquidityService.deletePosition(userId, positionId);

        return res.json({
            success: true,
            message: 'Position deleted successfully'
        });

    } catch (error) {
        console.error('Error in position deletion:', error);
        return handleError(error, res, 'Failed to delete position');
    }
};

// Initiate withdrawal
export const initiateWithdrawal = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { token, amount, chain } = req.body;
        const userId = req.user._id;
        const phoneNumber = req.user.phoneNumber;

        if (!token || !amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid input parameters',
                error: { 
                    code: 'INVALID_INPUT', 
                    message: 'Token and amount are required' 
                }
            });
        }

        // Validate chain
        if (chain && !SUPPORTED_CHAINS.includes(chain)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid chain',
                error: { 
                    code: 'INVALID_CHAIN', 
                    message: `Chain must be one of: ${SUPPORTED_CHAINS.join(', ')}` 
                }
            });
        }

        // Check if user has sufficient balance
        const provision = await LiquidityProvider.findOne({
            userId,
            token,
            isActive: true
        });

        if (!provision) {
            return res.status(404).json({
                success: false,
                message: 'No active liquidity provision found',
                error: { 
                    code: 'NO_LIQUIDITY', 
                    message: 'No active liquidity provision found for this token' 
                }
            });
        }

        if (provision.amount < amount) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient balance',
                error: { 
                    code: 'INSUFFICIENT_BALANCE', 
                    message: `Available balance: ${provision.amount} ${token}` 
                }
            });
        }

        // Generate and send OTP
        const otp = generateOTP();
        otpStore[phoneNumber] = otp;
        
        // Log OTP for testing purposes
        console.log('\n======================================');
        console.log(`🔑 WITHDRAWAL OTP FOR ${phoneNumber}: ${otp}`);
        console.log('======================================\n');
        
        try {
            // Send OTP via SMS using the new SMS service
            const smsSent = await SMSService.sendOTP(phoneNumber, otp, 'withdrawal');
            
            if (!smsSent) {
                console.log(`❌ SMS sending failed but withdrawal OTP was generated: ${otp}`);
                return res.json({
                    success: false,
                    message: "Failed to send OTP via SMS, but check server logs for OTP code",
                    data: { phoneNumber }
                });
            }
            
            return res.json({
                success: true,
                message: "Please verify your withdrawal with the code sent to your phone number.",
                data: {
                    phoneNumber,
                    token,
                    amount,
                    chain: chain || 'arbitrum'
                }
            });
        } catch (error) {
            console.error("❌ Error sending SMS OTP:", error);
            console.log(`❌ SMS sending error but withdrawal OTP was generated: ${otp}`);
            return handleError(error, res, "Failed to send withdrawal verification code. Please check server logs for OTP.");
        }

    } catch (error) {
        console.error('Error initiating withdrawal:', error);
        return handleError(error, res, 'Failed to initiate withdrawal');
    }
}; 