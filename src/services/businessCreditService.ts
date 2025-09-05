import { Business } from '../models/businessModel';
import { User } from '../models/models';
import { sendFromPlatformWallet } from './platformWallet';
import { generateExplorerUrl } from '../utils/explorer';
import { TokenSymbol } from '../types/token';
import { SMSService } from './smsService';
import config from '../config/env';
import { randomUUID } from 'crypto';

export interface OverdraftRequest {
  businessId: string;
  amount: number;
  purpose: string;
  userId: string;
}

export interface OverdraftResponse {
  success: boolean;
  transactionId: string;
  amount: number;
  transactionHash?: string;
  explorerUrl?: string;
  newCreditBalance: number;
  availableCredit: number;
  message: string;
}

export interface CreditAssessment {
  creditScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  creditLimit: number;
  availableCredit: number;
  currentCredit: number;
  totalVolume: number;
  monthlyVolume: number;
  paymentSuccessRate: number;
  recommendations: string[];
}

export class BusinessCreditService {
  
  /**
   * Request an overdraft/loan for a business
   */
  static async requestOverdraft(request: OverdraftRequest): Promise<OverdraftResponse> {
    try {
      const { businessId, amount, purpose, userId } = request;
      
      // Find the business
      const business = await Business.findById(businessId);
      if (!business) {
        throw new Error('Business not found');
      }
      
      // Verify user owns the business
      if (business.userId.toString() !== userId) {
        throw new Error('Unauthorized access to business account');
      }
      
      // Check if overdraft is enabled
      if (!business.overdraftEnabled) {
        throw new Error('Overdraft facility is not enabled for this business');
      }
      
      // Validate amount
      if (amount <= 0 || amount > business.availableCredit) {
        throw new Error(`Invalid amount. Available credit: ${business.availableCredit} USDC`);
      }
      
      // Check risk level and apply restrictions
      if (business.riskLevel === 'high' && amount > 50) {
        throw new Error('High-risk businesses are limited to $50 overdraft maximum');
      }
      
      if (business.riskLevel === 'medium' && amount > 200) {
        throw new Error('Medium-risk businesses are limited to $200 overdraft maximum');
      }
      
      // Generate transaction ID
      const transactionId = randomUUID();
      
      // Get platform wallet keys
      const primaryKey = process.env.PLATFORM_WALLET_PRIMARY_KEY;
      const secondaryKey = process.env.PLATFORM_WALLET_SECONDARY_KEY;
      
      if (!primaryKey || !secondaryKey) {
        throw new Error('Platform wallet not properly configured');
      }
      
      // Transfer funds from platform wallet to business wallet
      const transferResult = await sendFromPlatformWallet(
        amount,
        business.walletAddress,
        primaryKey,
        secondaryKey,
        'arbitrum',
        'USDC' as TokenSymbol
      );
      
      if (!transferResult?.transactionHash) {
        throw new Error('Failed to transfer overdraft funds');
      }
      
      // Update business credit information
      business.currentCredit += amount;
      business.availableCredit = Math.max(0, business.creditLimit - business.currentCredit);
      
      // Add to overdraft history
      business.overdraftHistory.push({
        transactionId,
        amount,
        type: 'borrow',
        timestamp: new Date(),
        status: 'completed',
        transactionHash: transferResult.transactionHash
      });
      
      await business.save();
      
      const explorerUrl = generateExplorerUrl('arbitrum', transferResult.transactionHash);
      
      // Send overdraft notification SMS
      await SMSService.sendOverdraftNotification({
        phoneNumber: business.phoneNumber,
        amount: amount.toString(),
        transactionHash: transferResult.transactionHash,
        type: 'borrow',
        newCreditBalance: business.currentCredit.toString(),
        availableCredit: business.availableCredit.toString(),
        explorerUrl
      });
      
      return {
        success: true,
        transactionId,
        amount,
        transactionHash: transferResult.transactionHash,
        explorerUrl,
        newCreditBalance: business.currentCredit,
        availableCredit: business.availableCredit,
        message: `Overdraft of ${amount} USDC successfully transferred to your business wallet`
      };
      
    } catch (error: any) {
      console.error('❌ Error in overdraft request:', error);
      throw error;
    }
  }
  
