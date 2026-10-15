import { issueChallenge, consumeChallenge } from '../services/verificationChallenges';
import { Request, Response } from 'express';

import { Business } from '../models/businessModel';
import { User } from '../models/models';
import { createAccount, generateOTP, otpStore } from '../services/auth';
import { handleError, standardResponse } from '../services/utils';
import config from '../config/env';
import * as bcrypt from 'bcrypt';
import { getTokenConfig } from '../services/token';
import { sendToken, getAllTokenTransferEvents } from '../services/token';
import { BusinessCreditService } from '../services/businessCreditService';
import { SMSService } from '../services/smsService';
import { UserOptimizationService } from '../services/userOptimizationService';

interface TokenTransferEvent {
  hash: string;
  from: string;
  to: string;
  value: string;
  tokenSymbol: string;
  tokenDecimal: string;
  timeStamp: string;
  confirmations: string;
}

function generateMerchantId(): string {
  const timestamp = Date.now().toString().slice(-5);
  const randomDigits = Math.floor(10000 + Math.random() * 90000).toString();
  return `NX-${timestamp}${randomDigits}`;
}

export const requestBusinessCreation = async (req: Request, res: Response): Promise<Response> => {
  const { userId, phoneNumber, businessName, ownerName, location, businessType } = req.body;

  if (String(userId) !== String(req.user?._id)) return res.status(403).json({ success: false, message: 'Business owner must match the signed-in account' });
  if (!userId || !phoneNumber || !businessName || !ownerName || !location || !businessType) {
    return res.status(400).send({ message: 'All fields are required!' });
  }

  try {
    const validation = await UserOptimizationService.validateBusinessCreation(userId, phoneNumber, businessName);
    
    if (!validation.canCreate) {
      return res.status(400).send({ message: validation.message });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send({ message: 'User not found. Please create a personal account first.' });
    }

    const existingBusiness = await Business.findOne({ businessName });
    if (existingBusiness) {
      return res.status(409).send({ message: 'A business with this name already exists.' });
    }

    const otp = generateOTP();
    await issueChallenge(phoneNumber, 'business-creation', otp, { userId: String(req.user._id) });

    console.log("Operation diagnostic");

    try {
      console.log("Operation diagnostic");
      const smsSent = await SMSService.sendOTP(phoneNumber, otp, 'business_creation');
      
      if (!smsSent) {
        console.error("Operation diagnostic");
        return res.status(500).send({ message: 'Failed to send OTP. Please try again.' });
      }
      
      console.log("Operation diagnostic");
    } catch (smsError) {
      console.error("Operation diagnostic");
      return res.status(500).send({ message: 'Failed to send OTP. Please try again.' });
    }

    return res.send({ 
      message: 'OTP sent successfully. Please verify to complete business creation.',
      existingBusinesses: validation.existingBusinesses?.length || 0
    });

  } catch (error) {
    console.error("❌ Error in business creation request:");
    return handleError(error, res, 'Failed to process business creation request.');
  }
};

