import { Request, Response } from 'express';
import { ThirdwebSDK } from '@thirdweb-dev/sdk';
import { Business } from '../models/businessModel';
import { User } from '../models/models';
import { Escrow } from '../models/escrowModel';
import { createAccount, generateOTP, otpStore, SALT_ROUNDS } from '../services/auth';
import { handleError, standardResponse } from '../services/utils';
import config from '../config/env';
import * as bcrypt from 'bcryptjs';
import { getTokenConfig, getSupportedTokens } from '../config/tokens';
import { sendToken, getAllTokenTransferEvents } from '../services/token';
import { client } from '../services/auth';
import { defineChain, getContract, readContract } from "thirdweb";
import { Chain, TokenSymbol } from '../services/token';
import { initializePlatformWallets, sendFromPlatformWallet } from '../services/platformWallet';
import { BusinessCreditService } from '../services/businessCreditService';
import { SMSService } from '../services/smsService';
import { UserOptimizationService } from '../services/userOptimizationService';
import { registerVerifiedSession, invalidateSession } from '../middleware/strictAuthMiddleware';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

// Define interface for token transfer events
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

// Utility: Generate Unique Merchant ID (Borderless Till Number)
function generateMerchantId(): string {
  const timestamp = Date.now().toString().slice(-5);
  const randomDigits = Math.floor(10000 + Math.random() * 90000).toString();
  return `NX-${timestamp}${randomDigits}`;
}

// Utility: Generate Unique Business Code
function generateUniqueCode(): string {
  const timestamp = Date.now().toString().slice(-8);
  const randomDigits = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `NEXUS${timestamp}${randomDigits}`;
}

// Step 1: Request Business Creation (Sends OTP)
export const requestBusinessCreation = async (req: Request, res: Response): Promise<Response> => {
  const { userId, phoneNumber, businessName, ownerName, location, businessType } = req.body;

  if (!userId || !phoneNumber || !businessName || !ownerName || !location || !businessType) {
    return res.status(400).send({ message: 'All fields are required!' });
  }

  try {
    // Use optimization service to validate user and business creation
    const validation = await UserOptimizationService.validateBusinessCreation(userId, phoneNumber, businessName);
    
    if (!validation.canCreate) {
      return res.status(400).send({ message: validation.message });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send({ message: 'User not found. Please create a personal account first.' });
    }

    // Check if business name already exists
    const existingBusiness = await Business.findOne({ businessName });
    if (existingBusiness) {
      return res.status(409).send({ message: 'A business with this name already exists.' });
    }

    // Generate OTP for verification
    const otp = generateOTP();
    otpStore[phoneNumber] = otp;

    console.log(`✅ Business Creation OTP for ${phoneNumber}: ${otp}`);

    // Send OTP via SMS with better error handling
    try {
      console.log(`📱 Attempting to send business OTP to: ${phoneNumber} (type: ${typeof phoneNumber})`);
      const smsSent = await SMSService.sendOTP(phoneNumber, otp, 'business_creation');
      
      if (!smsSent) {
        console.error(`❌ Failed to send business OTP SMS to ${phoneNumber}`);
        return res.status(500).send({ message: 'Failed to send OTP. Please try again.' });
      }
      
      console.log(`✅ Business OTP SMS sent successfully to ${phoneNumber}`);
    } catch (smsError) {
      console.error(`❌ Error sending business OTP SMS to ${phoneNumber}:`, smsError);
      return res.status(500).send({ message: 'Failed to send OTP. Please try again.' });
    }

    return res.send({ 
      message: 'OTP sent successfully. Please verify to complete business creation.',
      existingBusinesses: validation.existingBusinesses?.length || 0
    });

  } catch (error) {
    console.error('❌ Error in business creation request:', error);
    return handleError(error, res, 'Failed to process business creation request.');
  }
};

// Step 2: Complete Business Creation (Creates Business Wallet)
export const completeBusinessCreation = async (req: Request, res: Response): Promise<Response> => {
  const { userId, phoneNumber, otp, businessName, ownerName, location, businessType } = req.body;

  if (!userId || !phoneNumber || !otp || !businessName || !ownerName || !location || !businessType) {
    return res.status(400).send({ message: 'All fields are required!' });
  }

  if (!otpStore[phoneNumber] || otpStore[phoneNumber] !== otp) {
    return res.status(400).send({ message: 'Invalid or expired OTP.' });
  }
  delete otpStore[phoneNumber]; // Clear OTP after verification

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send({ message: 'User not found. Please create a personal account first.' });
    }

    // Check if business name already exists
    const existingBusiness = await Business.findOne({ businessName });
    if (existingBusiness) {
      return res.status(409).send({ message: 'A business with this name already exists.' });
    }

    // Create Business Wallet Using Thirdweb SDK
    const { pk, walletAddress } = await createAccount();
    
    // Generate a unique merchant ID
    let merchantId;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 5;

    while (!isUnique && attempts < maxAttempts) {
      merchantId = generateMerchantId();
      // Check if merchant ID already exists
      const existingMerchantId = await Business.findOne({ merchantId });
      if (!existingMerchantId) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      throw new Error('Failed to generate unique merchant ID after multiple attempts');
    }

    // Generate a unique business code
    let uniqueCode;
    let isUniqueCode = false;
    let codeAttempts = 0;
    const maxCodeAttempts = 5;

    while (!isUniqueCode && codeAttempts < maxCodeAttempts) {
      uniqueCode = generateUniqueCode();
      // Check if unique code already exists
      const existingUniqueCode = await Business.findOne({ uniqueCode });
      if (!existingUniqueCode) {
        isUniqueCode = true;
      }
      codeAttempts++;
    }

    if (!isUniqueCode) {
      throw new Error('Failed to generate unique business code after multiple attempts');
    }

    const business = new Business({
      businessName,
      ownerName,
      location,
      businessType,
      phoneNumber,
      merchantId,
      uniqueCode,
      walletAddress,
      privateKey: pk,
      userId: user._id,
      creditLimit: 100.0,
      availableCredit: 100.0,
      overdraftEnabled: false
    });

    await business.save();

    // Send business creation SMS notification
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

// Get business details for authenticated user
export const getBusinessDetails = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) {
      return res.status(401).send({ message: 'Authentication required' });
    }

    const business = await Business.findOne({ userId: req.user._id });
    if (!business) {
      return res.status(404).send({ message: 'No business found for this user' });
    }

    // Return business details without sensitive information
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

// Get business by merchant ID
export const getBusinessByMerchantId = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { merchantId } = req.params;
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

// Check Business Account Status and Details
export const checkBusinessStatus = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        error: { code: 'AUTH_REQUIRED', message: 'Please login to check business status' }
      });
    }

    // Find business account for the user
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

    // Get transaction history for the business wallet
    const transactions = await getAllTokenTransferEvents('arbitrum', business.walletAddress);

    // Format transaction data
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

