export interface VirtualCard {
  id: string;
  userId: string;
  walletAddress: string;
  cardNumber: string;
  expiryDate: string;
  cvv: string;
  status: CardStatus;
  spendingLimits: SpendingLimits;
  balance: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SpendingLimits {
  daily: number;
  monthly: number;
  perTransaction: number;
}

export type CardStatus = 'ACTIVE' | 'FROZEN' | 'CANCELLED' | 'PENDING';

export interface CardTransaction {
  id: string;
  cardId: string;
  amount: number;
  currency: string;
  merchant: string;
  description: string;
  status: TransactionStatus;
  createdAt: Date;
}

export type TransactionStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface CreateCardRequest {
  userId: string;
  walletAddress: string;
  spendingLimits?: Partial<SpendingLimits>;
  currency?: string;
}

export interface UpdateCardRequest {
  spendingLimits?: Partial<SpendingLimits>;
  status?: CardStatus;
}

export interface FundCardRequest {
  cardId: string;
  amount: number;
  currency: string;
  source: 'WALLET' | 'MPESA' | 'BANK';
}
