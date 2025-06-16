import { TokenSymbol } from '../config/tokens';
import { PaymentMethod } from '../models/RampTransaction';
import { collectTransactionFee } from './platformWallet';

// Transaction types
export enum TransactionType {
    RAMP = 'RAMP',
    SWAP = 'SWAP',
    TRANSFER = 'TRANSFER',
    MERCHANT_PAYMENT = 'MERCHANT_PAYMENT',
    LIQUIDITY_PROVISION = 'LIQUIDITY_PROVISION'
}

// Fee range type
interface FeeRange {
    min: number;
    max: number;
    fee: number;
}

// Fee structure type for ramp methods
interface RampFeeStructure {
    RANGES: FeeRange[];
    MIN_FEE: number;
}

// Fee structure for different transaction types
export const FEE_STRUCTURE = {
    // Ramp fees (On/Off ramp)
    RAMP: {
        [PaymentMethod.MOBILE_MONEY]: {
            RANGES: [
                { min: 0, max: 100, fee: 1.5 },      // 1.5% for $0-$100
                { min: 100, max: 500, fee: 1.2 },    // 1.2% for $100-$500
                { min: 500, max: 2000, fee: 1.0 },   // 1.0% for $500-$2000
                { min: 2000, max: 5000, fee: 0.8 },  // 0.8% for $2000-$5000
                { min: 5000, max: Infinity, fee: 0.6 }// 0.6% for $5000+
            ],
            MIN_FEE: 0.5 // Minimum 0.5%
        },
        [PaymentMethod.MPESA]: {
            RANGES: [
                { min: 0, max: 100, fee: 1.2 },      // 1.2% for $0-$100
                { min: 100, max: 500, fee: 1.0 },    // 1.0% for $100-$500
                { min: 500, max: 2000, fee: 0.8 },   // 0.8% for $500-$2000
                { min: 2000, max: 5000, fee: 0.6 },  // 0.6% for $2000-$5000
                { min: 5000, max: Infinity, fee: 0.5 }// 0.5% for $5000+
            ],
            MIN_FEE: 0.3 // Minimum 0.3%
        },
        [PaymentMethod.BANK_TRANSFER]: {
            RANGES: [
                { min: 0, max: 100, fee: 1.0 },      // 1.0% for $0-$100
                { min: 100, max: 500, fee: 0.8 },    // 0.8% for $100-$500
                { min: 500, max: 2000, fee: 0.6 },   // 0.6% for $500-$2000
                { min: 2000, max: 5000, fee: 0.4 },  // 0.4% for $2000-$5000
                { min: 5000, max: Infinity, fee: 0.3 }// 0.3% for $5000+
            ],
            MIN_FEE: 0.2 // Minimum 0.2%
        }
    } as Record<PaymentMethod, RampFeeStructure>,

    // Swap fees (Crypto-to-crypto)
    SWAP: {
        RANGES: [
            { min: 0, max: 100, fee: 0.5 },      // 0.5% for $0-$100
            { min: 100, max: 1000, fee: 0.4 },   // 0.4% for $100-$1000
            { min: 1000, max: 5000, fee: 0.3 },  // 0.3% for $1000-$5000
            { min: 5000, max: 10000, fee: 0.2 }, // 0.2% for $5000-$10000
            { min: 10000, max: Infinity, fee: 0.15 }// 0.15% for $10000+
        ],
        MIN_FEE: 0.1 // Minimum 0.1%
    },

    // Transfer fees (Sending crypto)
    TRANSFER: {
        RANGES: [
            { min: 0, max: 100, fee: 0.2 },      // $0.20 for $0-$100
            { min: 100, max: 500, fee: 0.3 },    // $0.30 for $100-$500
            { min: 500, max: 1000, fee: 0.5 },   // $0.50 for $500-$1000
            { min: 1000, max: 5000, fee: 0.8 },  // $0.80 for $1000-$5000
            { min: 5000, max: Infinity, fee: 1.0 }// $1.00 for $5000+
        ],
        FIXED_FEE: true // Indicates fees are fixed USD amounts, not percentages
    },

    // Merchant payment fees
    MERCHANT_PAYMENT: {
        RANGES: [
            { min: 0, max: 100, fee: 0.15 },     // 0.15% for $0-$100
            { min: 100, max: 1000, fee: 0.12 },  // 0.12% for $100-$1000
            { min: 1000, max: 5000, fee: 0.1 },  // 0.10% for $1000-$5000
            { min: 5000, max: 10000, fee: 0.08 },// 0.08% for $5000-$10000
            { min: 10000, max: Infinity, fee: 0.05 }// 0.05% for $10000+
        ],
        MIN_FEE: 0.05 // Minimum 0.05%
    }
};