export const completeBusinessCreation = async (req: Request, res: Response): Promise<Response> => {
  const { userId, phoneNumber, otp, businessName, ownerName, location, businessType } = req.body;

  if (String(userId) !== String(req.user?._id)) return res.status(403).json({ success: false, message: 'Business owner must match the signed-in account' });
  if (!userId || !phoneNumber || !otp || !businessName || !ownerName || !location || !businessType) {
    return res.status(400).send({ message: 'All fields are required!' });
  }

  if (!await consumeChallenge(phoneNumber, 'business-creation', otp, String(req.user._id))) {
    return res.status(400).send({ message: 'Invalid or expired OTP.' });
  }
  // Code consumed atomically.

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send({ message: 'User not found. Please create a personal account first.' });
    }

    const existingBusiness = await Business.findOne({ businessName });
    if (existingBusiness) {
      return res.status(409).send({ message: 'A business with this name already exists.' });
    }

    const { pk, walletAddress } = await createAccount();
    
    let merchantId;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 5;

    while (!isUnique && attempts < maxAttempts) {
      merchantId = generateMerchantId();
      const existingMerchantId = await Business.findOne({ merchantId });
      if (!existingMerchantId) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      throw new Error('Failed to generate unique merchant ID after multiple attempts');
    }

    const business = new Business({
      businessName,
      ownerName,
      location,
      businessType,
      phoneNumber,
      merchantId,
      walletAddress,
      privateKey: pk,
      userId: user._id,
      creditLimit: 100.0,
      availableCredit: 100.0,
      overdraftEnabled: false
    });

    await business.save();

    try {
      console.log(`📱 Attempting to send business creation notification to: ${phoneNumber}`);
      const smsSent = await SMSService.sendBusinessNotification({
        phoneNumber,
        businessName,
        merchantId: merchantId!,
        walletAddress,
        creditLimit: '100.0',
        availableCredit: '100.0',
        action: 'created'
      });
      
      if (!smsSent) {
        console.error(`❌ Failed to send business creation SMS to ${phoneNumber}`);
      } else {
        console.log(`✅ Business creation SMS sent successfully to ${phoneNumber}`);
      }
    } catch (smsError) {
      console.error(`❌ Error sending business creation SMS to ${phoneNumber}:`, smsError);
    }

    return res.send({
      message: 'Business created successfully!',
      data: {
        businessId: business._id,
        businessName: business.businessName,
        merchantId: business.merchantId,
        walletAddress: business.walletAddress,
        creditLimit: business.creditLimit,
        availableCredit: business.availableCredit,
        overdraftEnabled: business.overdraftEnabled
      }
    });

  } catch (error) {
    console.error('❌ Error in completing business creation:', error);
    return res.status(500).send({ message: 'Failed to create business.' });
  }
};

export const getMyBusinesses = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) {
      return res.status(401).send({ success: false, message: 'Authentication required' });
    }
    const businesses = await Business.find({ userId: req.user._id }).lean();
    const payload = businesses.map((business: any) => ({
      businessId: String(business._id),
      merchantId: business.merchantId,
      businessName: business.businessName,
      businessType: business.businessType,
      phoneNumber: business.phoneNumber,
      walletAddress: business.walletAddress,
      creditLimit: business.creditLimit ?? 0,
      availableCredit: business.availableCredit ?? 0,
      currentBalance: business.currentCredit ?? 0,
      overdraftEnabled: business.overdraftEnabled ?? false,
      status: business.status || 'active',
      isVerified: business.isVerified ?? false,
      pinSet: false,
      createdAt: business.createdAt,
      updatedAt: business.updatedAt,
    }));
    return res.json({ success: true, message: 'Businesses retrieved', data: { businesses: payload, totalCount: payload.length } });
  } catch (error) {
    console.error('Error listing user businesses:', error);
    return res.status(500).json({ success: false, message: 'Failed to list businesses' });
  }
};

export const getBusinessDetails = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) {
      return res.status(401).send({ message: 'Authentication required' });
    }

    const business = await Business.findOne({ userId: req.user._id });
    if (!business) {
      return res.status(404).send({ message: 'No business found for this user' });
    }

    return res.send({
      success: true,
      message: 'Business details retrieved successfully',
      data: {
        businessId: business._id,
        businessName: business.businessName,
        ownerName: business.ownerName,
        location: business.location,
        businessType: business.businessType,
        phoneNumber: business.phoneNumber,
        merchantId: business.merchantId,
        walletAddress: business.walletAddress,
        creditLimit: business.creditLimit,
        availableCredit: business.availableCredit,
        currentCredit: business.currentCredit,
        creditScore: business.creditScore,
        riskLevel: business.riskLevel,
        overdraftEnabled: business.overdraftEnabled,
        totalVolume: business.totalVolume,
        monthlyVolume: business.monthlyVolume,
        isVerified: business.isVerified,
        createdAt: business.createdAt,
        updatedAt: business.updatedAt
      }
    });
  } catch (error) {
    console.error('❌ Error getting business details:', error);
    return res.status(500).send({ message: 'Failed to retrieve business details' });
  }
};

export const getBusinessByMerchantId = async (req: Request, res: Response): Promise<Response> => {
  try {
    const merchantId = String(req.params.merchantId);
    if (!merchantId) {
      return res.status(400).send({ message: 'Merchant ID is required!' });
    }

    const business = await Business.findOne({ merchantId });
    if (!business) {
      return res.status(404).send({ message: 'Business not found.' });
    }

    return res.send({
      success: true,
      message: 'Business found successfully',
      data: {
        _id: business._id,
        businessName: business.businessName,
        ownerName: business.ownerName,
        location: business.location,
        businessType: business.businessType,
        phoneNumber: business.phoneNumber,
        merchantId: business.merchantId,
        walletAddress: business.walletAddress
      }
    });
  } catch (error) {
    console.error('❌ Error getting business by merchant ID:', error);
    return res.status(500).send({ message: 'Failed to get business details.' });
  }
};

