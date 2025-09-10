import { VirtualCardModel, CardTransactionModel } from './models';
import { CreateCardRequest, UpdateCardRequest, FundCardRequest, VirtualCard, CardTransaction } from './types';
import { CircleService } from './circleService';
import { generateUUID } from '../utils';
import pino from 'pino';

const logger = pino({ level: 'info' });
const circleService = new CircleService();

export class VirtualCardService {
  // Create new virtual card
  static async createCard(data: CreateCardRequest): Promise<VirtualCard> {
    try {
      // Create card with Circle
      const circleResult = await circleService.createVirtualCard({
        userId: data.userId,
        walletAddress: data.walletAddress,
        spendingLimits: {
          daily: data.spendingLimits?.daily || 1000,
          monthly: data.spendingLimits?.monthly || 10000,
          perTransaction: data.spendingLimits?.perTransaction || 500
        },
        currency: data.currency || 'USD'
      });

      if (!circleResult.success) {
        throw new Error(`Circle card creation failed: ${circleResult.error}`);
      }

      // Save to our database
      const card = new VirtualCardModel({
        id: circleResult.card.id,
        userId: data.userId,
        walletAddress: data.walletAddress,
        cardNumber: circleResult.card.cardNumber,
        expiryDate: circleResult.card.expiryDate,
        cvv: circleResult.card.cvv,
        status: circleResult.card.status || 'PENDING',
        spendingLimits: {
          daily: data.spendingLimits?.daily || 1000,
          monthly: data.spendingLimits?.monthly || 10000,
          perTransaction: data.spendingLimits?.perTransaction || 500
        },
        currency: data.currency || 'USD'
      });

      await card.save();
      logger.info(`Virtual card created with Circle: ${circleResult.card.id} for user: ${data.userId}`);
      return card.toObject();
    } catch (error) {
      logger.error(`Error creating virtual card: ${error}`);
      throw error;
    }
  }

  // Get card by ID
  static async getCard(cardId: string): Promise<VirtualCard | null> {
    const card = await VirtualCardModel.findOne({ id: cardId });
    return card?.toObject() || null;
  }

  // Get user's cards
  static async getUserCards(userId: string): Promise<VirtualCard[]> {
    const cards = await VirtualCardModel.find({ userId, status: { $ne: 'CANCELLED' } });
    return cards.map(card => card.toObject());
  }

  // Update card
  static async updateCard(cardId: string, data: UpdateCardRequest): Promise<VirtualCard | null> {
    const card = await VirtualCardModel.findOneAndUpdate(
      { id: cardId },
      { ...data, updatedAt: new Date() },
      { new: true }
    );
    return card?.toObject() || null;
  }

  // Fund card
  static async fundCard(data: FundCardRequest): Promise<boolean> {
    const card = await VirtualCardModel.findOne({ id: data.cardId });
    if (!card) return false;

    card.balance += data.amount;
    card.updatedAt = new Date();
    await card.save();

    logger.info(`Card ${data.cardId} funded with ${data.amount} ${data.currency}`);
    return true;
  }

  // Process transaction
  static async processTransaction(
    cardId: string, 
    amount: number, 
    merchant: string, 
    description: string
  ): Promise<CardTransaction | null> {
    const card = await VirtualCardModel.findOne({ id: cardId });
    if (!card || card.status !== 'ACTIVE' || card.balance < amount) {
      return null;
    }

    // Check spending limits
    if (!this.checkSpendingLimits(card, amount)) {
      return null;
    }

    const transaction = new CardTransactionModel({
      id: generateUUID(),
      cardId,
      amount,
      currency: card.currency,
      merchant,
      description,
      status: 'PENDING'
    });

    await transaction.save();

    // Update card balance
    card.balance -= amount;
    card.updatedAt = new Date();
    await card.save();

    // Update transaction status
    transaction.status = 'COMPLETED';
    await transaction.save();

    logger.info(`Transaction processed: ${transaction.id} for card: ${cardId}`);
    return transaction.toObject();
  }

  // Get card transactions
  static async getCardTransactions(cardId: string, limit = 50): Promise<CardTransaction[]> {
    const transactions = await CardTransactionModel
      .find({ cardId })
      .sort({ createdAt: -1 })
      .limit(limit);
    
    return transactions.map(tx => tx.toObject());
  }

  // Helper methods
  private static generateCardNumber(): string {
    const prefix = '4'; // Visa prefix
    const randomDigits = Array.from({ length: 15 }, () => 
      Math.floor(Math.random() * 10)
    ).join('');
    return prefix + randomDigits;
  }

  private static generateExpiryDate(): string {
    const now = new Date();
    const year = now.getFullYear() + 3;
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${month}/${year.toString().slice(-2)}`;
  }

  private static generateCVV(): string {
    return Array.from({ length: 3 }, () => 
      Math.floor(Math.random() * 10)
    ).join('');
  }

  private static checkSpendingLimits(card: any, amount: number): boolean {
    // Check per-transaction limit
    if (amount > card.spendingLimits.perTransaction) {
      return false;
    }

    // TODO: Implement daily/monthly limit checks
    // This would require tracking daily/monthly spending
    return true;
  }
}
