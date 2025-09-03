// src/services/transactionRecorder.ts
import { Escrow } from '../models/escrowModel';
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';

export interface TransactionRecord {
  userId: mongoose.Types.ObjectId;
  amount: number;
  cryptoAmount: number;
  type: 'fiat_to_crypto' | 'crypto_to_fiat' | 'crypto_to_paybill' | 'crypto_to_till' | 'token_transfer' | 'platform_operation';
  status: 'pending' | 'reserved' | 'processing' | 'completed' | 'failed' | 'error';
  cryptoTransactionHash?: string;
  mpesaTransactionId?: string;
  mpesaReceiptNumber?: string;
  paybillNumber?: string;
  accountNumber?: string;
  tillNumber?: string;
  metadata?: Record<string, any>;
}

/**
 * Comprehensive transaction recording service
 * Ensures ALL transactions are recorded in the database with proper types and metadata
 */
export class TransactionRecorder {
  
  /**
   * Record a new transaction in the database
   */
  static async recordTransaction(transactionData: TransactionRecord): Promise<string> {
    try {
      const transactionId = randomUUID();
      
      const escrow = new Escrow({
        transactionId,
        userId: transactionData.userId,
        amount: transactionData.amount,
        cryptoAmount: transactionData.cryptoAmount,
        type: transactionData.type,
        status: transactionData.status,
        cryptoTransactionHash: transactionData.cryptoTransactionHash,
        mpesaTransactionId: transactionData.mpesaTransactionId,
        mpesaReceiptNumber: transactionData.mpesaReceiptNumber,
        paybillNumber: transactionData.paybillNumber,
        accountNumber: transactionData.accountNumber,
        tillNumber: transactionData.tillNumber,
        metadata: {
          ...transactionData.metadata,
          recordedAt: new Date().toISOString(),
          recorder: 'TransactionRecorder'
        }
      });

      // Set completedAt if status is completed
      if (transactionData.status === 'completed') {
        escrow.completedAt = new Date();
      }

      await escrow.save();
      
      console.log(`✅ Transaction recorded: ${transactionId} (${transactionData.type})`);
      return transactionId;
      
    } catch (error) {
      console.error('❌ Failed to record transaction:', error);
      throw error;
    }
  }

  /**
   * Record a fiat-to-crypto transaction (buy crypto)
   */
  static async recordFiatToCrypto(
    userId: mongoose.Types.ObjectId,
    fiatAmount: number,
    cryptoAmount: number,
    chain: string,
    tokenType: string,
    mpesaTransactionId?: string,
    mpesaReceiptNumber?: string,
    metadata?: Record<string, any>
  ): Promise<string> {
    return this.recordTransaction({
      userId,
      amount: fiatAmount,
      cryptoAmount,
      type: 'fiat_to_crypto',
      status: 'pending',
      mpesaTransactionId,
      mpesaReceiptNumber,
      metadata: {
        chain,
        tokenType,
        conversionType: 'buy',
        ...metadata
      }
    });
  }

  /**
   * Record a crypto-to-fiat transaction (sell crypto)
   */
  static async recordCryptoToFiat(
    userId: mongoose.Types.ObjectId,
    fiatAmount: number,
    cryptoAmount: number,
    chain: string,
    tokenType: string,
    mpesaTransactionId?: string,
    metadata?: Record<string, any>
  ): Promise<string> {
    return this.recordTransaction({
      userId,
      amount: fiatAmount,
      cryptoAmount,
      type: 'crypto_to_fiat',
      status: 'pending',
      mpesaTransactionId,
      metadata: {
        chain,
        tokenType,
        conversionType: 'sell',
        ...metadata
      }
    });
  }

  /**
   * Record a crypto-to-paybill transaction
   */
  static async recordCryptoToPaybill(
    userId: mongoose.Types.ObjectId,
    fiatAmount: number,
    cryptoAmount: number,
    paybillNumber: string,
    accountNumber: string,
    chain: string,
    tokenType: string,
    metadata?: Record<string, any>
  ): Promise<string> {
    return this.recordTransaction({
      userId,
      amount: fiatAmount,
      cryptoAmount,
      type: 'crypto_to_paybill',
      status: 'pending',
      paybillNumber,
      accountNumber,
      metadata: {
        chain,
        tokenType,
        paymentType: 'paybill',
        ...metadata
      }
    });
  }