// Handle OTP verification for external transfers
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

    // Verify OTP
    if (!otpStore[business.phoneNumber] || otpStore[business.phoneNumber] !== otp) {
      return res.status(400).send({ message: 'Invalid or expired OTP.' });
    }
    delete otpStore[business.phoneNumber];

    const sdk = ThirdwebSDK.fromPrivateKey(
      business.privateKey,
      config.arbitrum.chainId,
      { secretKey: config.THIRDWEB_SECRET_KEY }
    );

    const businessWallet = sdk.wallet;

    // Transfer funds to external wallet
    const tx = await businessWallet.transfer(destinationAddress, amount);

    console.log(`✅ Business External Transfer: ${tx.receipt.transactionHash}`);
    console.log(`From: ${business.walletAddress}`);
    console.log(`To: ${destinationAddress}`);
    console.log(`Amount: ${amount}`);

    return res.send({
      success: true,
      message: 'Funds transferred successfully to external wallet!',
      data: {
        transactionHash: tx.receipt.transactionHash,
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

// ========================================
// 🏦 BUSINESS OVERDRAFT/LOAN ENDPOINTS
// ========================================

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
    console.error('❌ Error in business overdraft request:', error);
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

    const { businessId } = req.params;
    
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

    const { businessId } = req.params;
    
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

// Get unified user profile with all business accounts
export const getUnifiedUserProfile = async (req: Request, res: Response): Promise<Response> => {
  const { userId } = req.params;

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
    console.error('❌ Error getting unified user profile:', error);
    return handleError(error, res, 'Failed to get unified user profile.');
  }
};

// Get all business accounts for a phone number
export const getBusinessesByPhone = async (req: Request, res: Response): Promise<Response> => {
  const { phoneNumber } = req.params;

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

// ========================================
// 🔐 BUSINESS AUTH (OTP) ENDPOINTS
// ========================================

export const requestBusinessAuthOtp = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Debug logging
    console.log('🔍 BUSINESS AUTH REQUEST DEBUG:');
    console.log('Headers received:', req.headers);
    console.log('Authorization header:', req.headers.authorization);
    console.log('User from token:', req.user);
    console.log('Request body:', req.body);
    
    if (!req.user) {
      console.log('❌ No user found in request - auth middleware failed');
      return res.status(401).json(standardResponse(
        false,
        'Authentication required',
        null,
        { code: 'AUTH_REQUIRED', message: 'Authentication token is required' }
      ));
    }

    const { phoneNumber, context } = req.body || {};

    if (!phoneNumber || !/^\+[1-9]\d{1,14}$/.test(phoneNumber)) {
      return res.status(400).json(standardResponse(
        false,
        'Invalid phone number format',
        null,
        { code: 'INVALID_PHONE_FORMAT', message: 'Provide E.164 phone number' }
      ));
    }

    const allowedContexts = ['business_creation', 'business_action'];
    if (!context || !allowedContexts.includes(context)) {
      return res.status(400).json(standardResponse(
        false,
        'Missing or invalid context',
        null,
        { code: 'MISSING_FIELDS', message: `context must be one of: ${allowedContexts.join(', ')}` }
      ));
    }

    // Generate and send OTP
    const otp = generateOTP();
    otpStore[`${phoneNumber}:${context}`] = otp;

    // Log for dev/testing
    console.log(`🔑 BUSINESS AUTH OTP for ${phoneNumber} [${context}]: ${otp}`);

    const sent = await SMSService.sendOTP(phoneNumber, otp, context);
    if (!sent) {
      return res.status(500).json(standardResponse(
        false,
        'Failed to send OTP. Please try again.',
        null,
        { code: 'OTP_NOT_SENT', message: 'SMS service unavailable' }
      ));
    }

    return res.status(200).json(standardResponse(
      true,
      'OTP sent successfully. Please verify to continue.',
      { phoneNumber, otpExpiry: '5 minutes', context }
    ));
  } catch (error: any) {
    console.error('❌ Error in requestBusinessAuthOtp:', error);
    return res.status(500).json(standardResponse(
      false,
      'Internal error requesting OTP',
      null,
      { code: 'INTERNAL_ERROR', message: error.message }
    ));
  }
};

export const verifyBusinessAuthOtp = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) {
      return res.status(401).json(standardResponse(
        false,
        'Authentication required',
        null,
        { code: 'AUTH_REQUIRED', message: 'Authentication token is required' }
      ));
    }

    const { phoneNumber, otp, context } = req.body || {};

    if (!phoneNumber || !otp || !context) {
      return res.status(400).json(standardResponse(
        false,
        'Phone number, OTP and context are required',
        null,
        { code: 'MISSING_FIELDS', message: 'phoneNumber, otp, context are required' }
      ));
    }

    if (!/^\d{6}$/.test(String(otp))) {
      return res.status(400).json(standardResponse(
        false,
        'Invalid OTP format',
        null,
        { code: 'INVALID_OTP', message: 'OTP must be 6 digits' }
      ));
    }

    const key = `${phoneNumber}:${context}`;
    const stored = otpStore[key];
    if (!stored) {
      return res.status(410).json(standardResponse(
        false,
        'OTP expired or not requested',
        null,
        { code: 'OTP_EXPIRED', message: 'Request a new OTP' }
      ));
    }

    if (stored !== String(otp)) {
      return res.status(400).json(standardResponse(
        false,
        'Invalid OTP',
        null,
        { code: 'INVALID_OTP', message: 'Provided OTP does not match' }
      ));
    }

    // OTP is valid; clear it and register verified session for strict endpoints
    delete otpStore[key];

    // Use the same token that came in Authorization header to mark session verified
    const authHeader = req.headers.authorization as string;
    const token = authHeader?.split(' ')[1];
    if (token) {
      registerVerifiedSession(token, req.user._id.toString());
    }

    return res.status(200).json(standardResponse(
      true,
      'OTP verified. Session elevated for business actions.',
      {
        session: {
          verified: true,
          verifiedAt: new Date().toISOString(),
          expiresIn: '4h',
          context
        }
      }
    ));
  } catch (error: any) {
    console.error('❌ Error in verifyBusinessAuthOtp:', error);
    return res.status(500).json(standardResponse(
      false,
      'Internal error verifying OTP',
      null,
      { code: 'INTERNAL_ERROR', message: error.message }
    ));
  }
};

export const getBusinessAuthSession = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) {
      return res.status(401).json(standardResponse(
        false,
        'Authentication required',
        null,
        { code: 'AUTH_REQUIRED', message: 'Authentication token is required' }
      ));
    }

    return res.status(200).json(standardResponse(
      true,
      'Session status retrieved',
      {
        session: {
          // expose minimal info; strict middleware ultimately enforces this
          verified: true
        }
      }
    ));
  } catch (error: any) {
    console.error('❌ Error in getBusinessAuthSession:', error);
    return res.status(500).json(standardResponse(
      false,
      'Authentication error',
      null,
      { code: 'AUTH_ERROR', message: error.message }
    ));
  }
};

export const logoutBusinessAuth = async (req: Request, res: Response): Promise<Response> => {
  try {
    const authHeader = req.headers.authorization as string | undefined;
    const token = authHeader?.split(' ')[1];
    if (token) {
      invalidateSession(token);
    }

    return res.status(200).json(standardResponse(
      true,
      'Business session invalidated successfully.',
      null
    ));
  } catch (error: any) {
    console.error('❌ Error in logoutBusinessAuth:', error);
    return res.status(500).json(standardResponse(
      false,
      'Authentication error',
      null,
      { code: 'AUTH_ERROR', message: error.message }
    ));
  }
};

// =============================
// Business v2 (Independent Flow)
// =============================

export const requestBusinessV2Otp = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { phoneNumber } = req.body || {};
    if (!phoneNumber || !/^\+[1-9]\d{1,14}$/.test(phoneNumber)) {
      return res.status(400).json(standardResponse(false, 'Invalid phone number format', null, { code: 'INVALID_PHONE_FORMAT', message: 'Provide E.164 phone number' }));
    }

    const otp = generateOTP();
    otpStore[`bizv2:${phoneNumber}`] = otp;
    console.log(`🔑 BUSINESS V2 OTP for ${phoneNumber}: ${otp}`);
    const sent = await SMSService.sendOTP(phoneNumber, otp, 'business_v2_create');
    if (!sent) {
      return res.status(500).json(standardResponse(false, 'Failed to send OTP. Please try again.', null, { code: 'OTP_NOT_SENT' }));
    }

    return res.status(200).json(standardResponse(true, 'OTP sent successfully. Please verify to continue.', { phoneNumber, otpExpiry: '5 minutes' }));
  } catch (error: any) {
    console.error('❌ Error in requestBusinessV2Otp:', error);
    return res.status(500).json(standardResponse(false, 'Internal error', null, { code: 'INTERNAL_ERROR', message: error.message }));
  }
};

