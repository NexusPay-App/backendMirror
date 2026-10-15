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
import { SMSService } from '../services/smsService';
import { BusinessCreditService } from '../services/businessCreditService';

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
  const { userId, businessName, ownerName, location, businessType, phoneNumber } = req.body;

  if (String(userId) !== String(req.user?._id)) return res.status(403).json({ success: false, message: 'Business owner must match the signed-in account' });
  if (!userId || !businessName || !ownerName || !location || !businessType || !phoneNumber) {
    return res.status(400).send({ message: 'All fields are required!' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send({ message: 'User not found. Please create a personal account first.' });
    }

    const existingBusinessName = await Business.findOne({ businessName });
    if (existingBusinessName && existingBusinessName.userId.toString() !== userId) {
      return res.status(409).send({ message: 'This business name is already taken.' });
    }

    const otp = generateOTP();
    await issueChallenge(phoneNumber, 'business-creation', otp, { userId: String(req.user._id) });

    console.log("Operation diagnostic");

    const delivered = await SMSService.sendOTP(phoneNumber, otp, 'business_creation');
    if (!delivered) return res.status(503).json({ success: false, message: 'Unable to deliver the verification code. Try again later.' });

    return res.send({ message: 'OTP sent successfully. Please verify to complete business creation.' });
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
    });

    await business.save();

    return res.send({
      message: 'Business created successfully!',
      walletAddress,
      merchantId,
    });
  } catch (error: any) {
    console.error('❌ Error in completing business creation:', error);
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(409).send({ 
        message: `A business with this ${field} already exists.`,
        field
      });
    }
    return res.status(500).send({ message: 'Failed to create business.' });
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
        businessName: business.businessName,
        ownerName: business.ownerName,
        location: business.location,
        businessType: business.businessType,
        phoneNumber: business.phoneNumber,
        merchantId: business.merchantId,
        walletAddress: business.walletAddress,
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
          businessName: business.businessName,
          ownerName: business.ownerName,
          location: business.location,
          businessType: business.businessType,
          phoneNumber: business.phoneNumber,
          merchantId: business.merchantId,
          walletAddress: business.walletAddress,
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