  /**
   * Record a crypto-to-till transaction
   */
  static async recordCryptoToTill(
    userId: mongoose.Types.ObjectId,
    fiatAmount: number,
    cryptoAmount: number,
    tillNumber: string,
    chain: string,
    tokenType: string,
    metadata?: Record<string, any>
  ): Promise<string> {
    return this.recordTransaction({
      userId,
      amount: fiatAmount,
      cryptoAmount,
      type: 'crypto_to_till',
      status: 'pending',
      tillNumber,
      metadata: {
        chain,
        tokenType,
        paymentType: 'till',
        ...metadata
      }
    });
  }

  /**
   * Record a direct token transfer (wallet-to-wallet)
   */
  static async recordTokenTransfer(
    userId: mongoose.Types.ObjectId,
    cryptoAmount: number,
    chain: string,
    tokenType: string,
    senderAddress: string,
    recipientAddress: string,
    transactionHash: string,
    metadata?: Record<string, any>
  ): Promise<string> {
    const transactionId = await this.recordTransaction({
      userId,
      amount: 0, // No fiat amount for direct transfers
      cryptoAmount,
      type: 'token_transfer',
      status: 'completed',
      cryptoTransactionHash: transactionHash,
      metadata: {
        chain,
        tokenType,
        senderAddress,
        recipientAddress,
        transferType: 'wallet_to_wallet',
        ...metadata
      }
    });

    // Update with completedAt
    await Escrow.findOneAndUpdate(
      { transactionId },
      { $set: { completedAt: new Date() } }
    );

    return transactionId;
  }

  /**
   * Record a platform operation (admin/admin wallet operations)
   */
  static async recordPlatformOperation(
    userId: mongoose.Types.ObjectId,
    cryptoAmount: number,
    chain: string,
    tokenType: string,
    operation: string,
    transactionHash: string,
    metadata?: Record<string, any>
  ): Promise<string> {
    const transactionId = await this.recordTransaction({
      userId,
      amount: 0, // No fiat amount for platform operations
      cryptoAmount,
      type: 'platform_operation',
      status: 'completed',
      cryptoTransactionHash: transactionHash,
      metadata: {
        chain,
        tokenType,
        operation,
        adminOperation: true,
        platformWallet: true,
        ...metadata
      }
    });

    // Update with completedAt
    await Escrow.findOneAndUpdate(
      { transactionId },
      { $set: { completedAt: new Date() } }
    );

    return transactionId;
  }

  /**
   * Update transaction status
   */
  static async updateTransactionStatus(
    transactionId: string,
    status: 'pending' | 'reserved' | 'processing' | 'completed' | 'failed' | 'error',
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const updateData: any = { status };
      
      if (status === 'completed') {
        updateData.completedAt = new Date();
      }
      
      if (metadata) {
        updateData.metadata = metadata;
      }

      await Escrow.findOneAndUpdate(
        { transactionId },
        { $set: updateData }
      );

      console.log(`✅ Transaction status updated: ${transactionId} -> ${status}`);
      
    } catch (error) {
      console.error('❌ Failed to update transaction status:', error);
      throw error;
    }
  }

  /**
   * Update transaction with blockchain hash
   */
  static async updateTransactionHash(
    transactionId: string,
    transactionHash: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const updateData: any = {
        cryptoTransactionHash: transactionHash
      };
      
      if (metadata) {
        updateData.metadata = metadata;
      }

      await Escrow.findOneAndUpdate(
        { transactionId },
        { $set: updateData }
      );

      console.log(`✅ Transaction hash updated: ${transactionId} -> ${transactionHash}`);
      
    } catch (error) {
      console.error('❌ Failed to update transaction hash:', error);
      throw error;
    }
  }
}