export const createBusinessV2 = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { userId, businessName, ownerName, phoneNumber, location, businessType, otp } = req.body || {};

    if (!userId || !businessName || !ownerName || !phoneNumber || !location || !businessType || !otp) {
      return res.status(400).json(standardResponse(false, 'Missing required fields', null, { code: 'MISSING_FIELDS' }));
    }

    if (!/^\d{6}$/.test(String(otp))) {
      return res.status(400).json(standardResponse(false, 'Invalid OTP', null, { code: 'INVALID_OTP' }));
    }

    // Verify OTP
    const key = `bizv2:${phoneNumber}`;
    if (otpStore[key] !== String(otp)) {
      return res.status(400).json(standardResponse(false, 'Invalid or expired OTP', null, { code: 'INVALID_OTP' }));
    }
    delete otpStore[key];

    // Ensure user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json(standardResponse(false, 'User not found', null, { code: 'USER_NOT_FOUND' }));
    }

    // Ensure business name unique per user
    const existingByName = await Business.findOne({ userId, businessName });
    if (existingByName) {
      return res.status(409).json(standardResponse(false, 'A business with this name already exists for this user.', null, { code: 'BUSINESS_NAME_EXISTS' }));
    }

    // Generate unique merchantId
    let merchantId = '';
    for (let i = 0; i < 7; i++) {
      const candidate = generateMerchantId();
      const exists = await Business.findOne({ merchantId: candidate });
      if (!exists) { merchantId = candidate; break; }
    }
    if (!merchantId) {
      return res.status(500).json(standardResponse(false, 'Failed to allocate merchantId', null, { code: 'CREATE_FAILED' }));
    }

    // Generate unique business code
    let uniqueCode = '';
    for (let i = 0; i < 7; i++) {
      const candidate = generateUniqueCode();
      const exists = await Business.findOne({ uniqueCode: candidate });
      if (!exists) { uniqueCode = candidate; break; }
    }
    if (!uniqueCode) {
      return res.status(500).json(standardResponse(false, 'Failed to allocate uniqueCode', null, { code: 'CREATE_FAILED' }));
    }

    // Create wallet for business
    const { pk, walletAddress } = await createAccount();

    const business = new Business({
      businessName,
      ownerName,
      location,
      businessType,
      phoneNumber,
      merchantId,
      uniqueCode,
      walletAddress,
      privateKey: pk,
      userId: user._id,
      creditLimit: 100.0,
      availableCredit: 100.0,
      overdraftEnabled: false
    });

    await business.save();

    return res.status(201).json(standardResponse(true, 'Business created successfully', {
      businessId: business._id,
      merchantId: business.merchantId,
      walletAddress: business.walletAddress,
      businessName: business.businessName,
      ownerName: business.ownerName
    }));
  } catch (error: any) {
    console.error('❌ Error in createBusinessV2:', error);
    return res.status(500).json(standardResponse(false, 'Failed to create business', null, { code: 'CREATE_FAILED', message: error.message }));
  }
};

export const resolveMerchantV2 = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { merchantId } = req.params;
    if (!merchantId) {
      return res.status(400).json(standardResponse(false, 'Merchant ID required', null, { code: 'MISSING_FIELDS' }));
    }

    const business = await Business.findOne({ merchantId });
    if (!business) {
      return res.status(404).json(standardResponse(false, 'Business not found', null, { code: 'BUSINESS_NOT_FOUND' }));
    }

    return res.status(200).json(standardResponse(true, 'Merchant resolved', {
      merchantId: business.merchantId,
      walletAddress: business.walletAddress,
      businessName: business.businessName
    }));
  } catch (error: any) {
    console.error('❌ Error in resolveMerchantV2:', error);
    return res.status(500).json(standardResponse(false, 'Internal error', null, { code: 'INTERNAL_ERROR', message: error.message }));
  }
};

// =============================
// Business v2 - Forgot Password (owner's personal account)
// =============================

export const requestBusinessPasswordResetV2 = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { merchantId, phoneNumber } = req.body || {};

    if (!merchantId && !phoneNumber) {
      return res.status(400).json(standardResponse(false, 'Provide merchantId or phoneNumber', null, { code: 'MISSING_FIELDS' }));
    }

    let business: any = null;
    if (merchantId) {
      business = await Business.findOne({ merchantId });
    } else if (phoneNumber) {
      business = await Business.findOne({ phoneNumber });
    }

    if (!business) {
      return res.status(404).json(standardResponse(false, 'Business not found', null, { code: 'BUSINESS_NOT_FOUND' }));
    }

    // Send OTP to the owner phone (business.phoneNumber)
    const otp = generateOTP();
    const ownerPhone = business.phoneNumber;
    otpStore[`bizpwd:${ownerPhone}`] = otp;

    console.log(`🔑 BUSINESS PASSWORD RESET OTP for ${ownerPhone}: ${otp}`);
    const sent = await SMSService.sendOTP(ownerPhone, otp, 'business_password_reset');
    if (!sent) {
      return res.status(500).json(standardResponse(false, 'Failed to send OTP', null, { code: 'OTP_NOT_SENT' }));
    }

    return res.status(200).json(standardResponse(true, 'Password reset OTP sent', { phoneNumber: ownerPhone, otpExpiry: '5 minutes' }));
  } catch (error: any) {
    console.error('❌ Error in requestBusinessPasswordResetV2:', error);
    return res.status(500).json(standardResponse(false, 'Internal error', null, { code: 'INTERNAL_ERROR', message: error.message }));
  }
};

export const resetBusinessPasswordV2 = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { merchantId, phoneNumber, otp, newPassword } = req.body || {};

    if ((!merchantId && !phoneNumber) || !otp || !newPassword) {
      return res.status(400).json(standardResponse(false, 'Missing required fields', null, { code: 'MISSING_FIELDS' }));
    }

    if (!/^\d{6}$/.test(String(otp))) {
      return res.status(400).json(standardResponse(false, 'Invalid OTP', null, { code: 'INVALID_OTP' }));
    }

    let business: any = null;
    if (merchantId) {
      business = await Business.findOne({ merchantId });
    } else if (phoneNumber) {
      business = await Business.findOne({ phoneNumber });
    }

    if (!business) {
      return res.status(404).json(standardResponse(false, 'Business not found', null, { code: 'BUSINESS_NOT_FOUND' }));
    }

    const ownerPhone = business.phoneNumber;
    const key = `bizpwd:${ownerPhone}`;
    const stored = otpStore[key];
    if (!stored || stored !== String(otp)) {
      return res.status(400).json(standardResponse(false, 'Invalid or expired OTP', null, { code: 'INVALID_OTP' }));
    }

    // Clear OTP after successful verification
    delete otpStore[key];

    // Reset password on the linked personal account (owner user)
    const user = await User.findById(business.userId);
    if (!user) {
      return res.status(404).json(standardResponse(false, 'User not found', null, { code: 'USER_NOT_FOUND' }));
    }

    const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
    user.password = hashed;
    await user.save();

    return res.status(200).json(standardResponse(true, 'Password reset successful for business owner account', { userId: user._id, phoneNumber: user.phoneNumber }));
  } catch (error: any) {
    console.error('❌ Error in resetBusinessPasswordV2:', error);
    return res.status(500).json(standardResponse(false, 'Internal error', null, { code: 'INTERNAL_ERROR', message: error.message }));
  }
};

// =============================
// Business PIN (6-digit)
// =============================

const isValidPin = (pin: string): boolean => /^\d{6}$/.test(pin);

// Public PIN set endpoint (no auth required)
export const setBusinessPinPublic = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { merchantId, phoneNumber, otp, pin } = req.body || {};
    if ((!merchantId && !phoneNumber) || !otp || !pin) {
      return res.status(400).json(standardResponse(false, 'Missing required fields', null, { code: 'MISSING_FIELDS' }));
    }
    if (!isValidPin(String(pin))) {
      return res.status(400).json(standardResponse(false, 'Invalid PIN format', null, { code: 'INVALID_PIN' }));
    }
    
    // Find business by merchantId or phoneNumber
    let business: any = null;
    if (merchantId) business = await Business.findOne({ merchantId });
    else business = await Business.findOne({ phoneNumber });
    
    if (!business) {
      return res.status(404).json(standardResponse(false, 'Business not found', null, { code: 'BUSINESS_NOT_FOUND' }));
    }
    
    // Verify OTP
    const key = `bizpin:${business.phoneNumber}`;
    if (!otpStore[key] || otpStore[key] !== String(otp)) {
      return res.status(400).json(standardResponse(false, 'Invalid or expired OTP', null, { code: 'INVALID_OTP' }));
    }
    
    // Clear OTP after use
    delete otpStore[key];
    
    // Set PIN using findOneAndUpdate to avoid validation issues
    const hash = await bcrypt.hash(String(pin), 10);
    const updatedBusiness = await Business.findOneAndUpdate(
      { _id: business._id },
      { 
        pinHash: hash,
        pinSetAt: new Date()
      },
      { new: true }
    );
    
    return res.status(200).json(standardResponse(true, 'PIN set successfully', { businessId: business._id }));
  } catch (error: any) {
    console.error('❌ Error in setBusinessPinPublic:', error);
    return res.status(500).json(standardResponse(false, 'Internal error', null, { code: 'PIN_SET_FAILED', message: error.message }));
  }
};