  /**
   * Repay overdraft/loan
   */
  static async repayOverdraft(businessId: string, amount: number, userId: string): Promise<OverdraftResponse> {
    try {
      const business = await Business.findById(businessId);
      if (!business) {
        throw new Error('Business not found');
      }
      
      if (business.userId.toString() !== userId) {
        throw new Error('Unauthorized access to business account');
      }
      
      if (amount <= 0 || amount > business.currentCredit) {
        throw new Error(`Invalid amount. Current credit: ${business.currentCredit} USDC`);
      }
      
      const transactionId = randomUUID();
      
      // Transfer funds from business wallet to platform wallet
      const sdk = await import('@thirdweb-dev/sdk');
      const { ThirdwebSDK } = sdk;
      
      const thirdwebSDK = ThirdwebSDK.fromPrivateKey(
        business.privateKey,
        config.arbitrum.chainId,
        { secretKey: config.THIRDWEB_SECRET_KEY }
      );
      
      const businessWallet = thirdwebSDK.wallet;
      
      // Get platform wallet address
      const platformWalletAddress = process.env.PLATFORM_WALLET_ADDRESS;
      if (!platformWalletAddress) {
        throw new Error('Platform wallet address not configured');
      }
      
      // Transfer funds back to platform
      const tx = await businessWallet.transfer(platformWalletAddress, amount);
      
      // Update business credit information
      business.currentCredit -= amount;
      business.availableCredit = Math.max(0, business.creditLimit - business.currentCredit);
      
      // Add to overdraft history
      business.overdraftHistory.push({
        transactionId,
        amount,
        type: 'repay',
        timestamp: new Date(),
        status: 'completed',
        transactionHash: tx.receipt.transactionHash
      });
      
      await business.save();
      
      const explorerUrl = generateExplorerUrl('arbitrum', tx.receipt.transactionHash);
      
      // Send overdraft repayment SMS notification
      await SMSService.sendOverdraftNotification({
        phoneNumber: business.phoneNumber,
        amount: amount.toString(),
        transactionHash: tx.receipt.transactionHash,
        type: 'repay',
        newCreditBalance: business.currentCredit.toString(),
        availableCredit: business.availableCredit.toString(),
        explorerUrl
      });
      
      return {
        success: true,
        transactionId,
        amount,
        transactionHash: tx.receipt.transactionHash,
        explorerUrl,
        newCreditBalance: business.currentCredit,
        availableCredit: business.availableCredit,
        message: `Successfully repaid ${amount} USDC of your overdraft`
      };
      
    } catch (error: any) {
      console.error('❌ Error in overdraft repayment:', error);
      throw error;
    }
  }
  
  /**
   * Auto-repay overdraft from incoming payment
   */
  static async autoRepayFromIncomingPayment(businessId: string, incomingAmount: number): Promise<number> {
    try {
      const business = await Business.findById(businessId);
      if (!business) {
        throw new Error('Business not found');
      }
      
      if (!business.autoRepayment || business.currentCredit <= 0) {
        return 0; // No auto-repayment needed
      }
      
      // Calculate repayment amount (repay up to 50% of incoming payment)
      const maxRepayment = Math.min(incomingAmount * 0.5, business.currentCredit);
      const repaymentAmount = Math.min(maxRepayment, business.currentCredit);
      
      if (repaymentAmount <= 0) {
        return 0;
      }
      
      // Perform auto-repayment
      await this.repayOverdraft(businessId, repaymentAmount, business.userId.toString());
      
      return repaymentAmount;
      
    } catch (error: any) {
      console.error('❌ Error in auto-repayment:', error);
      return 0; // Don't fail the main transaction if auto-repayment fails
    }
  }
  
