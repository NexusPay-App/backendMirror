import { Types } from 'mongoose';
import LiquidityProvider, { ILiquidityProvision } from '../models/LiquidityProvider';
import { Chain, TokenSymbol } from '../types/token';
import { getTokenConfig } from '../config/tokens';
import { ethers } from 'ethers';
import { User } from '../models/models';
import { sendTokenFromUser, initializePlatformWallets, SUPPORTED_CHAINS, sendFromPlatformWallet } from './platformWallet';
import { getProvider } from '../utils/provider';
import { TransactionVerificationService } from './transactionVerification';
import { verifyOtp } from './otpService';
import { LiquidityUsageTracker } from './liquidityUsageTracker';

// Base yield rate per token (annual percentage)
const BASE_YIELD_RATES: Record<TokenSymbol, number> = {
    USDC: 5, // 5% APY
    USDT: 5,
    DAI: 5.5,
    WBTC: 3,
    WETH: 4,
    ARB: 6,
    MATIC: 4,
    BNB: 5,
    TRX: 3,
    SOL: 6,
    OP: 5,
    cUSD: 5
};

// Bonus yield based on utilization (additional percentage)
const UTILIZATION_BONUS = {
    SWAP: { // Bonus for swap utilization
        THRESHOLD_1: { rate: 30, bonus: 1 }, // 30% utilization = +1% APY
        THRESHOLD_2: { rate: 50, bonus: 2 }, // 50% utilization = +2% APY
        THRESHOLD_3: { rate: 70, bonus: 3 }  // 70% utilization = +3% APY
    },
    MPESA: { // Bonus for M-Pesa service utilization
        THRESHOLD_1: { rate: 20, bonus: 1 }, // 20% utilization = +1% APY
        THRESHOLD_2: { rate: 40, bonus: 2 }, // 40% utilization = +2% APY
        THRESHOLD_3: { rate: 60, bonus: 3 }  // 60% utilization = +3% APY
    }
};

// Minimum holding period in hours
const MIN_HOLDING_PERIOD = 36;

export interface LiquidityStats {
    totalLiquidity: number;
    utilizationRate: number;
    currentYieldRate: number;
    totalYieldEarned: number;
}

export class LiquidityService {
    // Provide liquidity with real blockchain transactions
    static async provideLiquidity(
        userId: string,
        walletAddress: string,
        token: TokenSymbol,
        amount: number,
        chain: string = 'arbitrum'
    ): Promise<any> {
        // Validate token is supported on the specified chain
        let tokenConfig = getTokenConfig(chain as Chain, token);
        let actualChain = chain as Chain;
        
        if (!tokenConfig) {
            // If token not found on specified chain, try other supported chains
            const supportedChains: Chain[] = ['arbitrum', 'polygon', 'base', 'optimism', 'celo', 'avalanche', 'bnb'];
            let foundChain: Chain | null = null;
            
            for (const supportedChain of supportedChains) {
                const config = getTokenConfig(supportedChain, token);
                if (config) {
                    foundChain = supportedChain;
                    tokenConfig = config;
                    break;
                }
            }
            
            if (!foundChain) {
                throw new Error(`Token ${token} is not supported on any available chains`);
            }
            
            actualChain = foundChain;
            console.log(`Token ${token} not found on ${chain}, using ${foundChain} instead`);
        }

        // Check if user exists
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Get platform wallet configuration
        const platformWallets = await initializePlatformWallets();
        if (!platformWallets.main.address) {
            throw new Error('Platform wallet not properly configured');
        }

        // Transfer tokens from user to platform wallet
        const tokenTransferResult = await sendTokenFromUser(
            platformWallets.main.address,
            amount,
            user.privateKey,
            actualChain,
            token
        );

        if (!tokenTransferResult || !tokenTransferResult.transactionHash) {
            throw new Error('Failed to transfer tokens to platform wallet');
        }

        // Create or update liquidity provision
        const existingProvision = await LiquidityProvider.findOne({
            userId,
            token,
            isActive: true
        });

        // Get transaction details from blockchain
        const provider = getProvider(actualChain);
        const txReceipt = await provider.getTransactionReceipt(tokenTransferResult.transactionHash);

        const provisionData = {
            userId: new Types.ObjectId(userId),
            walletAddress,
            token,
            utilizationRate: await this.calculateUtilizationRate(token),
            transactionHash: tokenTransferResult.transactionHash,
            chain: actualChain,
            blockNumber: txReceipt.blockNumber,
            blockTimestamp: new Date(),
            transactionStatus: 'confirmed' as const
        };

        if (existingProvision) {
            // Update existing provision
            Object.assign(existingProvision, {
                ...provisionData,
                amount: existingProvision.amount + amount
            });
            await existingProvision.save();
            
            return {
                ...existingProvision.toJSON(),
                message: `Successfully added ${amount} ${token} to existing position`,
                totalAmount: existingProvision.amount,
                transactionHash: tokenTransferResult.transactionHash,
                explorerUrl: tokenTransferResult.transactionHash ? `${SUPPORTED_CHAINS[actualChain].blockExplorers.default.url}/tx/${tokenTransferResult.transactionHash}` : ''
            };
        }

        // Create new provision
        const provision = new LiquidityProvider({
            ...provisionData,
            amount
        });
        await provision.save();
        
        return {
            ...provision.toJSON(),
            message: `Successfully provided ${amount} ${token} liquidity`,
            transactionHash: tokenTransferResult.transactionHash,
            explorerUrl: tokenTransferResult.transactionHash ? `${SUPPORTED_CHAINS[actualChain].blockExplorers.default.url}/tx/${tokenTransferResult.transactionHash}` : ''
        };
    }