export const checkBusinessStatus = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        error: { code: 'AUTH_REQUIRED', message: 'Please login to check business status' }
      });
    }

    const business = await Business.findOne({ userId: req.user._id });
    
    if (!business) {
      return res.status(200).json({
        success: true,
        message: 'No business account found',
        data: {
          hasBusiness: false
        }
      });
    }

    const transactions = await getAllTokenTransferEvents('arbitrum', business.walletAddress);

    const formattedTransactions = transactions.map((tx: TokenTransferEvent) => ({
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: (Number(tx.value) / Math.pow(10, Number(tx.tokenDecimal))).toString(),
      tokenSymbol: tx.tokenSymbol,
      timestamp: new Date(Number(tx.timeStamp) * 1000).toISOString(),
      confirmations: tx.confirmations
    }));

    return res.status(200).json({
      success: true,
      message: 'Business account found',
      data: {
        hasBusiness: true,
        businessDetails: {
          businessId: business._id,
          businessName: business.businessName,
          ownerName: business.ownerName,
          location: business.location,
          businessType: business.businessType,
          phoneNumber: business.phoneNumber,
          merchantId: business.merchantId,
          walletAddress: business.walletAddress,
          creditLimit: business.creditLimit,
          availableCredit: business.availableCredit,
          currentCredit: business.currentCredit,
          creditScore: business.creditScore,
          riskLevel: business.riskLevel,
          overdraftEnabled: business.overdraftEnabled,
          totalVolume: business.totalVolume,
          monthlyVolume: business.monthlyVolume,
          isVerified: business.isVerified,
          createdAt: business.createdAt
        },
        transactions: formattedTransactions
      }
    });

  } catch (error: any) {
    console.error('❌ Error checking business status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to check business status',
      error: {
        code: 'CHECK_FAILED',
        message: error.message || 'An unexpected error occurred'
      }
    });
  }
};

export const verifyExternalTransfer = async (req: Request, res: Response): Promise<Response> => {
  const { businessId, amount, destinationAddress, otp } = req.body;

  if (!businessId || !amount || !destinationAddress || !otp) {
    return res.status(400).send({ message: 'All fields are required!' });
  }

  try {
    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).send({ message: 'Business account not found.' });
    }

    if (!otpStore[business.phoneNumber] || otpStore[business.phoneNumber] !== otp) {
      return res.status(400).send({ message: 'Invalid or expired OTP.' });
    }
    delete otpStore[business.phoneNumber];

    if (!req.user || business.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Business account access denied' });
    }
    const tx = await sendToken(destinationAddress, String(amount), 'arbitrum', business.privateKey, 'USDC', business.walletAddress);

    console.log(`✅ Business External Transfer: ${tx.transactionHash}`);
    console.log(`From: ${business.walletAddress}`);
    console.log(`To: ${destinationAddress}`);
    console.log(`Amount: ${amount}`);

    return res.send({
      success: true,
      message: 'Funds transferred successfully to external wallet!',
      data: {
        transactionHash: tx.transactionHash,
        from: business.walletAddress,
        to: destinationAddress,
        amount
      }
    });
  } catch (error) {
    console.error('❌ Error in external transfer:', error);
    return res.status(500).send({ message: 'Failed to transfer funds to external wallet.' });
  }
};


/**
 * Request an overdraft/loan for business
 */
