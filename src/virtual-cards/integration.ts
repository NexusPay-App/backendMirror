import { VirtualCardService } from './service';
import { getPlatformWalletBalance, sendFromPlatformWallet } from '../services/platformWallet';
import { getTokenConfig } from '../config/tokens';
import { Chain, TokenSymbol } from '../types/token';
import pino from 'pino';

const logger = pino({ level: 'info' });

export class VirtualCardIntegration {
  // Fund virtual card from user's crypto wallet
  static async fundCardFromWallet(
    cardId: string, 
    amount: number, 
    tokenSymbol: string = 'USDC',
    chain: string = 'arbitrum'
  ): Promise<boolean> {
    try {
      const card = await VirtualCardService.getCard(cardId);
      if (!card) {
        logger.error(`Card not found: ${cardId}`);
        return false;
      }

      // Get token config
      const tokenConfig = getTokenConfig(chain as Chain, tokenSymbol as TokenSymbol);
      if (!tokenConfig) {
        logger.error(`Token config not found: ${tokenSymbol} on ${chain}`);
        return false;
      }

      // Check platform wallet balance
      const balance = await getPlatformWalletBalance(chain as Chain, tokenSymbol as TokenSymbol);
      if (balance < amount) {
        logger.error(`Insufficient platform balance: ${balance} < ${amount}`);
        return false;
      }

      // Transfer tokens from platform wallet to user wallet (for card funding)
      const transferResult = await sendFromPlatformWallet(
        amount,
        card.walletAddress,
        process.env.PLATFORM_WALLET_PRIMARY_KEY || '',
        process.env.PLATFORM_WALLET_SECONDARY_KEY || '',
        chain as Chain,
        tokenSymbol as TokenSymbol
      );

      if (!transferResult.transactionHash) {
        logger.error(`Transfer failed: No transaction hash returned`);
        return false;
      }

      // Fund the virtual card
      const fundResult = await VirtualCardService.fundCard({
        cardId,
        amount,
        currency: 'USD', // Convert crypto to USD for card
        source: 'WALLET'
      });

      logger.info(`Card ${cardId} funded with ${amount} ${tokenSymbol} from wallet`);
      return fundResult;
    } catch (error) {
      logger.error(`Error funding card from wallet: ${error}`);
      return false;
    }
  }

  // Withdraw from virtual card to user's crypto wallet
  static async withdrawToWallet(
    cardId: string,
    amount: number,
    tokenSymbol: string = 'USDC',
    chain: string = 'arbitrum'
  ): Promise<boolean> {
    try {
      const card = await VirtualCardService.getCard(cardId);
      if (!card) {
        logger.error(`Card not found: ${cardId}`);
        return false;
      }

      if (card.balance < amount) {
        logger.error(`Insufficient card balance: ${card.balance} < ${amount}`);
        return false;
      }

      // Transfer from platform wallet to user wallet
      const transferResult = await sendFromPlatformWallet(
        amount,
        card.walletAddress,
        process.env.PLATFORM_WALLET_PRIMARY_KEY || '',
        process.env.PLATFORM_WALLET_SECONDARY_KEY || '',
        chain as Chain,
        tokenSymbol as TokenSymbol
      );

      if (!transferResult.transactionHash) {
        logger.error(`Transfer failed: No transaction hash returned`);
        return false;
      }

      // Deduct from card balance
      const fundResult = await VirtualCardService.fundCard({
        cardId,
        amount: -amount, // Negative amount to deduct
        currency: 'USD',
        source: 'WALLET'
      });

      logger.info(`Card ${cardId} withdrawn ${amount} to wallet`);
      return fundResult;
    } catch (error) {
      logger.error(`Error withdrawing to wallet: ${error}`);
      return false;
    }
  }

  // Sync card balance with wallet balance
  static async syncBalance(cardId: string): Promise<boolean> {
    try {
      const card = await VirtualCardService.getCard(cardId);
      if (!card) return false;

      // Get platform wallet balance in USD equivalent
      const walletBalance = await getPlatformWalletBalance('arbitrum' as Chain, 'USDC' as TokenSymbol);
      
      // Update card balance to match wallet
      await VirtualCardService.fundCard({
        cardId,
        amount: walletBalance - card.balance,
        currency: 'USD',
        source: 'WALLET'
      });

      logger.info(`Card ${cardId} balance synced with wallet`);
      return true;
    } catch (error) {
      logger.error(`Error syncing balance: ${error}`);
      return false;
    }
  }
}
