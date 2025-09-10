import { Router } from 'express';
import { VirtualCardController } from './controller';
import { VirtualCardIntegration } from './integration';
import { authenticate } from '../middleware/auth';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Card management routes
router.post('/create', VirtualCardController.createCard);
router.get('/user/:userId', VirtualCardController.getUserCards);
router.get('/:cardId', VirtualCardController.getCard);
router.put('/:cardId', VirtualCardController.updateCard);

// Card operations
router.post('/:cardId/fund', VirtualCardController.fundCard);
router.post('/:cardId/transaction', VirtualCardController.processTransaction);
router.get('/:cardId/transactions', VirtualCardController.getCardTransactions);

// Wallet integration
router.post('/:cardId/fund-from-wallet', async (req, res) => {
  try {
    const { cardId } = req.params;
    const { amount, tokenSymbol, chain } = req.body;
    
    const success = await VirtualCardIntegration.fundCardFromWallet(
      cardId, 
      amount, 
      tokenSymbol || 'USDC', 
      chain || 'arbitrum'
    );
    
    res.json({
      success,
      message: success ? 'Card funded from wallet' : 'Failed to fund card'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error funding card from wallet',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.post('/:cardId/withdraw-to-wallet', async (req, res) => {
  try {
    const { cardId } = req.params;
    const { amount, tokenSymbol, chain } = req.body;
    
    const success = await VirtualCardIntegration.withdrawToWallet(
      cardId, 
      amount, 
      tokenSymbol || 'USDC', 
      chain || 'arbitrum'
    );
    
    res.json({
      success,
      message: success ? 'Withdrawn to wallet' : 'Failed to withdraw'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error withdrawing to wallet',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.post('/:cardId/sync-balance', async (req, res) => {
  try {
    const { cardId } = req.params;
    const success = await VirtualCardIntegration.syncBalance(cardId);
    
    res.json({
      success,
      message: success ? 'Balance synced' : 'Failed to sync balance'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error syncing balance',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
