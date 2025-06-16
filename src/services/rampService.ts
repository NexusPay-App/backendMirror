import { Types } from 'mongoose';
import RampTransaction, { 
    IRampTransaction, 
    RampType, 
    RampStatus, 
    PaymentMethod 
} from '../models/RampTransaction';
import { TokenSymbol, getTokenConfig } from '../config/tokens';
import { User } from '../models/models';
import { generateReference } from '../utils/reference';

// Fee structure based on payment method and transaction volume
const FEE_STRUCTURE = {
    BASE_FEES: {
        [PaymentMethod.BANK_TRANSFER]: 1.0, // 1.0%
        [PaymentMethod.CARD]: 2.5,         // 2.5%
        [PaymentMethod.MOBILE_MONEY]: 1.5, // 1.5%
        [PaymentMethod.MPESA]: 1.2        // 1.2%
    },
    VOLUME_DISCOUNTS: [
        { threshold: 10000, discount: 0.2 },  // 0.2% discount for volumes > $10,000
        { threshold: 50000, discount: 0.5 },  // 0.5% discount for volumes > $50,000
        { threshold: 100000, discount: 0.8 }, // 0.8% discount for volumes > $100,000
    ],
    LOYALTY_DISCOUNTS: {
        TIER_1: 0.1, // 0.1% discount for regular users
        TIER_2: 0.2, // 0.2% discount for premium users
        TIER_3: 0.3  // 0.3% discount for VIP users
    }
};

export interface RampTransactionInput {
    userId: string;
    type: RampType;
    paymentMethod: PaymentMethod;
    fiatCurrency: string;
    fiatAmount: number;
    cryptoToken: TokenSymbol;
    chain?: string; // Optional chain parameter, defaults to 'arbitrum'
}

export class RampService {
    // Calculate fees for a ramp transaction
    static calculateFees(amount: number, paymentMethod: PaymentMethod, userTier: string = 'TIER_1'): {
        feePercentage: number;
        feeAmount: number;
        totalAmount: number;
    } {
        // Get base fee for payment method
        let feePercentage = FEE_STRUCTURE.BASE_FEES[paymentMethod];

        // Apply volume-based discount
        for (const { threshold, discount } of FEE_STRUCTURE.VOLUME_DISCOUNTS) {
            if (amount >= threshold) {
                feePercentage -= discount;
                break;
            }
        }

        // Apply loyalty discount
        const loyaltyDiscount = FEE_STRUCTURE.LOYALTY_DISCOUNTS[userTier as keyof typeof FEE_STRUCTURE.LOYALTY_DISCOUNTS] || 0;
        feePercentage -= loyaltyDiscount;

        // Ensure minimum fee percentage
        feePercentage = Math.max(feePercentage, 0.5); // Minimum 0.5% fee

        const feeAmount = (amount * feePercentage) / 100;
        const totalAmount = amount + feeAmount;

        return {
            feePercentage,
            feeAmount,
            totalAmount
        };
    }

    // Create a new ramp transaction
    static async createTransaction(input: RampTransactionInput): Promise<IRampTransaction> {
        const user = await User.findById(input.userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Default to arbitrum if no chain specified
        const chain = input.chain || 'arbitrum';
        
        // Validate token on the specified chain
        const tokenConfig = getTokenConfig(chain as any, input.cryptoToken);
        if (!tokenConfig) {
            // If token not found on specified chain, try other supported chains
            const supportedChains = ['arbitrum', 'polygon', 'base', 'optimism', 'celo', 'avalanche', 'bnb'];
            let foundChain = null;
            
            for (const supportedChain of supportedChains) {
                const config = getTokenConfig(supportedChain as any, input.cryptoToken);
                if (config) {
                    foundChain = supportedChain;
                    break;
                }
            }
            
            if (!foundChain) {
                throw new Error(`Token ${input.cryptoToken} is not supported on any available chains`);
            }
            
            // Use the found chain instead
            console.log(`Token ${input.cryptoToken} not found on ${chain}, using ${foundChain} instead`);
        }

        // Calculate fees
        const { feePercentage, feeAmount, totalAmount } = this.calculateFees(
            input.fiatAmount,
            input.paymentMethod,
            user.tier
        );

        // Calculate crypto amount (implement price feed integration here)
        const cryptoAmount = input.fiatAmount; // Placeholder: implement actual conversion

        // Create transaction
        const transaction = new RampTransaction({
            userId: new Types.ObjectId(input.userId),
            type: input.type,
            status: RampStatus.PENDING,
            paymentMethod: input.paymentMethod,
            fiatCurrency: input.fiatCurrency,
            fiatAmount: input.fiatAmount,
            cryptoToken: input.cryptoToken,
            cryptoAmount,
            feePercentage,
            feeAmount,
            totalAmount,
            paymentReference: generateReference()
        });

        await transaction.save();
        return transaction;
    }

    // Process a ramp transaction
    static async processTransaction(transactionId: string): Promise<IRampTransaction> {
        const transaction = await RampTransaction.findById(transactionId);
        if (!transaction) {
            throw new Error('Transaction not found');
        }

        // Update status to processing
        transaction.status = RampStatus.PROCESSING;
        await transaction.save();

        try {
            // Implement actual processing logic here
            // For on-ramp: process fiat payment and transfer crypto
            // For off-ramp: process crypto transfer and initiate fiat payment

            const startTime = Date.now();

            // Simulate processing
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Update transaction status and processing time
            transaction.status = RampStatus.COMPLETED;
            transaction.processingTime = (Date.now() - startTime) / 60000; // Convert to minutes
            await transaction.save();

            return transaction;
        } catch (error) {
            transaction.status = RampStatus.FAILED;
            await transaction.save();
            throw error;
        }
    }

    // Get user's ramp transactions
    static async getUserTransactions(
        userId: string,
        type?: RampType,
        status?: RampStatus
    ): Promise<IRampTransaction[]> {
        const query: any = { userId: new Types.ObjectId(userId) };
        if (type) query.type = type;
        if (status) query.status = status;

        return RampTransaction.find(query).sort({ createdAt: -1 });
    }

    // Get transaction statistics
    static async getTransactionStats(userId: string): Promise<{
        totalVolume: number;
        totalFees: number;
        averageProcessingTime: number;
        transactionCount: number;
    }> {
        const stats = await RampTransaction.aggregate([
            { $match: { userId: new Types.ObjectId(userId) } },
            {
                $group: {
                    _id: null,
                    totalVolume: { $sum: '$fiatAmount' },
                    totalFees: { $sum: '$feeAmount' },
                    avgProcessingTime: { $avg: '$processingTime' },
                    count: { $sum: 1 }
                }
            }
        ]);

        return {
            totalVolume: stats[0]?.totalVolume || 0,
            totalFees: stats[0]?.totalFees || 0,
            averageProcessingTime: stats[0]?.avgProcessingTime || 0,
            transactionCount: stats[0]?.count || 0
        };
    }

    // Calculate potential savings
    static calculatePotentialSavings(
        amount: number,
        currentTier: string,
        nextTier: string
    ): {
        currentFees: number;
        potentialFees: number;
        savings: number;
    } {
        const currentFees = this.calculateFees(amount, PaymentMethod.BANK_TRANSFER, currentTier);
        const potentialFees = this.calculateFees(amount, PaymentMethod.BANK_TRANSFER, nextTier);

        return {
            currentFees: currentFees.feeAmount,
            potentialFees: potentialFees.feeAmount,
            savings: currentFees.feeAmount - potentialFees.feeAmount
        };
    }
} 