    // Calculate and update yields for a specific provision
    static async calculateYield(provision: ILiquidityProvision): Promise<number> {
        const now = new Date();
        const timeDiff = now.getTime() - provision.lastYieldCalculation.getTime();
        const daysElapsed = timeDiff / (1000 * 60 * 60 * 24);
        const hoursElapsed = timeDiff / (1000 * 60 * 60);

        // Check minimum holding period
        const holdingPeriod = (now.getTime() - provision.createdAt.getTime()) / (1000 * 60 * 60);
        if (holdingPeriod < MIN_HOLDING_PERIOD) {
            return 0;
        }

        // Get base yield rate
        let yieldRate = BASE_YIELD_RATES[provision.token];

        // Get utilization rates from the tracker
        const { swapRate, mpesaRate } = await LiquidityUsageTracker.getUtilizationRate(
            provision.token,
            provision.amount
        );

        // Add swap utilization bonus
        if (swapRate >= UTILIZATION_BONUS.SWAP.THRESHOLD_3.rate) {
            yieldRate += UTILIZATION_BONUS.SWAP.THRESHOLD_3.bonus;
        } else if (swapRate >= UTILIZATION_BONUS.SWAP.THRESHOLD_2.rate) {
            yieldRate += UTILIZATION_BONUS.SWAP.THRESHOLD_2.bonus;
        } else if (swapRate >= UTILIZATION_BONUS.SWAP.THRESHOLD_1.rate) {
            yieldRate += UTILIZATION_BONUS.SWAP.THRESHOLD_1.bonus;
        }

        // Add M-Pesa utilization bonus
        if (mpesaRate >= UTILIZATION_BONUS.MPESA.THRESHOLD_3.rate) {
            yieldRate += UTILIZATION_BONUS.MPESA.THRESHOLD_3.bonus;
        } else if (mpesaRate >= UTILIZATION_BONUS.MPESA.THRESHOLD_2.rate) {
            yieldRate += UTILIZATION_BONUS.MPESA.THRESHOLD_2.bonus;
        } else if (mpesaRate >= UTILIZATION_BONUS.MPESA.THRESHOLD_1.rate) {
            yieldRate += UTILIZATION_BONUS.MPESA.THRESHOLD_1.bonus;
        }

        // Calculate yield: principal * rate * time
        const yieldAmount = (provision.amount * yieldRate * daysElapsed) / 365;

        // Update provision
        provision.yieldEarned += yieldAmount;
        provision.lastYieldCalculation = now;
        await provision.save();

        return yieldAmount;
    }

    // Calculate utilization rate for a token
    static async calculateUtilizationRate(token: TokenSymbol): Promise<number> {
        const totalLiquidity = await LiquidityProvider.aggregate([
            {
                $match: {
                    token,
                    isActive: true
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: "$amount" }
                }
            }
        ]);

        const liquidityAmount = totalLiquidity[0]?.total || 0;
        if (liquidityAmount === 0) return 0;

