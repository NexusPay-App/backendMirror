import { ethers } from 'ethers';
import { getProvider } from '../utils/provider';
import { getTokenConfig, type TokenSymbol } from '../config/tokens';
import { chains } from '../config/chains';
import type { Chain } from '../types/token';
import { parseAmount, formatAmount } from '../utils/amounts';
export class TransactionVerificationService {
  static async verifyTransaction(txHash: string, chain: string, expectedToken: TokenSymbol, expectedAmount: number | string, expectedSender: string, expectedReceiver: string) {
    const provider = getProvider(chain);
    const token = getTokenConfig(chain as Chain, expectedToken);
    if (!token) throw new Error('Unsupported asset');
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt || receipt.status !== 1) throw new Error('Transaction has not succeeded');
    const units = parseAmount(expectedAmount, token.decimals);
    const abi = new ethers.Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
    const matching = receipt.logs.some(log => {
      if (log.address.toLowerCase() !== token.address.toLowerCase()) return false;
      try {
        const event = abi.parseLog({ topics: [...log.topics], data: log.data });
        return event?.args.from.toLowerCase() === expectedSender.toLowerCase() && event?.args.to.toLowerCase() === expectedReceiver.toLowerCase() && event?.args.value === units;
      } catch { return false; }
    });
    if (!matching) throw new Error('Receipt has no matching token transfer');
    const block = await provider.getBlock(receipt.blockNumber);
    if (!block || block.hash !== receipt.blockHash) throw new Error('Transaction block is not canonical');
    return { transactionHash: txHash, blockNumber: receipt.blockNumber, blockTimestamp: new Date(block.timestamp * 1000), status: 'confirmed' as const, from: expectedSender, to: expectedReceiver, value: formatAmount(units, token.decimals), chain };
  }
  static async getExplorerUrl(chain: string, txHash: string) {
    const network = chains[chain as Chain]; if (!network) throw new Error('Unsupported chain');
    return `${network.explorer}/tx/${txHash}`;
  }
}
