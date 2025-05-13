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


import { Request, Response } from 'express';
import { ThirdwebSDK } from '@thirdweb-dev/sdk';
import { Business } from '../models/businessModel';
import { User } from '../models/models';
import { createAccount, generateOTP, otpStore, africastalking } from '../services/auth';
import { handleError } from '../services/utils';
import config from '../config/env';

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

    const existingBusiness = await Business.findOne({ userId, businessName });
    if (existingBusiness) {
      return res.status(409).send({ message: 'A business with this name already exists for this user.' });
    }

    // Generate OTP for verification
    const otp = generateOTP();
    otpStore[phoneNumber] = otp;

    console.log(`✅ Business Creation OTP for ${phoneNumber}: ${otp}`);

    await africastalking.SMS.send({
      to: [phoneNumber],
      message: `Your business creation verification code is: ${otp}`,
      from: 'NEXUSPAY',
    });

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

    // Create Business Wallet Using Thirdweb SDK
    const { pk, walletAddress } = await createAccount(); // Create business wallet
    const merchantId = generateMerchantId(); // Universal till number

    const business = new Business({
      businessName,
      ownerName,
      location,
      businessType,
      phoneNumber,
      merchantId, // Borderless till number
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
  } catch (error) {
    console.error('❌ Error in completing business creation:', error);
    return res.status(500).send({ message: 'Failed to create business.' });
  }
};

// Step 3: Secure Business-to-Personal Wallet Transfers (OTP Required)
export const transferFundsToPersonal = async (req: Request, res: Response): Promise<Response> => {
  const { businessId, amount, otp } = req.body;

  if (!businessId || !amount || !otp) {
    return res.status(400).send({ message: 'Business ID, amount, and OTP are required!' });
  }

  const business = await Business.findById(businessId);
  if (!business) {
    return res.status(404).send({ message: 'Business account not found.' });
  }

  const user = await User.findById(business.userId);
  if (!user) {
    return res.status(404).send({ message: 'User account not found.' });
  }

  if (!otpStore[user.phoneNumber] || otpStore[user.phoneNumber] !== otp) {
    return res.status(400).send({ message: 'Invalid or expired OTP.' });
  }
  delete otpStore[user.phoneNumber]; // Clear OTP after verification

  try {
    // Initialize Thirdweb SDK for blockchain transactions
    const sdk = ThirdwebSDK.fromPrivateKey(
      business.privateKey, // Business wallet private key
      config.arbitrum.chainId, // Use Arbitrum chain from config
      { secretKey: config.THIRDWEB_SECRET_KEY }
    );

    const businessWallet = sdk.wallet;

    // Transfer funds from Business Wallet to User's Personal Wallet
    const tx = await businessWallet.transfer(user.walletAddress, amount);

    console.log(`✅ Business-to-Personal Transfer: ${tx.receipt.transactionHash}`);

    return res.send({
      message: 'Funds transferred successfully!',
      transactionHash: tx.receipt.transactionHash,
    });
  } catch (error) {
    console.error('❌ Error transferring funds:', error);
    return res.status(500).send({ message: 'Failed to transfer funds.' });
  }
};


