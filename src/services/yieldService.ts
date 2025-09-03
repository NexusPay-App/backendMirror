import LiquidityProvider from '../models/LiquidityProvider';
import { LiquidityUsageTracker } from './liquidityUsageTracker';
import { TokenSymbol } from '../types/token';
import { logger } from '../config/logger';
import { TransactionType } from './feeService';

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

/**
 * Calculate yield for a liquidity provision
 */
export async function calculateYield(
    userId: string,
    token: TokenSymbol,
    amount: number,
    lastYieldCalculation: Date
): Promise<number> {
    try {
        // Get base yield rate for token
        const baseRate = BASE_YIELD_RATES[token] || 5; // Default to 5% if token not found

        // Calculate holding period in hours
        const holdingPeriod = (Date.now() - lastYieldCalculation.getTime()) / (1000 * 60 * 60);

        // If holding period is less than minimum, return 0
        if (holdingPeriod < MIN_HOLDING_PERIOD) {
            return 0;
        }

        // Record usage and get metrics separately
        await LiquidityUsageTracker.recordUsage(token, amount, TransactionType.SWAP);
        
        // For now, use default utilization rates until we have actual metrics
        const swapVolume = amount * 0.3; // 30% default
        const mpesaVolume = amount * 0.2; // 20% default
        const totalVolume = amount;

        // Calculate utilization rates
        const swapUtilization = (swapVolume / totalVolume) * 100;
        const mpesaUtilization = (mpesaVolume / totalVolume) * 100;

        // Calculate bonus yields
        let swapBonus = 0;
        if (swapUtilization >= UTILIZATION_BONUS.SWAP.THRESHOLD_3.rate) {
            swapBonus = UTILIZATION_BONUS.SWAP.THRESHOLD_3.bonus;
        } else if (swapUtilization >= UTILIZATION_BONUS.SWAP.THRESHOLD_2.rate) {
            swapBonus = UTILIZATION_BONUS.SWAP.THRESHOLD_2.bonus;
        } else if (swapUtilization >= UTILIZATION_BONUS.SWAP.THRESHOLD_1.rate) {
            swapBonus = UTILIZATION_BONUS.SWAP.THRESHOLD_1.bonus;
        }

        let mpesaBonus = 0;
        if (mpesaUtilization >= UTILIZATION_BONUS.MPESA.THRESHOLD_3.rate) {
            mpesaBonus = UTILIZATION_BONUS.MPESA.THRESHOLD_3.bonus;
        } else if (mpesaUtilization >= UTILIZATION_BONUS.MPESA.THRESHOLD_2.rate) {
            mpesaBonus = UTILIZATION_BONUS.MPESA.THRESHOLD_2.bonus;
        } else if (mpesaUtilization >= UTILIZATION_BONUS.MPESA.THRESHOLD_1.rate) {
            mpesaBonus = UTILIZATION_BONUS.MPESA.THRESHOLD_1.bonus;
        }

        // Calculate total yield rate
        const totalRate = baseRate + swapBonus + mpesaBonus;

        // Calculate yield for the holding period
        const annualYield = (amount * totalRate) / 100;
        const hourlyYield = annualYield / (365 * 24);
        const periodYield = hourlyYield * holdingPeriod;

        logger.info(`Yield calculation for ${token}:`, {
            userId,
            amount,
            holdingPeriod,
            baseRate,
            swapUtilization,
            mpesaUtilization,
            swapBonus,
            mpesaBonus,
            totalRate,
            periodYield
        });

        return periodYield;
    } catch (error) {
        logger.error('Error calculating yield:', error);
        throw error;
    }
}

/**
 * Update yields for all active liquidity provisions
 */
export async function updateAllYields(): Promise<void> {
    try {
        // Get all active liquidity provisions
        const provisions = await LiquidityProvider.find({ isActive: true });

        for (const provision of provisions) {
            try {
                // Calculate yield
                const yield_ = await calculateYield(
                    provision.userId.toString(),
                    provision.token,
                    provision.amount,
                    provision.lastYieldCalculation
                );

                // Update provision with new yield
                provision.yieldEarned += yield_;
                provision.lastYieldCalculation = new Date();
                await provision.save();

                logger.info(`Updated yield for provision:`, {
                    userId: provision.userId,
                    token: provision.token,
                    amount: provision.amount,
                    newYield: yield_,
                    totalYield: provision.yieldEarned
                });
            } catch (error) {
                logger.error(`Error updating yield for provision ${provision._id}:`, error);
                // Continue with next provision
                continue;
            }
        }
    } catch (error) {
        logger.error('Error updating all yields:', error);
        throw error;
    }
} 