// Yield structure for liquidity providers
export const YIELD_STRUCTURE = {
    // Base APY rates per token
    BASE_RATES: {
        USDC: 5,  // 5% APY
        USDT: 5,  // 5% APY
        DAI: 5.5, // 5.5% APY
        WBTC: 3,  // 3% APY
        WETH: 4,  // 4% APY
        ARB: 6    // 6% APY
    },

    // Bonus based on lock duration (additional APY)
    DURATION_BONUS: [
        { hours: 36, bonus: 0.5 },   // +0.5% APY for 36h+
        { hours: 72, bonus: 1.0 },   // +1.0% APY for 72h+
        { hours: 168, bonus: 2.0 },  // +2.0% APY for 1 week+
        { hours: 720, bonus: 3.0 },  // +3.0% APY for 1 month+
        { hours: 2160, bonus: 5.0 }  // +5.0% APY for 3 months+
    ],

    // Bonus based on amount (additional APY)
    AMOUNT_BONUS: [
        { amount: 10000, bonus: 0.5 },  // +0.5% APY for $10k+
        { amount: 50000, bonus: 1.0 },  // +1.0% APY for $50k+
        { amount: 100000, bonus: 2.0 }, // +2.0% APY for $100k+
        { amount: 500000, bonus: 3.0 }  // +3.0% APY for $500k+
    ],

    // Utilization bonus (additional APY based on pool utilization)
    UTILIZATION_BONUS: [
        { rate: 50, bonus: 1.0 },  // +1.0% APY at 50% utilization
        { rate: 75, bonus: 2.0 },  // +2.0% APY at 75% utilization
        { rate: 90, bonus: 3.0 }   // +3.0% APY at 90% utilization
    ],

    MIN_LOCK_HOURS: 36 // Minimum lock duration for yield
};

export class FeeService {
    // Calculate transaction fee
    static calculateTransactionFee(
        type: TransactionType,
        amount: number,
        paymentMethod?: PaymentMethod
    ): {
        feeAmount: number;
        feePercentage?: number;
    } {
        let fee = 0;
        let feePercentage = 0;

        switch (type) {
            case TransactionType.RAMP:
                if (!paymentMethod) throw new Error('Payment method required for ramp transactions');
                const rampFeeStructure = FEE_STRUCTURE.RAMP[paymentMethod];
                if (!rampFeeStructure) throw new Error(`Unsupported payment method: ${paymentMethod}`);
                const range = rampFeeStructure.RANGES.find((r: FeeRange) => amount >= r.min && amount <= r.max);
                feePercentage = range ? range.fee : rampFeeStructure.MIN_FEE;
                fee = (amount * feePercentage) / 100;
                break;

            case TransactionType.SWAP:
                const swapRange = FEE_STRUCTURE.SWAP.RANGES.find((r: FeeRange) => amount >= r.min && amount <= r.max);
                feePercentage = swapRange ? swapRange.fee : FEE_STRUCTURE.SWAP.MIN_FEE;
                fee = (amount * feePercentage) / 100;
                break;

            case TransactionType.TRANSFER:
                const transferRange = FEE_STRUCTURE.TRANSFER.RANGES.find((r: FeeRange) => amount >= r.min && amount <= r.max);
                fee = transferRange ? transferRange.fee : FEE_STRUCTURE.TRANSFER.RANGES[0].fee;
                break;

            case TransactionType.MERCHANT_PAYMENT:
                const merchantRange = FEE_STRUCTURE.MERCHANT_PAYMENT.RANGES.find((r: FeeRange) => amount >= r.min && amount <= r.max);
                feePercentage = merchantRange ? merchantRange.fee : FEE_STRUCTURE.MERCHANT_PAYMENT.MIN_FEE;
                fee = (amount * feePercentage) / 100;
                break;
        }

        return {
            feeAmount: fee,
            feePercentage: type !== TransactionType.TRANSFER ? feePercentage : undefined
        };
    }

