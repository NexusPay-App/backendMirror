import { ethers } from 'ethers';
import { getProvider } from '../utils/provider';
import { TokenSymbol, getTokenConfig } from '../config/tokens';

interface TransactionDetails {
    transactionHash: string;
    blockNumber: number;
    blockTimestamp: Date;
    status: 'pending' | 'confirmed' | 'failed';
    from: string;
    to: string;
    value: string;
    chain: string;
}

export class TransactionVerificationService {
    static async verifyTransaction(
        txHash: string,
        chain: string,
        expectedToken: TokenSymbol,
        expectedAmount: number,
        expectedSender: string,
        expectedReceiver: string
    ): Promise<TransactionDetails> {
        try {
            const provider = getProvider(chain);
            const tokenConfig = getTokenConfig(chain as any, expectedToken);

            if (!tokenConfig) {
                throw new Error(`Token ${expectedToken} not supported on chain ${chain}`);
            }

            // Get transaction receipt
            const receipt = await provider.getTransactionReceipt(txHash);
            if (!receipt) {
                throw new Error('Transaction not found');
            }

            // Get transaction
            const tx = await provider.getTransaction(txHash);
            if (!tx) {
                throw new Error('Transaction details not found');
            }

            // Get block
            const block = await provider.getBlock(receipt.blockNumber);
            if (!block) {
                throw new Error('Block not found');
            }

            // Create token contract instance
            const tokenContract = new ethers.Contract(
                tokenConfig.address,
                ['function decimals() view returns (uint8)'],
                provider
            );

            // Get token decimals
            const decimals = await tokenContract.decimals();

            // Parse the transaction data
            const iface = new ethers.utils.Interface([
                'function transfer(address to, uint256 amount)'
            ]);

            let decodedData;
            try {
                decodedData = iface.decodeFunctionData('transfer', tx.data);
            } catch (error) {
                throw new Error('Invalid transaction data format');
            }

            // Convert amount to decimal
            const actualAmount = ethers.utils.formatUnits(decodedData.amount, decimals);

            // Verify transaction details
            if (
                tx.from.toLowerCase() !== expectedSender.toLowerCase() ||
                decodedData.to.toLowerCase() !== expectedReceiver.toLowerCase() ||
                parseFloat(actualAmount) !== expectedAmount
            ) {
                throw new Error('Transaction details do not match expected values');
            }

            return {
                transactionHash: txHash,
                blockNumber: receipt.blockNumber,
                blockTimestamp: new Date(block.timestamp * 1000),
                status: receipt.status === 1 ? 'confirmed' : 'failed',
                from: tx.from,
                to: decodedData.to,
                value: actualAmount,
                chain
            };
        } catch (error) {
            console.error('Error verifying transaction:', error);
            throw error;
        }
    }

    static async getExplorerUrl(chain: string, txHash: string): Promise<string> {
        const explorers: Record<string, string> = {
            'arbitrum': 'https://arbiscan.io/tx/',
            'polygon': 'https://polygonscan.com/tx/',
            'base': 'https://basescan.org/tx/',
            'optimism': 'https://optimistic.etherscan.io/tx/',
            'celo': 'https://explorer.celo.org/mainnet/tx/',
            'avalanche': 'https://snowtrace.io/tx/',
            'bnb': 'https://bscscan.com/tx/'
        };

        const baseUrl = explorers[chain.toLowerCase()];
        if (!baseUrl) {
            throw new Error(`Explorer not found for chain: ${chain}`);
        }

        return `${baseUrl}${txHash}`;
    }
} 