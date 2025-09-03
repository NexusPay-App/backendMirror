import { Request, Response } from 'express';
import { ThirdwebSDK } from '@thirdweb-dev/sdk';
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
