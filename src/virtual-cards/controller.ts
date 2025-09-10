import { Request, Response } from 'express';
import { VirtualCardService } from './service';
import { CreateCardRequest, UpdateCardRequest, FundCardRequest } from './types';
import { generateUUID } from '../utils';

export class VirtualCardController {
  // Create virtual card
  static async createCard(req: Request, res: Response) {
    try {
      const { userId, walletAddress, spendingLimits, currency } = req.body;
      
      if (!userId || !walletAddress) {
        return res.status(400).json({
          success: false,
          message: 'User ID and wallet address are required'
        });
      }

      const cardData: CreateCardRequest = {
        userId,
        walletAddress,
        spendingLimits,
        currency
      };

      const card = await VirtualCardService.createCard(cardData);
      
      res.status(201).json({
        success: true,
        message: 'Virtual card created successfully',
        data: card
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to create virtual card',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Get card details
  static async getCard(req: Request, res: Response) {
    try {
      const { cardId } = req.params;
      const card = await VirtualCardService.getCard(cardId);
      
      if (!card) {
        return res.status(404).json({
          success: false,
          message: 'Card not found'
        });
      }

      res.json({
        success: true,
        data: card
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get card details',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Get user's cards
  static async getUserCards(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const cards = await VirtualCardService.getUserCards(userId);
      
      res.json({
        success: true,
        data: cards
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get user cards',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Update card
  static async updateCard(req: Request, res: Response) {
    try {
      const { cardId } = req.params;
      const updateData: UpdateCardRequest = req.body;
      
      const card = await VirtualCardService.updateCard(cardId, updateData);
      
      if (!card) {
        return res.status(404).json({
          success: false,
          message: 'Card not found'
        });
      }

      res.json({
        success: true,
        message: 'Card updated successfully',
        data: card
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to update card',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Fund card
  static async fundCard(req: Request, res: Response) {
    try {
      const { cardId } = req.params;
      const { amount, currency, source } = req.body;
      
      if (!amount || !currency) {
        return res.status(400).json({
          success: false,
          message: 'Amount and currency are required'
        });
      }

      const fundData: FundCardRequest = {
        cardId,
        amount,
        currency,
        source: source || 'WALLET'
      };

      const success = await VirtualCardService.fundCard(fundData);
      
      if (!success) {
        return res.status(404).json({
          success: false,
          message: 'Card not found'
        });
      }

      res.json({
        success: true,
        message: 'Card funded successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fund card',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Process transaction
  static async processTransaction(req: Request, res: Response) {
    try {
      const { cardId } = req.params;
      const { amount, merchant, description } = req.body;
      
      if (!amount || !merchant || !description) {
        return res.status(400).json({
          success: false,
          message: 'Amount, merchant, and description are required'
        });
      }

      const transaction = await VirtualCardService.processTransaction(
        cardId,
        amount,
        merchant,
        description
      );
      
      if (!transaction) {
        return res.status(400).json({
          success: false,
          message: 'Transaction failed - insufficient funds or card inactive'
        });
      }

      res.json({
        success: true,
        message: 'Transaction processed successfully',
        data: transaction
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to process transaction',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Get card transactions
  static async getCardTransactions(req: Request, res: Response) {
    try {
      const { cardId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const transactions = await VirtualCardService.getCardTransactions(cardId, limit);
      
      res.json({
        success: true,
        data: transactions
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get card transactions',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