  /**
   * Assess credit and calculate limits
   */
  static async assessCredit(businessId: string): Promise<CreditAssessment> {
    try {
      const business = await Business.findById(businessId);
      if (!business) {
        throw new Error('Business not found');
      }
      
      // Calculate credit score
      const creditScore = business.calculateCreditScore();
      
      // Assess risk level
      const riskLevel = business.assessRiskLevel();
      
      // Calculate credit limit
      const creditLimit = business.calculateCreditLimit();
      
      // Calculate payment success rate
      const totalPayments = business.paymentHistory.length;
      const successfulPayments = business.paymentHistory.filter((p: any) => p.status === 'completed').length;
      const paymentSuccessRate = totalPayments > 0 ? successfulPayments / totalPayments : 0;
      
      // Generate recommendations
      const recommendations: string[] = [];
      
      if (creditScore < 500) {
        recommendations.push('Increase your transaction volume to improve credit score');
        recommendations.push('Ensure timely completion of all transactions');
      }
      
      if (riskLevel === 'high') {
        recommendations.push('Maintain consistent payment history to reduce risk level');
        recommendations.push('Consider providing business verification documents');
      }
      
      if (business.totalVolume < 1000) {
        recommendations.push('Process more transactions to increase your credit limit');
      }
      
      if (!business.isVerified) {
        recommendations.push('Complete business verification to unlock higher credit limits');
      }
      
      return {
        creditScore,
        riskLevel,
        creditLimit,
        availableCredit: business.availableCredit,
        currentCredit: business.currentCredit,
        totalVolume: business.totalVolume,
        monthlyVolume: business.monthlyVolume,
        paymentSuccessRate,
        recommendations
      };
      
    } catch (error: any) {
      console.error('❌ Error in credit assessment:', error);
      throw error;
    }
  }
  
  /**
   * Update business volume and recalculate credit limits
   */
  static async updateVolumeAndCredit(businessId: string, transactionAmount: number, isIncoming: boolean): Promise<void> {
    try {
      const business = await Business.findById(businessId);
      if (!business) {
        throw new Error('Business not found');
      }
      
      // Update total volume
      business.totalVolume += transactionAmount;
      
      // Update monthly volume (simplified - in production, you'd track by month)
      const now = new Date();
      const lastUpdate = business.lastVolumeUpdate;
      const daysSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceUpdate > 30) {
        // Reset monthly volume if more than 30 days have passed
        business.monthlyVolume = transactionAmount;
      } else {
        business.monthlyVolume += transactionAmount;
      }
      
      business.lastVolumeUpdate = now;
      
      // Add to payment history
      business.paymentHistory.push({
        transactionId: randomUUID(),
        amount: transactionAmount,
        timestamp: now,
        status: 'completed',
        type: isIncoming ? 'incoming' : 'outgoing'
      });
      
      // Recalculate credit score and limits
      business.creditScore = business.calculateCreditScore();
      business.riskLevel = business.assessRiskLevel();
      business.creditLimit = business.calculateCreditLimit();
      business.availableCredit = Math.max(0, business.creditLimit - business.currentCredit);
      
      // Enable overdraft if credit score is good enough
      if (business.creditScore >= 500 && !business.overdraftEnabled) {
        business.overdraftEnabled = true;
      }
      
      await business.save();
      
    } catch (error: any) {
      console.error('❌ Error updating volume and credit:', error);
      throw error;
    }
  }
  
  /**
   * Enable/disable overdraft facility
   */
  static async toggleOverdraft(businessId: string, enabled: boolean, userId: string): Promise<void> {
    try {
      const business = await Business.findById(businessId);
      if (!business) {
        throw new Error('Business not found');
      }
      
      if (business.userId.toString() !== userId) {
        throw new Error('Unauthorized access to business account');
      }
      
      if (enabled && business.creditScore < 500) {
        throw new Error('Credit score must be at least 500 to enable overdraft facility');
      }
      
      if (enabled && business.currentCredit > 0) {
        throw new Error('Cannot enable overdraft while you have outstanding credit');
      }
      
      business.overdraftEnabled = enabled;
      await business.save();
      
    } catch (error: any) {
      console.error('❌ Error toggling overdraft:', error);
      throw error;
    }
  }
}