// Authenticated PIN set endpoint (for logged-in users)
export const setBusinessPin = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) {
      return res.status(403).json(standardResponse(false, 'Unauthorized', null, { code: 'UNAUTHORIZED' }));
    }
    const { businessId, pin } = req.body || {};
    if (!businessId || !pin) {
      return res.status(400).json(standardResponse(false, 'Missing required fields', null, { code: 'MISSING_FIELDS' }));
    }
    if (!isValidPin(String(pin))) {
      return res.status(400).json(standardResponse(false, 'Invalid PIN format', null, { code: 'INVALID_PIN' }));
    }
    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json(standardResponse(false, 'Business not found', null, { code: 'BUSINESS_NOT_FOUND' }));
    }
    if (business.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json(standardResponse(false, 'Unauthorized', null, { code: 'UNAUTHORIZED' }));
    }
    if (business.pinHash) {
      return res.status(409).json(standardResponse(false, 'PIN already set', null, { code: 'PIN_ALREADY_SET' }));
    }
    const hash = await bcrypt.hash(String(pin), 10);
    await Business.findOneAndUpdate(
      { _id: business._id },
      { 
        pinHash: hash,
        pinSetAt: new Date()
      }
    );
    return res.status(200).json(standardResponse(true, 'PIN set successfully', null));
  } catch (error: any) {
    console.error('❌ Error in setBusinessPin:', error);
    return res.status(500).json(standardResponse(false, 'Internal error', null, { code: 'PIN_SET_FAILED', message: error.message }));
  }
};

export const updateBusinessPin = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) {
      return res.status(403).json(standardResponse(false, 'Unauthorized', null, { code: 'UNAUTHORIZED' }));
    }
    const { businessId, oldPin, newPin } = req.body || {};
    if (!businessId || !oldPin || !newPin) {
      return res.status(400).json(standardResponse(false, 'Missing required fields', null, { code: 'MISSING_FIELDS' }));
    }
    if (!isValidPin(String(newPin))) {
      return res.status(400).json(standardResponse(false, 'Invalid PIN format', null, { code: 'INVALID_PIN' }));
    }
    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json(standardResponse(false, 'Business not found', null, { code: 'BUSINESS_NOT_FOUND' }));
    }
    if (business.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json(standardResponse(false, 'Unauthorized', null, { code: 'UNAUTHORIZED' }));
    }
    if (!business.pinHash) {
      return res.status(401).json(standardResponse(false, 'PIN not set', null, { code: 'PIN_NOT_SET' }));
    }
    const matches = await bcrypt.compare(String(oldPin), business.pinHash);
    if (!matches) {
      return res.status(401).json(standardResponse(false, 'Wrong PIN', null, { code: 'WRONG_PIN' }));
    }
    const newHash = await bcrypt.hash(String(newPin), 10);
    await Business.findOneAndUpdate(
      { _id: business._id },
      { 
        pinHash: newHash,
        pinSetAt: new Date()
      }
    );
    return res.status(200).json(standardResponse(true, 'PIN updated successfully', null));
  } catch (error: any) {
    console.error('❌ Error in updateBusinessPin:', error);
    return res.status(500).json(standardResponse(false, 'Internal error', null, { code: 'PIN_UPDATE_FAILED', message: error.message }));
  }
};

// In-memory short-lived guards (replace with Redis in production)
const transactionPinGuards: Record<string, { businessId: string; expiresAt: number }> = {};

export const verifyBusinessPin = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) {
      return res.status(403).json(standardResponse(false, 'Unauthorized', null, { code: 'UNAUTHORIZED' }));
    }
    const { businessId, pin } = req.body || {};
    if (!businessId || !pin) {
      return res.status(400).json(standardResponse(false, 'Missing required fields', null, { code: 'MISSING_FIELDS' }));
    }
    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json(standardResponse(false, 'Business not found', null, { code: 'BUSINESS_NOT_FOUND' }));
    }
    if (business.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json(standardResponse(false, 'Unauthorized', null, { code: 'UNAUTHORIZED' }));
    }
    if (!business.pinHash) {
      return res.status(401).json(standardResponse(false, 'PIN not set', null, { code: 'PIN_NOT_SET' }));
    }
    const matches = await bcrypt.compare(String(pin), business.pinHash);
    if (!matches) {
      return res.status(401).json(standardResponse(false, 'Wrong PIN', null, { code: 'WRONG_PIN' }));
    }
    // Session-like response (client can hold flag for 30m)
    return res.status(200).json(standardResponse(true, 'PIN verified', { verified: true, verifiedAt: new Date().toISOString(), expiresIn: '30m' }));
  } catch (error: any) {
    console.error('❌ Error in verifyBusinessPin:', error);
    return res.status(500).json(standardResponse(false, 'Internal error', null, { code: 'PIN_VERIFY_FAILED', message: error.message }));
  }
};

export const verifyBusinessPinForTransaction = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) {
      return res.status(403).json(standardResponse(false, 'Unauthorized', null, { code: 'UNAUTHORIZED' }));
    }
    const { businessId, pin, intent } = req.body || {};
    if (!businessId || !pin || !intent) {
      return res.status(400).json(standardResponse(false, 'Missing required fields', null, { code: 'MISSING_FIELDS' }));
    }
    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json(standardResponse(false, 'Business not found', null, { code: 'BUSINESS_NOT_FOUND' }));
    }
    if (business.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json(standardResponse(false, 'Unauthorized', null, { code: 'UNAUTHORIZED' }));
    }
    if (!business.pinHash) {
      return res.status(401).json(standardResponse(false, 'PIN not set', null, { code: 'PIN_NOT_SET' }));
    }
    const matches = await bcrypt.compare(String(pin), business.pinHash);
    if (!matches) {
      return res.status(401).json(standardResponse(false, 'Wrong PIN', null, { code: 'WRONG_PIN' }));
    }
    // Generate short-lived guard id
    const guardId = `tguard_${Math.random().toString(36).slice(2, 10)}`;
    transactionPinGuards[guardId] = { businessId: business._id.toString(), expiresAt: Date.now() + 5 * 60 * 1000 };
    return res.status(200).json(standardResponse(true, 'PIN verified for transaction', { transactionGuard: { id: guardId, expiresIn: '5m' } }));
  } catch (error: any) {
    console.error('❌ Error in verifyBusinessPinForTransaction:', error);
    return res.status(500).json(standardResponse(false, 'Internal error', null, { code: 'PIN_VERIFY_FAILED', message: error.message }));
  }
};

export const requestForgotBusinessPin = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { merchantId, phoneNumber } = req.body || {};
    if (!merchantId && !phoneNumber) {
      return res.status(400).json(standardResponse(false, 'Provide merchantId or phoneNumber', null, { code: 'MISSING_FIELDS' }));
    }
    let business: any = null;
    if (merchantId) business = await Business.findOne({ merchantId });
    else business = await Business.findOne({ phoneNumber });
    if (!business) {
      return res.status(404).json(standardResponse(false, 'Business not found', null, { code: 'BUSINESS_NOT_FOUND' }));
    }
    const otp = generateOTP();
    const ownerPhone = business.phoneNumber;
    otpStore[`bizpin:${ownerPhone}`] = otp;
    console.log(`🔑 BUSINESS PIN RESET OTP for ${ownerPhone}: ${otp}`);
    const sent = await SMSService.sendOTP(ownerPhone, otp, 'business_pin_reset');
    if (!sent) {
      return res.status(500).json(standardResponse(false, 'Failed to send OTP', null, { code: 'OTP_NOT_SENT' }));
    }
    return res.status(200).json(standardResponse(true, 'OTP sent', { phoneNumber: ownerPhone, otpExpiry: '5 minutes' }));
  } catch (error: any) {
    console.error('❌ Error in requestForgotBusinessPin:', error);
    return res.status(500).json(standardResponse(false, 'Internal error', null, { code: 'INTERNAL_ERROR', message: error.message }));
  }
};