export const requestBusinessOverdraft = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) {
      return res.status(401).json(standardResponse(
        false,
        "Authentication required",
        null,
        { code: "AUTH_REQUIRED", message: "Please login to request overdraft" }
      ));
    }

    const { businessId, amount, purpose } = req.body;
    
    if (!businessId || !amount || !purpose) {
      return res.status(400).json(standardResponse(
        false,
        "Missing required fields",
        null,
        { code: "MISSING_FIELDS", message: "Business ID, amount, and purpose are required" }
      ));
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json(standardResponse(
        false,
        "Invalid amount",
        null,
        { code: "INVALID_AMOUNT", message: "Amount must be a positive number" }
      ));
    }

    const result = await BusinessCreditService.requestOverdraft({
      businessId,
      amount: amountNum,
      purpose,
      userId: req.user._id.toString()
    });

    return res.status(200).json(standardResponse(
      true,
      "Overdraft request successful",
      {
        transactionId: result.transactionId,
        amount: result.amount,
        transactionHash: result.transactionHash,
        explorerUrl: result.explorerUrl,
        newCreditBalance: result.newCreditBalance,
        availableCredit: result.availableCredit,
        message: result.message
      }
    ));

  } catch (error: any) {
    console.error("❌ Error in business overdraft request:");
    return res.status(500).json(standardResponse(
      false,
      "Failed to process overdraft request",
      null,
      { code: "OVERDRAFT_FAILED", message: error.message }
    ));
  }
};

/**
 * Repay overdraft/loan
 */
export const repayBusinessOverdraft = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) {
      return res.status(401).json(standardResponse(
        false,
        "Authentication required",
        null,
        { code: "AUTH_REQUIRED", message: "Please login to repay overdraft" }
      ));
    }

    const { businessId, amount } = req.body;
    
    if (!businessId || !amount) {
      return res.status(400).json(standardResponse(
        false,
        "Missing required fields",
        null,
        { code: "MISSING_FIELDS", message: "Business ID and amount are required" }
      ));
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json(standardResponse(
        false,
        "Invalid amount",
        null,
        { code: "INVALID_AMOUNT", message: "Amount must be a positive number" }
      ));
    }

    const result = await BusinessCreditService.repayOverdraft(
      businessId,
      amountNum,
      req.user._id.toString()
    );

    return res.status(200).json(standardResponse(
      true,
      "Overdraft repayment successful",
      {
        transactionId: result.transactionId,
        amount: result.amount,
        transactionHash: result.transactionHash,
        explorerUrl: result.explorerUrl,
        newCreditBalance: result.newCreditBalance,
        availableCredit: result.availableCredit,
        message: result.message
      }
    ));

  } catch (error: any) {
    console.error('❌ Error in business overdraft repayment:', error);
    return res.status(500).json(standardResponse(
      false,
      "Failed to process overdraft repayment",
      null,
      { code: "REPAYMENT_FAILED", message: error.message }
    ));
  }
};

/**
 * Get credit assessment and limits
 */
export const getBusinessCreditAssessment = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) {
      return res.status(401).json(standardResponse(
        false,
        "Authentication required",
        null,
        { code: "AUTH_REQUIRED", message: "Please login to view credit assessment" }
      ));
    }

    const businessId = String(req.params.businessId);
    
    if (!businessId) {
      return res.status(400).json(standardResponse(
        false,
        "Business ID required",
        null,
        { code: "MISSING_BUSINESS_ID", message: "Business ID is required" }
      ));
    }

    const assessment = await BusinessCreditService.assessCredit(businessId);

    return res.status(200).json(standardResponse(
      true,
      "Credit assessment retrieved successfully",
      {
        creditScore: assessment.creditScore,
        riskLevel: assessment.riskLevel,
        creditLimit: assessment.creditLimit,
        availableCredit: assessment.availableCredit,
        currentCredit: assessment.currentCredit,
        totalVolume: assessment.totalVolume,
        monthlyVolume: assessment.monthlyVolume,
        paymentSuccessRate: assessment.paymentSuccessRate,
        recommendations: assessment.recommendations
      }
    ));

  } catch (error: any) {
    console.error('❌ Error in credit assessment:', error);
    return res.status(500).json(standardResponse(
      false,
      "Failed to retrieve credit assessment",
      null,
      { code: "ASSESSMENT_FAILED", message: error.message }
    ));
  }
};

/**
 * Toggle overdraft facility
 */
export const toggleBusinessOverdraft = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) {
      return res.status(401).json(standardResponse(
        false,
        "Authentication required",
        null,
        { code: "AUTH_REQUIRED", message: "Please login to toggle overdraft" }
      ));
    }

    const { businessId, enabled } = req.body;
    
    if (!businessId || typeof enabled !== 'boolean') {
      return res.status(400).json(standardResponse(
        false,
        "Missing required fields",
        null,
        { code: "MISSING_FIELDS", message: "Business ID and enabled status are required" }
      ));
    }

    await BusinessCreditService.toggleOverdraft(
      businessId,
      enabled,
      req.user._id.toString()
    );

    return res.status(200).json(standardResponse(
      true,
      `Overdraft facility ${enabled ? 'enabled' : 'disabled'} successfully`,
      { enabled }
    ));

  } catch (error: any) {
    console.error('❌ Error toggling overdraft:', error);
    return res.status(500).json(standardResponse(
      false,
      "Failed to toggle overdraft facility",
      null,
      { code: "TOGGLE_FAILED", message: error.message }
    ));
  }
};

