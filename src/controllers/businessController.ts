import { Request, Response } from 'express';
import { ThirdwebSDK } from '@thirdweb-dev/sdk';
import { Business } from '../models/businessModel';
import { User } from '../models/models';
import { createAccount, generateOTP, otpStore } from '../services/auth';
import { handleError, standardResponse } from '../services/utils';
import config from '../config/env';
import * as bcrypt from 'bcryptjs';
import { getTokenConfig } from '../services/token';
import { sendToken, getAllTokenTransferEvents } from '../services/token';
import { SMSService } from '../services/smsService';
import { BusinessCreditService } from '../services/businessCreditService';

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

// import { Request, Response } from 'express';
// import bcrypt from 'bcrypt';
// import { ThirdwebSDK } from "@thirdweb-dev/sdk";
// import { Business } from '../models/businessModel';
// import { User } from '../models/models';
// import { createAccount, generateOTP, otpStore, africastalking, SALT_ROUNDS } from '../services/auth';
// import { handleError } from '../services/utils';
// import config from "../config/env";

// // 🔹 Utility: Generate Unique Merchant ID (Borderless Till Number)
// export function generateMerchantId(): string {
//   const timestamp = Date.now().toString().slice(-5);
//   const randomDigits = Math.floor(10000 + Math.random() * 90000).toString();
//   return `NX-${timestamp}${randomDigits}`;
// }

// // ✅ **Step 1: Request Business Upgrade (Sends OTP)**
// export const requestBusinessUpgrade = async (req: Request, res: Response) => {
//   const { phoneNumber, businessName, ownerName, location, businessType } = req.body;

//   if (!phoneNumber || !businessName || !ownerName || !location || !businessType) {
//     return res.status(400).send({ message: "All fields are required!" });
//   }

//   try {
//     const user = await User.findOne({ phoneNumber });
//     if (!user) {
//       return res.status(404).send({ message: "User not found. Please create a personal account first." });
//     }

//     const existingBusiness = await Business.findOne({ phoneNumber });
//     if (existingBusiness) {
//       return res.status(409).send({ message: "This account is already a business account." });
//     }

//     // Generate OTP for verification
//     const otp = generateOTP();
//     otpStore[phoneNumber] = otp;

//     console.log(`✅ Business Upgrade OTP for ${phoneNumber}: ${otp}`);

//     await africastalking.SMS.send({
//       to: [phoneNumber],
//       message: `Your business upgrade verification code is: ${otp}`,
//       from: 'NEXUSPAY'
//     });

//     return res.send({ message: "OTP sent successfully. Please verify to complete business upgrade." });

//   } catch (error) {
//     console.error("❌ Error in business upgrade request:", error);
//     return handleError(error, res, "Failed to process business upgrade request.");
//   }
// };

// // ✅ **Step 2: Complete Business Upgrade (Creates Business Wallet)**
// export const completeBusinessUpgrade = async (req: Request, res: Response) => {
//   const { phoneNumber, otp, businessName, ownerName, location, businessType } = req.body;

//   if (!otpStore[phoneNumber] || otpStore[phoneNumber] !== otp) {
//     return res.status(400).send({ message: "Invalid or expired OTP." });
//   }
//   delete otpStore[phoneNumber]; // Clear OTP after verification

//   try {
//     const user = await User.findOne({ phoneNumber });
//     if (!user) {
//       return res.status(404).send({ message: "User not found. Please create a personal account first." });
//     }

//     // ✅ Create Business Wallet Using Thirdweb SDK
//     const { pk, walletAddress } = await createAccount("arbitrum"); // Create business wallet
//     const merchantId = generateMerchantId(); // Universal till number

//     const business = new Business({
//       businessName,
//       ownerName,
//       location,
//       businessType,
//       phoneNumber,
//       merchantId, // ✅ Borderless till number
//       walletAddress,
//       privateKey: pk,
//       userId: user._id
//     });

//     await business.save();