// Request OTP for setting PIN (public endpoint)
export const requestBusinessPinOtp = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { merchantId, phoneNumber } = req.body || {};
    if (!merchantId && !phoneNumber) {
      return res.status(400).json(standardResponse(false, 'Provide merchantId or phoneNumber', null, { code: 'MISSING_FIELDS' }));
    }
    let business: any = null;
    if (merchantId) business = await Business.findOne({ merchantId });
    else business = await Business.findOne({ phoneNumber });
    if (!business) {
      return res.status(404).json(standardResponse(false, 'Business not found', null, { code: 'BUSINESS_NOT_FOUND' }));
    }
    const otp = generateOTP();
    const ownerPhone = business.phoneNumber;
    otpStore[`bizpin:${ownerPhone}`] = otp;
    console.log(`🔑 BUSINESS PIN SET OTP for ${ownerPhone}: ${otp}`);
    const sent = await SMSService.sendOTP(ownerPhone, otp, 'business_pin_set');
    if (!sent) {
      return res.status(500).json(standardResponse(false, 'Failed to send OTP', null, { code: 'OTP_NOT_SENT' }));
    }
    return res.status(200).json(standardResponse(true, 'OTP sent for PIN setup', { phoneNumber: ownerPhone, otpExpiry: '5 minutes' }));
  } catch (error: any) {
    console.error('❌ Error in requestBusinessPinOtp:', error);
    return res.status(500).json(standardResponse(false, 'Internal error', null, { code: 'INTERNAL_ERROR', message: error.message }));
  }
};

export const confirmForgotBusinessPin = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { merchantId, phoneNumber, otp, newPin } = req.body || {};
    if ((!merchantId && !phoneNumber) || !otp || !newPin) {
      return res.status(400).json(standardResponse(false, 'Missing required fields', null, { code: 'MISSING_FIELDS' }));
    }
    if (!isValidPin(String(newPin))) {
      return res.status(400).json(standardResponse(false, 'Invalid PIN format', null, { code: 'INVALID_PIN' }));
    }
    let business: any = null;
    if (merchantId) business = await Business.findOne({ merchantId });
    else business = await Business.findOne({ phoneNumber });
    if (!business) {
      return res.status(404).json(standardResponse(false, 'Business not found', null, { code: 'BUSINESS_NOT_FOUND' }));
    }
    const key = `bizpin:${business.phoneNumber}`;
    if (!otpStore[key] || otpStore[key] !== String(otp)) {
      return res.status(400).json(standardResponse(false, 'Invalid or expired OTP', null, { code: 'INVALID_OTP' }));
    }
    delete otpStore[key];
    const newHash = await bcrypt.hash(String(newPin), 10);
    await Business.findOneAndUpdate(
      { _id: business._id },
      { 
        pinHash: newHash,
        pinSetAt: new Date()
      }
    );
    return res.status(200).json(standardResponse(true, 'PIN reset successfully', null));
  } catch (error: any) {
    console.error('❌ Error in confirmForgotBusinessPin:', error);
    return res.status(500).json(standardResponse(false, 'Internal error', null, { code: 'PIN_RESET_FAILED', message: error.message }));
  }
};

// =============================
// List User's Business Accounts
// =============================

export const getUserBusinesses = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) {
      return res.status(401).json(standardResponse(false, 'Authentication required', null, { code: 'AUTH_REQUIRED' }));
    }

    const userId = req.user._id;
    console.log(`🔍 Fetching businesses for user: ${userId}`);

    // Find all businesses linked to this user
    const businesses = await Business.find({ userId }).select('-pinHash -paymentHistory -overdraftHistory');
    
    if (!businesses || businesses.length === 0) {
      return res.status(200).json(standardResponse(true, 'No business accounts found', { businesses: [] }));
    }

    // Format the response
    const formattedBusinesses = businesses.map(business => ({
      businessId: business._id,
      merchantId: business.merchantId,
      businessName: business.businessName,
      businessType: business.businessType,
      phoneNumber: business.phoneNumber,
      email: business.email,
      walletAddress: business.walletAddress,
      creditLimit: business.creditLimit,
      currentBalance: business.currentBalance,
      overdraftEnabled: business.overdraftEnabled,
      status: business.status,
      isVerified: business.isVerified,
      pinSet: !!business.pinHash,
      pinSetAt: business.pinSetAt,
      createdAt: business.createdAt,
      updatedAt: business.updatedAt
    }));

    return res.status(200).json(standardResponse(
      true, 
      `Found ${businesses.length} business account(s)`, 
      { 
        businesses: formattedBusinesses,
        totalCount: businesses.length
      }
    ));

  } catch (error: any) {
    console.error('❌ Error in getUserBusinesses:', error);
    return res.status(500).json(standardResponse(
      false, 
      'Internal server error', 
      null, 
      { code: 'INTERNAL_ERROR', message: error.message }
    ));
  }
};

// ========================================
// 💰 BUSINESS BALANCE & TRANSACTION ENDPOINTS
// ========================================

/**
 * Helper function to get comprehensive business balance data from real blockchain
 */
const getBusinessBalanceData = async (walletAddress: string) => {
  // Supported chains and tokens
  const supportedChains = {
    arbitrum: { name: 'Arbitrum', chainId: 42161, nativeToken: 'ETH' },
    base: { name: 'Base', chainId: 8453, nativeToken: 'ETH' },
    celo: { name: 'Celo', chainId: 42220, nativeToken: 'CELO' },
    polygon: { name: 'Polygon', chainId: 137, nativeToken: 'MATIC' },
    optimism: { name: 'Optimism', chainId: 10, nativeToken: 'ETH' }
  };

  const balances: any = {};
  let totalUSDValue = 0;
  let totalKESValue = 0;
  const activeChains: string[] = [];
  const totalTokens: any = {};

  console.log(`🔍 Fetching real blockchain balances for business wallet: ${walletAddress}`);

  // Fetch real balance data from blockchain
  for (const [chainId, chainInfo] of Object.entries(supportedChains)) {
    balances[chainId] = {};
    let chainTotalUSD = 0;
    let hasBalance = false;

    try {
      // Get supported tokens for this specific chain
      const chainTokens = getSupportedTokens(chainId as Chain);
      
      if (chainTokens.length === 0) continue;
      
      for (const token of chainTokens) {
        try {
          const tokenConfig = getTokenConfig(chainId as Chain, token as TokenSymbol);
          if (!tokenConfig) continue;

          const chainConfig = config[chainId];
          if (!chainConfig?.chainId) continue;

          const contract = getContract({
            client,
            chain: defineChain(chainConfig.chainId),
            address: tokenConfig.address,
          });

          const balance = await readContract({
            contract,
            method: "function balanceOf(address) view returns (uint256)",
            params: [walletAddress],
          });

          const balanceInToken = Number(balance) / 10 ** tokenConfig.decimals;
          const usdPrice = getTokenUSDPrice(token);
          const usdValue = balanceInToken * usdPrice;
          
          balances[chainId][token] = {
            balance: parseFloat(balanceInToken.toFixed(6)),
            usdValue: parseFloat(usdValue.toFixed(2)),
            kesValue: parseFloat((usdValue * 133.5).toFixed(2)),
            price: usdPrice
          };

          chainTotalUSD += usdValue;
          if (balanceInToken > 0) {
            hasBalance = true;
            if (!totalTokens[token]) {
              totalTokens[token] = 0;
            }
            totalTokens[token] += balanceInToken;
          }
        } catch (error: any) {
          console.error(`Failed to fetch ${token} balance on ${chainId}:`, error.message);
          // Set balance to 0 for failed tokens
          balances[chainId][token] = {
            balance: 0,
            usdValue: 0,
            kesValue: 0,
            price: getTokenUSDPrice(token)
          };
        }
      }

      if (hasBalance) {
        activeChains.push(chainId);
      }

      totalUSDValue += chainTotalUSD;
      totalKESValue += chainTotalUSD * 133.5;
    } catch (error: any) {
      console.error(`Failed to fetch balances for chain ${chainId}:`, error.message);
    }
  }

  console.log(`✅ Business balance fetch complete. Total USD: $${totalUSDValue.toFixed(2)}, Active chains: ${activeChains.length}`);

  return {
    balances,
    totalUSDValue: parseFloat(totalUSDValue.toFixed(2)),
    totalKESValue: parseFloat(totalKESValue.toFixed(2)),
    activeChains,
    totalTokens,
    summary: {
      totalChains: Object.keys(supportedChains).length,
      activeChainsCount: activeChains.length,
      totalTokensCount: Object.keys(totalTokens).length,
      supportedTokens: ['USDC', 'USDT', 'ETH', 'MATIC', 'CELO']
    }
  };
};

