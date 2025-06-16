import { TokenSymbol } from '../types/token';
import { Chain } from '../types/token';
import { TransactionType } from './feeService';
import { LiquidityUsageTracker } from './liquidityUsageTracker';
import { getConversionRateWithCaching } from './rates';
import { FeeService } from './feeService';
import { sendFromPlatformWallet, initializePlatformWallets } from './platformWallet';
import { getProvider } from '../utils/provider';
import { User } from '../models/models';
import { logger } from '../config/logger';

export class SwapService {
    /**
     * Get the swap rate between two tokens
     */
    static async getSwapRate(
        fromToken: TokenSymbol,
        toToken: TokenSymbol,
        amount: number
    ): Promise<number> {
        // Get conversion rates for both tokens
        const fromRate = await getConversionRateWithCaching(fromToken);
        const toRate = await getConversionRateWithCaching(toToken);
        
        // Calculate equivalent amount
        return (amount * fromRate) / toRate;
    }

    /**
     * Execute a swap between two tokens
     */
    static async executeSwap(
        userId: string,
        fromToken: TokenSymbol,
        toToken: TokenSymbol,
        amount: number,
        chain: Chain
    ): Promise<any> {
        try {
            // Get user
            const user = await User.findById(userId);
            if (!user) {
                throw new Error('User not found');
            }

            // Calculate swap amount
            const toAmount = await this.getSwapRate(fromToken, toToken, amount);

            // Calculate fees
            const { feeAmount } = FeeService.calculateTransactionFee(
                TransactionType.SWAP,
                amount
            );

            // Initialize platform wallets
            const platformWallets = await initializePlatformWallets();
            if (!platformWallets.main.address) {
                throw new Error('Platform wallet not properly configured');
            }

            // Get wallet keys
            const primaryKey = process.env.PLATFORM_WALLET_PRIMARY_KEY;
            const secondaryKey = process.env.PLATFORM_WALLET_SECONDARY_KEY;

            if (!primaryKey || !secondaryKey) {
                throw new Error('Platform wallet keys not properly configured');
            }

            // Execute the swap
            // 1. Transfer fromToken from user to platform
            const userTransferResult = await sendFromPlatformWallet(
                amount,
                platformWallets.main.address,
                primaryKey,
                secondaryKey,
                chain,
                fromToken
            );

            if (!userTransferResult?.transactionHash) {
                throw new Error('Failed to transfer tokens from user');
            }

            // 2. Transfer toToken from platform to user
            const platformTransferResult = await sendFromPlatformWallet(
                toAmount - feeAmount,
                user.walletAddress,
                primaryKey,
                secondaryKey,
                chain,
                toToken
            );

            if (!platformTransferResult?.transactionHash) {
                throw new Error('Failed to transfer tokens to user');
            }

            // Record liquidity usage for both tokens
            await LiquidityUsageTracker.recordUsage(fromToken, amount, TransactionType.SWAP);
            await LiquidityUsageTracker.recordUsage(toToken, toAmount, TransactionType.SWAP);

            // Get transaction details
            const provider = getProvider(chain);
            const [fromTx, toTx] = await Promise.all([
                provider.getTransactionReceipt(userTransferResult.transactionHash),
                provider.getTransactionReceipt(platformTransferResult.transactionHash)
            ]);

            return {
                success: true,
                fromAmount: amount,
                toAmount: toAmount - feeAmount,
                fee: feeAmount,
                fromToken,
                toToken,
                chain,
                transactions: {
                    fromTokenTx: userTransferResult.transactionHash,
                    toTokenTx: platformTransferResult.transactionHash
                },
                blockNumbers: {
                    fromTokenBlock: fromTx.blockNumber,
                    toTokenBlock: toTx.blockNumber
                }
            };
        } catch (error) {
            logger.error('Error executing swap:', error);
            throw error;
        }
    }
} 