/**
 * Get overdraft history
 */
export const getBusinessOverdraftHistory = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) {
      return res.status(401).json(standardResponse(
        false,
        "Authentication required",
        null,
        { code: "AUTH_REQUIRED", message: "Please login to view overdraft history" }
      ));
    }

    const businessId = String(req.params.businessId);
    
    if (!businessId) {
      return res.status(400).json(standardResponse(
        false,
        "Business ID required",
        null,
        { code: "MISSING_BUSINESS_ID", message: "Business ID is required" }
      ));
    }

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json(standardResponse(
        false,
        "Business not found",
        null,
        { code: "BUSINESS_NOT_FOUND", message: "Business account not found" }
      ));
    }

    if (business.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json(standardResponse(
        false,
        "Unauthorized access",
        null,
        { code: "UNAUTHORIZED", message: "You can only view your own business overdraft history" }
      ));
    }

    return res.status(200).json(standardResponse(
      true,
      "Overdraft history retrieved successfully",
      {
        overdraftHistory: business.overdraftHistory,
        currentCredit: business.currentCredit,
        availableCredit: business.availableCredit,
        creditLimit: business.creditLimit,
        overdraftEnabled: business.overdraftEnabled
      }
    ));

  } catch (error: any) {
    console.error('❌ Error getting overdraft history:', error);
    return res.status(500).json(standardResponse(
      false,
      "Failed to retrieve overdraft history",
      null,
      { code: "HISTORY_FAILED", message: error.message }
    ));
  }
};

export const getUnifiedUserProfile = async (req: Request, res: Response): Promise<Response> => {
  const userId = String(req.params.userId);

  if (!userId) {
    return res.status(400).send({ message: 'User ID is required!' });
  }

  try {
    const profile = await UserOptimizationService.getUnifiedUserProfile(userId);
    
    return res.json(standardResponse(
      true,
      `Found ${profile.totalBusinesses} business accounts for user`,
      {
        user: {
          id: profile.user._id,
          phoneNumber: profile.user.phoneNumber,
          email: profile.user.email,
          walletAddress: profile.user.walletAddress,
          role: profile.user.role,
          isVerified: profile.user.isVerified,
          authMethods: profile.user.authMethods,
          hasPassword: !!profile.user.password,
          hasPhoneNumber: !!profile.user.phoneNumber
        },
        businessAccounts: profile.businessAccounts.map(business => ({
          id: business._id,
          businessName: business.businessName,
          merchantId: business.merchantId,
          walletAddress: business.walletAddress,
          creditLimit: business.creditLimit,
          availableCredit: business.availableCredit,
          isVerified: business.isVerified,
          createdAt: business.createdAt
        })),
        totalBusinesses: profile.totalBusinesses
      }
    ));

  } catch (error) {
    console.error("❌ Error getting unified user profile:");
    return handleError(error, res, 'Failed to get unified user profile.');
  }
};

export const getBusinessesByPhone = async (req: Request, res: Response): Promise<Response> => {
  const phoneNumber = String(req.params.phoneNumber);

  if (!phoneNumber) {
    return res.status(400).send({ message: 'Phone number is required!' });
  }

  try {
    const result = await UserOptimizationService.getBusinessesByPhone(phoneNumber);
    
    return res.json(standardResponse(
      true,
      result.message,
      {
        businesses: result.businesses?.map(business => ({
          id: business._id,
          businessName: business.businessName,
          merchantId: business.merchantId,
          walletAddress: business.walletAddress,
          creditLimit: business.creditLimit,
          availableCredit: business.availableCredit,
          isVerified: business.isVerified,
          createdAt: business.createdAt
        })) || [],
        totalBusinesses: result.businesses?.length || 0
      }
    ));

  } catch (error) {
    console.error('❌ Error getting businesses by phone:', error);
    return handleError(error, res, 'Failed to get businesses by phone.');
  }
};