/**
 * Helper function to get business balance for specific chain from real blockchain
 */
const getBusinessChainBalanceData = async (walletAddress: string, chain: string) => {
  const chainInfo = {
    arbitrum: { name: 'Arbitrum', chainId: 42161, nativeToken: 'ETH', explorer: 'https://arbiscan.io' },
    base: { name: 'Base', chainId: 8453, nativeToken: 'ETH', explorer: 'https://basescan.org' },
    celo: { name: 'Celo', chainId: 42220, nativeToken: 'CELO', explorer: 'https://celoscan.io' },
    polygon: { name: 'Polygon', chainId: 137, nativeToken: 'MATIC', explorer: 'https://polygonscan.com' },
    optimism: { name: 'Optimism', chainId: 10, nativeToken: 'ETH', explorer: 'https://optimistic.etherscan.io' }
  };

  const balances: any = {};
  let totalUSDValue = 0;

  console.log(`🔍 Fetching real blockchain balances for ${chain} chain, wallet: ${walletAddress}`);

  try {
    // Get supported tokens for this specific chain
    const chainTokens = getSupportedTokens(chain as Chain);
    
    if (chainTokens.length === 0) {
      console.log(`No supported tokens found for chain: ${chain}`);
      return {
        chainInfo: chainInfo[chain as keyof typeof chainInfo] || null,
        balances: {},
        summary: {
          totalUSDValue: 0,
          totalKESValue: 0,
          tokensWithBalance: 0,
          supportedTokens: []
        }
      };
    }
    
    for (const token of chainTokens) {
      try {
        const tokenConfig = getTokenConfig(chain as Chain, token as TokenSymbol);
        if (!tokenConfig) continue;

        const chainConfig = config[chain];
        if (!chainConfig?.chainId) continue;

        const contract = getContract({
          client,
          chain: defineChain(chainConfig.chainId),
          address: tokenConfig.address,
        });

        const balance = await readContract({
          contract,
          method: "function balanceOf(address) view returns (uint256)",
          params: [walletAddress],
        });

        const balanceInToken = Number(balance) / 10 ** tokenConfig.decimals;
        const usdPrice = getTokenUSDPrice(token);
        const usdValue = balanceInToken * usdPrice;
        
        balances[token] = {
          balance: parseFloat(balanceInToken.toFixed(6)),
          usdValue: parseFloat(usdValue.toFixed(2)),
          kesValue: parseFloat((usdValue * 133.5).toFixed(2)),
          price: usdPrice,
          contractAddress: tokenConfig.address
        };

        totalUSDValue += usdValue;
      } catch (error: any) {
        console.error(`Failed to fetch ${token} balance on ${chain}:`, error.message);
        // Set balance to 0 for failed tokens
        balances[token] = {
          balance: 0,
          usdValue: 0,
          kesValue: 0,
          price: getTokenUSDPrice(token),
          contractAddress: getTokenContractAddress(chain, token)
        };
      }
    }
  } catch (error: any) {
    console.error(`Failed to fetch balances for chain ${chain}:`, error.message);
  }

  console.log(`✅ ${chain} balance fetch complete. Total USD: $${totalUSDValue.toFixed(2)}`);

  return {
    chainInfo: chainInfo[chain as keyof typeof chainInfo] || null,
    balances,
    summary: {
      totalUSDValue: parseFloat(totalUSDValue.toFixed(2)),
      totalKESValue: parseFloat((totalUSDValue * 133.5).toFixed(2)),
      tokensWithBalance: Object.keys(balances).filter(token => balances[token].balance > 0).length,
      supportedTokens: getSupportedTokens(chain as Chain)
    }
  };
};


/**
 * Helper function to get token USD price
 */
const getTokenUSDPrice = (token: string): number => {
  const prices: { [key: string]: number } = {
    'USDC': 1.00,
    'USDT': 1.00,
    'ETH': 2500.00,
    'MATIC': 0.85,
    'CELO': 0.45
  };
  return prices[token] || 0;
};

/**
 * Helper function to get token full name
 */
const getTokenFullName = (token: string): string => {
  const names: { [key: string]: string } = {
    'USDC': 'USD Coin',
    'USDT': 'Tether USD',
    'ETH': 'Ethereum',
    'MATIC': 'Polygon',
    'CELO': 'Celo'
  };
  return names[token] || token;
};

/**
 * Helper function to get token decimals
 */
const getTokenDecimals = (token: string): number => {
  const decimals: { [key: string]: number } = {
    'USDC': 6,
    'USDT': 6,
    'ETH': 18,
    'MATIC': 18,
    'CELO': 18
  };
  return decimals[token] || 18;
};

/**
 * Helper function to get token contract address
 */
const getTokenContractAddress = (chain: string, token: string): string => {
  const contracts: { [key: string]: { [key: string]: string } } = {
    arbitrum: {
      'USDC': '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      'USDT': '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      'ETH': '0x0000000000000000000000000000000000000000'
    },
    base: {
      'USDC': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      'USDT': '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
      'ETH': '0x0000000000000000000000000000000000000000'
    },
    celo: {
      'USDC': '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
      'USDT': '0x88eeC49252c8cbc039DCdB394c0c2BA2f1637EA0',
      'CELO': '0x0000000000000000000000000000000000000000'
    }
  };
  return contracts[chain]?.[token] || '0x0000000000000000000000000000000000000000';
};

/**
 * Get business crypto balance overview across all chains
 */
export const getBusinessBalance = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) {
      return res.status(401).json(standardResponse(
        false,
        'Authentication required',
        null,
        { code: 'AUTH_REQUIRED', message: 'Please login to view business balance' }
      ));
    }

    const { businessId } = req.params;
    
    if (!businessId) {
      return res.status(400).json(standardResponse(
        false,
        'Business ID required',
        null,
        { code: 'MISSING_BUSINESS_ID', message: 'Business ID is required' }
      ));
    }

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json(standardResponse(
        false,
        'Business not found',
        null,
        { code: 'BUSINESS_NOT_FOUND', message: 'Business account not found' }
      ));
    }

    if (business.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json(standardResponse(
        false,
        'Unauthorized access',
        null,
        { code: 'UNAUTHORIZED', message: 'You can only view your own business balance' }
      ));
    }

    // Get comprehensive balance data
    const balanceData = await getBusinessBalanceData(business.walletAddress);

    return res.json(standardResponse(
      true,
      'Business balance overview retrieved successfully',
      {
        businessId: business._id,
        businessName: business.businessName,
        merchantId: business.merchantId,
        walletAddress: business.walletAddress,
        overview: {
          totalUSDValue: balanceData.totalUSDValue,
          totalKESValue: balanceData.totalKESValue,
          activeChains: balanceData.activeChains,
          totalTokens: balanceData.totalTokens,
          lastUpdated: new Date().toISOString()
        },
        balances: balanceData.balances,
        summary: balanceData.summary
      }
    ));

  } catch (error: any) {
    console.error('❌ Error getting business balance:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to retrieve business balance',
      null,
      { code: 'BALANCE_FAILED', message: error.message }
    ));
  }
};

/**
 * Get business balance for a specific chain
 */
export const getBusinessChainBalance = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) {
      return res.status(401).json(standardResponse(
        false,
        'Authentication required',
        null,
        { code: 'AUTH_REQUIRED', message: 'Please login to view business balance' }
      ));
    }

    const { businessId, chain } = req.params;
    
    if (!businessId || !chain) {
      return res.status(400).json(standardResponse(
        false,
        'Business ID and chain are required',
        null,
        { code: 'MISSING_PARAMETERS', message: 'Business ID and chain are required' }
      ));
    }

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json(standardResponse(
        false,
        'Business not found',
        null,
        { code: 'BUSINESS_NOT_FOUND', message: 'Business account not found' }
      ));
    }

    if (business.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json(standardResponse(
        false,
        'Unauthorized access',
        null,
        { code: 'UNAUTHORIZED', message: 'You can only view your own business balance' }
      ));
    }

    // Get balance for specific chain
    const chainBalance = await getBusinessChainBalanceData(business.walletAddress, chain);

    return res.json(standardResponse(
      true,
      `Business balance for ${chain} retrieved successfully`,
      {
        businessId: business._id,
        businessName: business.businessName,
        merchantId: business.merchantId,
        walletAddress: business.walletAddress,
        chain: chain,
        chainInfo: chainBalance.chainInfo,
        balances: chainBalance.balances,
        summary: chainBalance.summary,
        lastUpdated: new Date().toISOString()
      }
    ));

  } catch (error: any) {
    console.error('❌ Error getting business chain balance:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to retrieve business chain balance',
      null,
      { code: 'CHAIN_BALANCE_FAILED', message: error.message }
    ));
  }
};