//     return res.send({
//       message: "Business upgraded successfully!",
//       walletAddress,
//       merchantId
//     });

//   } catch (error) {
//     console.error("❌ Error in completing business upgrade:", error);
//     return res.status(500).send({ message: "Failed to upgrade to business." });
//   }
// };

// // ✅ **Step 3: Secure Business-to-Personal Wallet Transfers (OTP Required)**
// export const transferFundsToPersonal = async (req: Request, res: Response) => {
//   const { phoneNumber, amount, otp } = req.body;

//   if (!phoneNumber || !amount || !otp) {
//     return res.status(400).send({ message: "Phone number, amount, and OTP are required!" });
//   }

//   if (!otpStore[phoneNumber] || otpStore[phoneNumber] !== otp) {
//     return res.status(400).send({ message: "Invalid or expired OTP." });
//   }
//   delete otpStore[phoneNumber]; // Clear OTP after verification

//   try {
//     const business = await Business.findOne({ phoneNumber });
//     if (!business) {
//       return res.status(404).send({ message: "Business account not found." });
//     }

//     const user = await User.findOne({ phoneNumber });
//     if (!user) {
//       return res.status(404).send({ message: "User account not found." });
//     }

//     // ✅ Initialize Thirdweb SDK for blockchain transactions
//     const sdk = ThirdwebSDK.fromPrivateKey(
//       business.privateKey, // Business wallet private key
//       config.arbitrum.chainId, // Use Arbitrum chain from config
//       { secretKey: config.THIRDWEB_SECRET_KEY }
//     );

//     const businessWallet = sdk.wallet;

//     // ✅ Transfer funds from Business Wallet to User's Personal Wallet
//     const tx = await businessWallet.transfer(user.walletAddress, amount);

//     console.log(`✅ Business-to-Personal Transfer: ${tx.receipt.transactionHash}`);

//     return res.send({
//       message: "Funds transferred successfully!",
//       transactionHash: tx.receipt.transactionHash
//     });

//   } catch (error) {
//     console.error("❌ Error transferring funds:", error);
//     return res.status(500).send({ message: "Failed to transfer funds." });
//   }
// };

// Utility: Generate Unique Merchant ID (Borderless Till Number)
function generateMerchantId(): string {
  const timestamp = Date.now().toString().slice(-5);
  const randomDigits = Math.floor(10000 + Math.random() * 90000).toString();
  return `NX-${timestamp}${randomDigits}`;
}

// Step 1: Request Business Creation (Sends OTP)
export const requestBusinessCreation = async (req: Request, res: Response): Promise<Response> => {
  const { userId, businessName, ownerName, location, businessType, phoneNumber } = req.body;

  if (!userId || !businessName || !ownerName || !location || !businessType || !phoneNumber) {
    return res.status(400).send({ message: 'All fields are required!' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send({ message: 'User not found. Please create a personal account first.' });
    }

    // Check if business name is already taken by another user
    const existingBusinessName = await Business.findOne({ businessName });
    if (existingBusinessName && existingBusinessName.userId.toString() !== userId) {
      return res.status(409).send({ message: 'This business name is already taken.' });
    }

    // Generate OTP for verification
    const otp = generateOTP();
    otpStore[phoneNumber] = otp;

    console.log(`✅ Business Creation OTP for ${phoneNumber}: ${otp}`);

    // Send OTP via SMS using the new SMS service
    await SMSService.sendOTP(phoneNumber, otp, 'business_creation');

    return res.send({ message: 'OTP sent successfully. Please verify to complete business creation.' });
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
      // Handle duplicate key error
      const field = Object.keys(error.keyPattern)[0];
      return res.status(409).send({ 
        message: `A business with this ${field} already exists.`,
        field
      });
    }
    return res.status(500).send({ message: 'Failed to create business.' });
  }
};

// Step 3: Secure Business-to-Personal/External Wallet Transfers
// REMOVED: This functionality is now handled by the optimized sendToken endpoint
// which supports sending to any registered user by phone, email, or wallet address

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