        // Get utilization rates from the tracker
        const { totalRate } = await LiquidityUsageTracker.getUtilizationRate(token, liquidityAmount);
        return totalRate;
    }

    // Get liquidity stats for a token
    static async getLiquidityStats(token: TokenSymbol): Promise<LiquidityStats> {
        const [totalLiquidity] = await LiquidityProvider.aggregate([
            {
                $match: {
                    token,
                    isActive: true
                }
            },
            {
                $group: {
                    _id: null,
                    totalLiquidity: { $sum: "$amount" },
                    totalYieldEarned: { $sum: "$yieldEarned" }
                }
            }
        ]);

        const utilizationRate = await this.calculateUtilizationRate(token);
        const baseRate = BASE_YIELD_RATES[token];
        let currentYieldRate = baseRate;

        // Add utilization bonus to yield rate
        if (utilizationRate >= UTILIZATION_BONUS.SWAP.THRESHOLD_3.rate) {
            currentYieldRate += UTILIZATION_BONUS.SWAP.THRESHOLD_3.bonus;
        } else if (utilizationRate >= UTILIZATION_BONUS.SWAP.THRESHOLD_2.rate) {
            currentYieldRate += UTILIZATION_BONUS.SWAP.THRESHOLD_2.bonus;
        } else if (utilizationRate >= UTILIZATION_BONUS.SWAP.THRESHOLD_1.rate) {
            currentYieldRate += UTILIZATION_BONUS.SWAP.THRESHOLD_1.bonus;
        }

        return {
            totalLiquidity: totalLiquidity?.totalLiquidity || 0,
            utilizationRate,
            currentYieldRate,
            totalYieldEarned: totalLiquidity?.totalYieldEarned || 0
        };
    }

    // Withdraw liquidity
    static async withdrawLiquidity(
        userId: string,
        token: TokenSymbol,
        amount: number,
        otp: string,
        chain: string = 'arbitrum'
    ): Promise<any> {
        // Verify OTP first
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Verify OTP using in-memory store
        const { otpStore } = require('../services/auth');
        if (!otpStore[user.phoneNumber] || otpStore[user.phoneNumber] !== otp) {
            throw new Error('Invalid OTP. Please try again.');
        }
        // Clear OTP after successful verification
        delete otpStore[user.phoneNumber];

        const provision = await LiquidityProvider.findOne({
            userId,
            token,
            isActive: true
        });

        if (!provision) {
            throw new Error('No active liquidity provision found');
        }

        if (provision.amount < amount) {
            throw new Error('Insufficient liquidity balance');
        }

        // Calculate final yield before withdrawal
        const finalYield = await this.calculateYield(provision);
        const totalAmount = amount + finalYield;

        // Get platform wallet configuration
        const platformWallets = await initializePlatformWallets();
        if (!platformWallets.main.address) {
            throw new Error('Platform wallet not properly configured: missing main wallet');
        }

        // Get the platform wallet keys from environment variables
        const primaryKey = process.env.PLATFORM_WALLET_PRIMARY_KEY;
        const secondaryKey = process.env.PLATFORM_WALLET_SECONDARY_KEY;

        if (!primaryKey || !secondaryKey) {
            throw new Error('Platform wallet keys not properly configured');
        }

        // Transfer tokens from platform wallet to user
        const tokenTransferResult = await sendFromPlatformWallet(
            totalAmount,
            user.walletAddress,
            primaryKey,
            secondaryKey,
            chain as Chain,
            token
        );

        if (!tokenTransferResult || !tokenTransferResult.transactionHash) {
            throw new Error('Failed to transfer tokens from platform wallet');
        }

        // Get transaction details from blockchain
        const provider = getProvider(chain as Chain);
        const txReceipt = await provider.getTransactionReceipt(tokenTransferResult.transactionHash);

        // Update provision
        provision.amount -= amount;
        if (provision.amount === 0) {
            provision.isActive = false;
        }
        await provision.save();

        // Return withdrawal details
        return {
            success: true,
            message: 'Withdrawal successful',
            data: {
                withdrawnAmount: amount,
                yieldEarned: finalYield,
                totalWithdrawn: totalAmount,
                remainingBalance: provision.amount,
                token,
                chain,
                transactionHash: tokenTransferResult.transactionHash || '',
                explorerUrl: tokenTransferResult.transactionHash ? `${SUPPORTED_CHAINS[chain as Chain].blockExplorers.default.url}/tx/${tokenTransferResult.transactionHash}` : ''
            }
        };
    }

    // Get user's liquidity positions
    static async getUserPositions(userId: string): Promise<ILiquidityProvision[]> {
        try {
            const positions = await LiquidityProvider.find({
                userId,
                isActive: true
            });

            // For backward compatibility: Add missing transaction details for old positions
            for (const position of positions) {
                if (!position.transactionHash) {
                    // Generate a deterministic mock transaction hash for existing positions
                    const mockTxHash = `0x${Buffer.from(`${position._id}-${position.createdAt.getTime()}`).toString('hex').slice(0, 64)}`;
                    
                    position.transactionHash = mockTxHash;
                    position.chain = 'arbitrum'; // Default chain
                    position.blockNumber = Math.floor(position.createdAt.getTime() / 1000 / 15); // Approximate block number
                    position.blockTimestamp = position.createdAt;
                    position.transactionStatus = 'confirmed';
                    
                    await position.save();
                }
            }

            return positions;
        } catch (error) {
            console.error('Error getting user positions:', error);
            throw error;
        }
    }

    // Update utilization rates for all active provisions
    static async updateUtilizationRates(): Promise<void> {
        const tokens = ['USDC', 'USDT', 'DAI', 'WBTC', 'WETH', 'ARB'] as TokenSymbol[];

        for (const token of tokens) {
            const utilizationRate = await this.calculateUtilizationRate(token);
            await LiquidityProvider.updateMany(
                { token, isActive: true },
                { utilizationRate }
            );
        }
    }

    // Delete liquidity position
    static async deletePosition(userId: string, positionId: string): Promise<void> {
        try {
            const position = await LiquidityProvider.findOne({
                _id: positionId,
                userId
            });

            if (!position) {
                throw new Error('Position not found');
            }

            await LiquidityProvider.deleteOne({ _id: positionId });
            console.log(`✅ Deleted position ${positionId} for user ${userId}`);
        } catch (error) {
            console.error('Error deleting position:', error);
            throw error;
        }
    }
} 