/**
 * Get business transaction history
 */
export const getBusinessTransactionHistory = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) {
      return res.status(401).json(standardResponse(
        false,
        'Authentication required',
        null,
        { code: 'AUTH_REQUIRED', message: 'Please login to view transaction history' }
      ));
    }

    const { businessId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    if (!businessId) {
      return res.status(400).json(standardResponse(
        false,
        'Business ID required',
        null,
        { code: 'MISSING_BUSINESS_ID', message: 'Business ID is required' }
      ));
    }

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json(standardResponse(
        false,
        'Business not found',
        null,
        { code: 'BUSINESS_NOT_FOUND', message: 'Business account not found' }
      ));
    }

    if (business.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json(standardResponse(
        false,
        'Unauthorized access',
        null,
        { code: 'UNAUTHORIZED', message: 'You can only view your own business transactions' }
      ));
    }

    // Get transactions for this business
    const query: any = { 
      $or: [
        { fromAddress: business.walletAddress },
        { toAddress: business.walletAddress },
        { businessId: business._id }
      ]
    };

    // Apply filters
    const { status, type, dateFrom, dateTo } = req.query;
    if (status) query.status = status;
    if (type) query.type = type;
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom as string);
      if (dateTo) query.createdAt.$lte = new Date(dateTo as string);
    }

    const totalTransactions = await Escrow.countDocuments(query);
    const transactions = await Escrow.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-__v');

    return res.json(standardResponse(
      true,
      'Business transaction history retrieved successfully',
      {
        transactions,
        summary: {
          total: totalTransactions,
          page,
          limit,
          pages: Math.ceil(totalTransactions / limit),
          businessId: business._id,
          businessName: business.businessName
        }
      }
    ));

  } catch (error: any) {
    console.error('❌ Error getting business transaction history:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to retrieve transaction history',
      null,
      { code: 'HISTORY_FAILED', message: error.message }
    ));
  }
};

/**
 * Withdraw from business to personal account
 */
export const withdrawBusinessToPersonal = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) {
      return res.status(401).json(standardResponse(
        false,
        'Authentication required',
        null,
        { code: 'AUTH_REQUIRED', message: 'Please login to perform this action' }
      ));
    }

    const { businessId, amount, tokenType = 'USDC', chain = 'arbitrum' } = req.body;

    if (!businessId || !amount) {
      return res.status(400).json(standardResponse(
        false,
        'Business ID and amount are required',
        null,
        { code: 'MISSING_FIELDS', message: 'Business ID and amount are required' }
      ));
    }

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json(standardResponse(
        false,
        'Business not found',
        null,
        { code: 'BUSINESS_NOT_FOUND', message: 'Business account not found' }
      ));
    }

    if (business.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json(standardResponse(
        false,
        'Unauthorized access',
        null,
        { code: 'UNAUTHORIZED', message: 'You can only withdraw from your own business' }
      ));
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json(standardResponse(
        false,
        'Invalid amount',
        null,
        { code: 'INVALID_AMOUNT', message: 'Amount must be a positive number' }
      ));
    }

    // Get user's personal wallet address
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json(standardResponse(
        false,
        'User not found',
        null,
        { code: 'USER_NOT_FOUND', message: 'User account not found' }
      ));
    }

    // Create transaction record
    const transactionId = randomUUID();
    const escrow = new Escrow({
      transactionId,
      userId: req.user._id,
      businessId: business._id,
      amount: amountNum,
      cryptoAmount: amountNum, // Same as amount for crypto transfers
      type: 'business_to_personal',
      status: 'pending',
      fromAddress: business.walletAddress,
      toAddress: user.walletAddress,
      tokenType,
      chain
    });
    await escrow.save();

    try {
      // Perform real blockchain transfer
      console.log(`🔄 Initiating blockchain transfer from business to personal wallet...`);
      console.log(`- From: ${business.walletAddress} (${business.businessName})`);
      console.log(`- To: ${user.walletAddress}`);
      console.log(`- Amount: ${amountNum} ${tokenType} on ${chain}`);
      
      const transferResult = await sendToken(
        user.walletAddress,
        amountNum,
        chain,
        business.privateKey,
        tokenType as TokenSymbol
      );

      // Update escrow with transaction hash
      escrow.status = 'completed';
      escrow.completedAt = new Date();
      escrow.cryptoTransactionHash = transferResult.transactionHash;
      await escrow.save();

      console.log(`✅ Blockchain transfer completed successfully!`);
      console.log(`- Transaction Hash: ${transferResult.transactionHash}`);
      console.log(`- Amount: ${amountNum} ${tokenType}`);
      console.log(`- Chain: ${chain}`);

    } catch (transferError: any) {
      console.error('❌ Blockchain transfer failed:', transferError);
      
      // Update escrow as failed
      escrow.status = 'failed';
      escrow.completedAt = new Date();
      await escrow.save();

      return res.status(500).json(standardResponse(
        false,
        'Blockchain transfer failed',
        null,
        { code: 'TRANSFER_FAILED', message: transferError.message }
      ));
    }

    return res.json(standardResponse(
      true,
      'Transfer to personal account successful',
      {
        transactionId: escrow.transactionId,
        cryptoTransactionHash: escrow.cryptoTransactionHash,
        amount: amountNum,
        tokenType,
        chain,
        fromBusiness: business.businessName,
        toPersonal: user.walletAddress,
        status: escrow.status,
        completedAt: escrow.completedAt
      }
    ));

  } catch (error: any) {
    console.error('❌ Error in business to personal transfer:', error);
    return res.status(500).json(standardResponse(
      false,
      'Transfer failed',
      null,
      { code: 'TRANSFER_FAILED', message: error.message }
    ));
  }
};

/**
 * Withdraw from business to MPESA
 */
