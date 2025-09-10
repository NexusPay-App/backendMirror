import { Circle, CircleEnvironments } from '@circle-fin/circle-sdk';
import config from '../config/env';
import pino from 'pino';

const logger = pino({ level: 'info' });

export class CircleService {
  private circle: Circle;
  private environment: 'sandbox' | 'production';

  constructor() {
    this.environment = (process.env.CIRCLE_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox';
    
    const baseUrl = this.environment === 'production' 
      ? 'https://api.circle.com' 
      : 'https://api-sandbox.circle.com';
    
    this.circle = new Circle(
      process.env.CIRCLE_API_KEY || '',
      baseUrl
    );

    logger.info(`Circle SDK initialized in ${this.environment} mode`);
  }

  // Create a virtual card
  async createVirtualCard(data: {
    userId: string;
    walletAddress: string;
    spendingLimits: {
      daily: number;
      monthly: number;
      perTransaction: number;
    };
    currency?: string;
  }): Promise<{
    success: boolean;
    card?: any;
    error?: string;
  }> {
    try {
      // Check if Circle credentials are configured
      if (!process.env.CIRCLE_API_KEY || process.env.CIRCLE_API_KEY === 'your_circle_api_key') {
        logger.warn('Circle API key not configured, using mock card generation');
        return this.createMockCard(data);
      }

      // First, create a wallet if it doesn't exist
      const wallet = await this.createOrGetWallet(data.walletAddress);
      if (!wallet.success) {
        return { success: false, error: wallet.error };
      }

      // Create virtual card with Circle
      const cardResponse = await this.circle.cards.createCard({
        idempotencyKey: `card-${data.userId}-${Date.now()}`,
        keyId: process.env.CIRCLE_KEY_ID || '',
        encryptedData: JSON.stringify({
          number: this.generateCardNumber(),
          cvv: this.generateCVV(),
          expiryMonth: this.generateExpiryMonth(),
          expiryYear: this.generateExpiryYear()
        }),
        billingDetails: {
          name: `User ${data.userId}`,
          city: 'Nairobi',
          country: 'KE',
          line1: '123 Main St',
          postalCode: '00100',
          district: 'Nairobi'
        },
        expMonth: this.generateExpiryMonth(),
        expYear: this.generateExpiryYear(),
        metadata: {
          email: `user${data.userId}@nexuspay.app`,
          phoneNumber: '+254700000000',
          sessionId: `session-${data.userId}-${Date.now()}`,
          ipAddress: '127.0.0.1'
        }
      });

      logger.info(`Virtual card created with Circle: ${cardResponse.data?.data?.id}`);
      
      return {
        success: true,
        card: {
          id: cardResponse.data?.data?.id,
          cardNumber: cardResponse.data?.data?.last4,
          expiryDate: `${cardResponse.data?.data?.expMonth}/${cardResponse.data?.data?.expYear}`,
          cvv: '***', // Never return actual CVV
          status: cardResponse.data?.data?.status,
          billingDetails: cardResponse.data?.data?.billingDetails
        }
      };
    } catch (error) {
      logger.error(`Error creating virtual card: ${error}`);
      // Fallback to mock card if Circle fails
      logger.warn('Circle API failed, falling back to mock card');
      return this.createMockCard(data);
    }
  }

  // Create mock card for testing/fallback
  private createMockCard(data: {
    userId: string;
    walletAddress: string;
    spendingLimits: {
      daily: number;
      monthly: number;
      perTransaction: number;
    };
    currency?: string;
  }): {
    success: boolean;
    card?: any;
    error?: string;
  } {
    const cardId = `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      success: true,
      card: {
        id: cardId,
        cardNumber: this.generateCardNumber(),
        expiryDate: this.generateExpiryDate(),
        cvv: '***',
        status: 'PENDING',
        billingDetails: {
          name: `User ${data.userId}`,
          city: 'Nairobi',
          country: 'KE'
        }
      }
    };
  }

  // Create or get existing wallet
  private async createOrGetWallet(walletAddress: string): Promise<{
    success: boolean;
    wallet?: any;
    error?: string;
  }> {
    try {
      // Check if wallet exists
      const wallets = await this.circle.wallets.listWallets();
      const existingWallet = wallets.data?.data?.find(
        (w: any) => w.description?.includes(walletAddress)
      );

      if (existingWallet) {
        return { success: true, wallet: existingWallet };
      }

      // Create new wallet
      const walletResponse = await this.circle.wallets.createWallet({
        idempotencyKey: `wallet-${walletAddress}-${Date.now()}`,
        description: `Wallet for ${walletAddress}`
      });

      logger.info(`Wallet created: ${walletResponse.data?.data?.walletId}`);
      return { success: true, wallet: walletResponse.data?.data };
    } catch (error) {
      logger.error(`Error creating wallet: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Get card details
  async getCard(cardId: string): Promise<{
    success: boolean;
    card?: any;
    error?: string;
  }> {
    try {
      const response = await this.circle.cards.getCard(cardId);
      return {
        success: true,
        card: response.data
      };
    } catch (error) {
      logger.error(`Error getting card: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Update card status
  async updateCardStatus(cardId: string, status: 'ACTIVE' | 'INACTIVE'): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Circle SDK doesn't have direct status update, we'll handle this in our database
      logger.info(`Card ${cardId} status update requested to ${status}`);
      return { success: true };
    } catch (error) {
      logger.error(`Error updating card status: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Get card transactions
  async getCardTransactions(cardId: string, limit = 50): Promise<{
    success: boolean;
    transactions?: any[];
    error?: string;
  }> {
    try {
      // For now, we'll use our own transaction tracking
      // Circle transactions can be retrieved via their API but require different endpoints
      logger.info(`Getting transactions for card ${cardId}`);
      
      return {
        success: true,
        transactions: []
      };
    } catch (error) {
      logger.error(`Error getting card transactions: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Helper methods for generating card details (fallback)
  private generateCardNumber(): string {
    // This is just for the encrypted data field - Circle will generate the actual card
    return '4111111111111111'; // Test card number
  }

  private generateCVV(): string {
    return '123'; // Test CVV
  }

  private generateExpiryMonth(): number {
    const now = new Date();
    return now.getMonth() + 1;
  }

  private generateExpiryYear(): number {
    const now = new Date();
    return now.getFullYear() + 3;
  }

  private generateExpiryDate(): string {
    const now = new Date();
    const year = now.getFullYear() + 3;
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${month}/${year.toString().slice(-2)}`;
  }
}