    // Collect fee using existing platform wallet service
    static async collectFee(
        amount: number,
        userPrivateKey: string,
        userAddress: string,
        chainName: string = 'arbitrum'
    ): Promise<{ transactionHash: string | null }> {
        try {
            return await collectTransactionFee(amount, userPrivateKey, userAddress, chainName);
        } catch (error) {
            console.error('Error collecting fee:', error);
            return { transactionHash: null };
        }
    }

    // Calculate yield for liquidity providers
    static calculateYield(
        token: string,
        amount: number,
        durationHours: number,
        utilizationRate: number
    ): {
        baseYield: number;
        durationBonus: number;
        amountBonus: number;
        utilizationBonus: number;
        totalYieldRate: number;
        yieldAmount: number;
    } {
        if (durationHours < YIELD_STRUCTURE.MIN_LOCK_HOURS) {
            return {
                baseYield: 0,
                durationBonus: 0,
                amountBonus: 0,
                utilizationBonus: 0,
                totalYieldRate: 0,
                yieldAmount: 0
            };
        }

        // Calculate base yield
        const baseYield = YIELD_STRUCTURE.BASE_RATES[token as keyof typeof YIELD_STRUCTURE.BASE_RATES] || 0;

        // Calculate duration bonus
        const durationBonus = YIELD_STRUCTURE.DURATION_BONUS
            .filter(d => durationHours >= d.hours)
            .reduce((acc, curr) => acc + curr.bonus, 0);

        // Calculate amount bonus
        const amountBonus = YIELD_STRUCTURE.AMOUNT_BONUS
            .filter(a => amount >= a.amount)
            .reduce((acc, curr) => acc + curr.bonus, 0);

        // Calculate utilization bonus
        const utilizationBonus = YIELD_STRUCTURE.UTILIZATION_BONUS
            .filter(u => utilizationRate >= u.rate)
            .reduce((acc, curr) => acc + curr.bonus, 0);

        // Calculate total yield rate
        const totalYieldRate = baseYield + durationBonus + amountBonus + utilizationBonus;

        // Calculate actual yield amount for the duration
        const yieldAmount = (amount * totalYieldRate * durationHours) / (365 * 24 * 100);

        return {
            baseYield,
            durationBonus,
            amountBonus,
            utilizationBonus,
            totalYieldRate,
            yieldAmount
        };
    }

    // Get fee tier information
    static getFeeRanges(type: TransactionType): Array<{
        min: number;
        max: number;
        fee: number;
        description: string;
    }> {
        let ranges;
        switch (type) {
            case TransactionType.RAMP:
                ranges = FEE_STRUCTURE.RAMP[PaymentMethod.MOBILE_MONEY].RANGES;
                break;
            case TransactionType.SWAP:
                ranges = FEE_STRUCTURE.SWAP.RANGES;
                break;
            case TransactionType.TRANSFER:
                ranges = FEE_STRUCTURE.TRANSFER.RANGES;
                break;
            case TransactionType.MERCHANT_PAYMENT:
                ranges = FEE_STRUCTURE.MERCHANT_PAYMENT.RANGES;
                break;
            default:
                return [];
        }

        return ranges.map(range => ({
            min: range.min,
            max: range.max,
            fee: range.fee,
            description: `${range.fee}${type === TransactionType.TRANSFER ? ' USD' : '%'} for $${range.min}-${range.max === Infinity ? '∞' : '$' + range.max}`
        }));
    }

    // Get yield tier information
    static getYieldTiers(): {
        baseTiers: Array<{ token: string; rate: number }>;
        durationTiers: Array<{ hours: number; bonus: number }>;
        amountTiers: Array<{ amount: number; bonus: number }>;
        utilizationTiers: Array<{ rate: number; bonus: number }>;
    } {
        return {
            baseTiers: Object.entries(YIELD_STRUCTURE.BASE_RATES).map(([token, rate]) => ({
                token,
                rate
            })),
            durationTiers: YIELD_STRUCTURE.DURATION_BONUS,
            amountTiers: YIELD_STRUCTURE.AMOUNT_BONUS,
            utilizationTiers: YIELD_STRUCTURE.UTILIZATION_BONUS
        };
    }
} 