export const withdrawBusinessToMpesa = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) {
      return res.status(401).json(standardResponse(
        false,
        'Authentication required',
        null,
        { code: 'AUTH_REQUIRED', message: 'Please login to perform this action' }
      ));
    }

    const { businessId, amount, phoneNumber, tokenType = 'USDC', chain = 'arbitrum' } = req.body;

    if (!businessId || !amount || !phoneNumber) {
      return res.status(400).json(standardResponse(
        false,
        'Business ID, amount, and phone number are required',
        null,
        { code: 'MISSING_FIELDS', message: 'Business ID, amount, and phone number are required' }
      ));
    }

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json(standardResponse(
        false,
        'Business not found',
        null,
        { code: 'BUSINESS_NOT_FOUND', message: 'Business account not found' }
      ));
    }

    if (business.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json(standardResponse(
        false,
        'Unauthorized access',
        null,
        { code: 'UNAUTHORIZED', message: 'You can only withdraw from your own business' }
      ));
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json(standardResponse(
        false,
        'Invalid amount',
        null,
        { code: 'INVALID_AMOUNT', message: 'Amount must be a positive number' }
      ));
    }

    // Create transaction record
    const transactionId = randomUUID();
    const escrow = new Escrow({
      transactionId,
      userId: req.user._id,
      businessId: business._id,
      amount: amountNum,
      cryptoAmount: amountNum, // Same as amount for crypto transfers
      type: 'business_crypto_to_fiat',
      status: 'pending',
      fromAddress: business.walletAddress,
      phoneNumber,
      tokenType,
      chain
    });
    await escrow.save();

    try {
      // Perform real blockchain transfer to platform wallet first
      console.log(`🔄 Initiating crypto withdrawal from business to MPESA...`);
      console.log(`- From: ${business.walletAddress} (${business.businessName})`);
      console.log(`- Amount: ${amountNum} ${tokenType} on ${chain}`);
      console.log(`- Phone: ${phoneNumber}`);
      
      // First, transfer crypto from business to platform wallet
      const platformWallets = await initializePlatformWallets();
      const primaryKey = process.env.PLATFORM_WALLET_PRIMARY_KEY;
      const secondaryKey = process.env.PLATFORM_WALLET_SECONDARY_KEY;

      if (!primaryKey || !secondaryKey) {
        throw new Error('Platform wallet keys not configured');
      }

      const transferResult = await sendFromPlatformWallet(
        amountNum,
        platformWallets.main.address,
        primaryKey,
        secondaryKey,
        chain,
        tokenType as TokenSymbol
      );

      // Update escrow with transaction hash
      escrow.status = 'processing';
      escrow.cryptoTransactionHash = transferResult.transactionHash;
      await escrow.save();

      console.log(`✅ Crypto transfer to platform completed!`);
      console.log(`- Transaction Hash: ${transferResult.transactionHash}`);
      console.log(`- Amount: ${amountNum} ${tokenType}`);
      console.log(`- Chain: ${chain}`);
      console.log(`- MPESA processing will be handled by platform...`);

    } catch (transferError: any) {
      console.error('❌ Crypto withdrawal failed:', transferError);
      
      // Update escrow as failed
      escrow.status = 'failed';
      escrow.completedAt = new Date();
      await escrow.save();

      return res.status(500).json(standardResponse(
        false,
        'Crypto withdrawal failed',
        null,
        { code: 'WITHDRAWAL_FAILED', message: transferError.message }
      ));
    }

    return res.json(standardResponse(
      true,
      'Business withdrawal to MPESA initiated successfully',
      {
        transactionId: escrow.transactionId,
        cryptoTransactionHash: escrow.cryptoTransactionHash,
        amount: amountNum,
        tokenType,
        chain,
        phoneNumber,
        businessName: business.businessName,
        status: escrow.status,
        message: 'Crypto transferred to platform. MPESA processing in progress...'
      }
    ));

  } catch (error: any) {
    console.error('❌ Error in business to MPESA withdrawal:', error);
    return res.status(500).json(standardResponse(
      false,
      'Withdrawal failed',
      null,
      { code: 'WITHDRAWAL_FAILED', message: error.message }
    ));
  }
};

/**
 * Get business credit score
 */
export const getBusinessCreditScore = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) {
      return res.status(401).json(standardResponse(
        false,
        'Authentication required',
        null,
        { code: 'AUTH_REQUIRED', message: 'Please login to view credit score' }
      ));
    }

    const { businessId } = req.params;
    
    if (!businessId) {
      return res.status(400).json(standardResponse(
        false,
        'Business ID required',
        null,
        { code: 'MISSING_BUSINESS_ID', message: 'Business ID is required' }
      ));
    }

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json(standardResponse(
        false,
        'Business not found',
        null,
        { code: 'BUSINESS_NOT_FOUND', message: 'Business account not found' }
      ));
    }

    if (business.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json(standardResponse(
        false,
        'Unauthorized access',
        null,
        { code: 'UNAUTHORIZED', message: 'You can only view your own business credit score' }
      ));
    }

    // Calculate credit score using business method
    const creditScore = business.calculateCreditScore();
    const riskLevel = business.assessRiskLevel();
    const creditLimit = business.calculateCreditLimit();

    // Get payment history statistics
    const totalPayments = business.paymentHistory.length;
    const completedPayments = business.paymentHistory.filter((p: any) => p.status === 'completed').length;
    const successRate = totalPayments > 0 ? (completedPayments / totalPayments) * 100 : 0;

    return res.json(standardResponse(
      true,
      'Business credit score retrieved successfully',
      {
        businessId: business._id,
        businessName: business.businessName,
        creditScore,
        riskLevel,
        creditLimit,
        currentCredit: business.currentCredit,
        availableCredit: business.availableCredit,
        totalVolume: business.totalVolume,
        monthlyVolume: business.monthlyVolume,
        paymentHistory: {
          totalPayments,
          completedPayments,
          successRate: Math.round(successRate * 100) / 100
        },
        lastAssessment: business.lastRiskAssessment,
        recommendations: [
          'Maintain consistent payment history',
          'Increase transaction volume to improve credit score',
          'Keep overdraft utilization below 30%'
        ]
      }
    ));

  } catch (error: any) {
    console.error('❌ Error getting business credit score:', error);
    return res.status(500).json(standardResponse(
      false,
      'Failed to retrieve credit score',
      null,
      { code: 'CREDIT_SCORE_FAILED', message: error.message }
    ));
  }
};

/**
 * Apply for business loan
 */
export const applyBusinessLoan = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) {
      return res.status(401).json(standardResponse(
        false,
        'Authentication required',
        null,
        { code: 'AUTH_REQUIRED', message: 'Please login to apply for loan' }
      ));
    }

    const { businessId, loanAmount, purpose, repaymentPeriod } = req.body;

    if (!businessId || !loanAmount || !purpose || !repaymentPeriod) {
      return res.status(400).json(standardResponse(
        false,
        'All fields are required',
        null,
        { code: 'MISSING_FIELDS', message: 'Business ID, loan amount, purpose, and repayment period are required' }
      ));
    }

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json(standardResponse(
        false,
        'Business not found',
        null,
        { code: 'BUSINESS_NOT_FOUND', message: 'Business account not found' }
      ));
    }

    if (business.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json(standardResponse(
        false,
        'Unauthorized access',
        null,
        { code: 'UNAUTHORIZED', message: 'You can only apply for loans for your own business' }
      ));
    }

    const loanAmountNum = parseFloat(loanAmount);
    if (isNaN(loanAmountNum) || loanAmountNum <= 0) {
      return res.status(400).json(standardResponse(
        false,
        'Invalid loan amount',
        null,
        { code: 'INVALID_AMOUNT', message: 'Loan amount must be a positive number' }
      ));
    }

    // Check if business is eligible for loan
    const creditScore = business.calculateCreditScore();
    const riskLevel = business.assessRiskLevel();
    const maxLoanAmount = business.calculateCreditLimit();

    if (loanAmountNum > maxLoanAmount) {
      return res.status(400).json(standardResponse(
        false,
        'Loan amount exceeds credit limit',
        null,
        { code: 'LOAN_AMOUNT_EXCEEDED', message: `Maximum loan amount is $${maxLoanAmount}` }
      ));
    }

    if (riskLevel === 'high' && loanAmountNum > 100) {
      return res.status(400).json(standardResponse(
        false,
        'Loan not approved due to high risk',
        null,
        { code: 'HIGH_RISK', message: 'Loan not approved due to high risk profile' }
      ));
    }

    // Create loan application
    const loanId = randomUUID();
    const interestRate = creditScore >= 700 ? 8.5 : creditScore >= 500 ? 12.0 : 15.5;
    const monthlyPayment = (loanAmountNum * (interestRate / 100 / 12)) / (1 - Math.pow(1 + (interestRate / 100 / 12), -parseInt(repaymentPeriod)));

    const loanApplication = {
      loanId,
      businessId: business._id,
      businessName: business.businessName,
      loanAmount: loanAmountNum,
      purpose,
      repaymentPeriod: parseInt(repaymentPeriod),
      creditScore,
      riskLevel,
      status: 'pending_approval',
      appliedAt: new Date(),
      interestRate,
      monthlyPayment: Math.round(monthlyPayment * 100) / 100
    };

    // Add to business overdraft history
    business.overdraftHistory.push({
      transactionId: loanId,
      amount: loanAmountNum,
      type: 'borrow',
      timestamp: new Date(),
      status: 'pending'
    });

    await business.save();

    return res.json(standardResponse(
      true,
      'Loan application submitted successfully',
      {
        loanApplication,
        estimatedApprovalTime: '24-48 hours',
        nextSteps: [
          'Application under review',
          'Credit assessment in progress',
          'You will be notified of the decision'
        ]
      }
    ));

  } catch (error: any) {
    console.error('❌ Error applying for business loan:', error);
    return res.status(500).json(standardResponse(
      false,
      'Loan application failed',
      null,
      { code: 'LOAN_APPLICATION_FAILED', message: error.message }
    ));
  }
};
