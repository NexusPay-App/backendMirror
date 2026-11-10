import { isUserFundedNetwork } from "../config/mainnetPayments";
import { evmPaymentError } from "../services/evmPaymentErrors";
import { paymentChains, paymentCapabilities } from "../config/chains";
import {
  botCapabilities,
  isBotNetwork,
  getBotConfig,
  type BotNetwork,
} from "../config/botchain";
import { resolveBotAccount, getBotBalances } from "../services/botchainWallet";
import { randomInt } from "node:crypto";
import { Request, Response } from "express";
import { User } from "../models/models";
import { Business } from "../models/businessModel";
import { ethers } from "ethers";
import { client } from "../services/auth";
import { verifyWalletBinding } from "../services/walletProvisioning";
import {
  sendToken,
  getAllTokenTransferEvents,
  generateUnifiedWallet,
  migrateFunds,
  unifyWallets,
  Chain,
  TokenSymbol,
} from "../services/token";
import { smartWallet } from "thirdweb/wallets";
import { privateKeyToAccount } from "../services/signingBoundary";
import { defineChain, getContract, readContract, getRpcClient } from "thirdweb";
import { eth_getBalance } from "thirdweb/rpc";
import config from "../config/env";
import * as bcrypt from "bcrypt";
import { getTokenConfig, getSupportedTokens, getBalanceTokens } from "../config/tokens";
import { getUsdRate } from "../services/rates";
import { Escrow } from "../models/escrowModel";
import { randomUUID } from "crypto";
import { SMSService } from "../services/smsService";
import { redis } from "../utils/redis";

// Cache utility functions
const getCachedData = async (key: string): Promise<any> => {
  try {
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.error("Error getting cached data:", error);
    return null;
  }
};

const setCachedData = async (
  key: string,
  data: any,
  ttlSeconds: number,
): Promise<void> => {
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(data));
  } catch (error) {
    console.error("Error setting cached data:", error);
  }
};

// BOT networks feed the same balance records as legacy chains so shared screens
// render them identically. USDT counts as $1 (stablecoin convention used
// elsewhere); BOT is valued from the CoinMarketCap quote via getUsdRate and
// stays $0 while no live price is available — never $1.
async function botBalanceFor(
  user: any,
  network: BotNetwork,
): Promise<Record<string, number> | null> {
  const account = await resolveBotAccount(user, network);
  const rows = await getBotBalances(network, account.address);
  const balances: Record<string, number> = {};
  for (const row of rows) {
    const value = Number(row.balance);
    if (Number.isFinite(value) && value > 0) balances[row.symbol] = value;
  }
  return Object.keys(balances).length ? balances : null;
}
async function botUsdValue(balances: Record<string, number>): Promise<number> {
  let total = 0;
  if (balances.USDT) total += balances.USDT;
  if (balances.BOT) total += balances.BOT * (await getUsdRate("BOT"));
  return total;
}

export const send = async (req: Request, res: Response) => {
  const {
    recipientIdentifier,
    amount,
    senderAddress,
    chain,
    tokenSymbol = "USDC",
    password,
    googleAuthCode,
    transactionSignature,
  } = req.body;

  // Enhanced validation with better error messages
  if (!recipientIdentifier || !amount || !senderAddress || !chain) {
    console.log("Send request failed: Missing required parameters");
    return res.status(400).json({
      success: false,
      message: "Required parameters are missing!",
      error: {
        code: "MISSING_FIELDS",
        message:
          "recipientIdentifier, amount, senderAddress, and chain are required",
      },
    });
  }

  console.log("=== SEND TOKEN REQUEST RECEIVED ===");
  console.log("Request details:", { chain, tokenSymbol, amount, bodySender: senderAddress });

  let recipientAddress = recipientIdentifier;
  let recipientPhone = "";
  let recipientEmail = "";

  try {
    // Find sender and validate. The signing key is excluded from ordinary reads.
    const sender = await User.findById(req.user._id).select("+privateKey");
    if (!sender) {
      console.error("Sender not found for address:", senderAddress);
      return res.status(404).json({
        success: false,
        message: "Sender wallet not found!",
        error: {
          code: "SENDER_NOT_FOUND",
          message: "Your wallet address is not registered",
        },
      });
    }

    // Enhanced recipient lookup with priority: wallet address > phone > email
    if (!ethers.isAddress(recipientIdentifier)) {
      let recipient = null;

      // First try phone number (most common)
      if (
        recipientIdentifier.startsWith("+") ||
        /^\d+$/.test(recipientIdentifier)
      ) {
        recipient = await User.findOne({ phoneNumber: recipientIdentifier });
        if (recipient) {
          recipientPhone = recipient.phoneNumber;
          console.log("Recipient found by phone number:", recipientPhone);
        }
      }

      // If not found by phone, try email
      if (!recipient && recipientIdentifier.includes("@")) {
        recipient = await User.findOne({
          email: recipientIdentifier.toLowerCase(),
        });
        if (recipient) {
          recipientEmail = recipient.email;
          console.log("Recipient found by email:", recipientEmail);
        }
      }

      // If still not found, try without phone prefix
      if (
        !recipient &&
        !recipientIdentifier.startsWith("+") &&
        /^\d+$/.test(recipientIdentifier)
      ) {
        recipient = await User.findOne({
          phoneNumber: `+${recipientIdentifier}`,
        });
        if (recipient) {
          recipientPhone = recipient.phoneNumber;
          console.log(
            "Recipient found by phone number (without prefix):",
            recipientPhone,
          );
        }
      }

      if (!recipient) {
        console.log("Recipient not found for identifier:", recipientIdentifier);
        return res.status(404).json({
          success: false,
          message: "Recipient not found!",
          error: {
            code: "RECIPIENT_NOT_FOUND",
            message:
              "Make sure the phone number or email is registered with NexusPay. You can also send to a wallet address directly.",
          },
        });
      }

      recipientAddress = recipient.walletAddress;
      recipientPhone = recipient.phoneNumber || "";
      recipientEmail = recipient.email || "";
    }

    if (
      res.locals.transactionRecipientAddress &&
      recipientAddress.toLowerCase() !==
        String(res.locals.transactionRecipientAddress).toLowerCase()
    ) {
      return res.status(409).json({
        success: false,
        error: {
          code: "PAYMENT_RECIPIENT_CHANGED",
          message:
            "Recipient wallet changed after approval. Review the payment and confirm again.",
        },
      });
    }

    // Enhanced chain validation - support all chains from config
    const supportedChains: string[] = paymentChains;
    if (!supportedChains.includes(chain)) {
      console.log("Invalid chain:", chain);
      return res.status(400).json({
        success: false,
        message: "Unsupported chain!",
        error: {
          code: "INVALID_CHAIN",
          message: `Supported chains: ${supportedChains.join(", ")}`,
        },
      });
    }

    const isHighValueTransaction = Number(amount) > 100;
    if (!sender.privateKey) {
      console.log("Sender private key missing for:", senderAddress);
      return res.status(400).json({
        success: false,
        message: "Sender private key not found in database!",
        error: {
          code: "PRIVATE_KEY_MISSING",
          message:
            "Your wallet is not properly configured. Please contact support.",
        },
      });
    }

    // Execute the token transfer
    console.log("Executing sendToken:", {
      chain,
      tokenSymbol,
      amount,
      bodySender: senderAddress,
      storedWallet: sender.walletAddress,
      personalMatch: !!sender.privateKey,
    });
    const result = await sendToken(
      recipientAddress,
      amount,
      chain,
      sender.privateKey,
      tokenSymbol,
      sender.walletAddress,
    );

    const currentDateTime = new Date().toLocaleString("en-KE", {
      timeZone: "Africa/Nairobi",
    });
    const transactionCode = Math.random()
      .toString(36)
      .substring(2, 12)
      .toUpperCase();
    const amountDisplay = `${amount} ${tokenSymbol}`;

    // Enhanced recipient display logic
    let recipientForDisplay =
      recipientPhone || recipientEmail || recipientIdentifier;
    if (!ethers.isAddress(recipientIdentifier)) {
      const recipient = await User.findOne({
        $or: [
          { phoneNumber: recipientIdentifier },
          { email: recipientIdentifier.toLowerCase() },
        ],
      });
      if (recipient) {
        recipientForDisplay =
          recipient.phoneNumber || recipient.email || recipientIdentifier;
      }
    }

    // Generate blockchain explorer URL
    const getExplorerUrl = (chain: string, txHash: string): string => {
      const explorerUrls: Record<string, string> = {
        arbitrum: `https://arbiscan.io/tx/${txHash}`,
        celo: `https://celoscan.io/tx/${txHash}`,
        polygon: `https://polygonscan.com/tx/${txHash}`,
        base: `https://basescan.org/tx/${txHash}`,
        optimism: `https://optimistic.etherscan.io/tx/${txHash}`,
        ethereum: `https://etherscan.io/tx/${txHash}`,
        bnb: `https://bscscan.com/tx/${txHash}`,
        avalanche: `https://snowtrace.io/tx/${txHash}`,
        fantom: `https://ftmscan.com/tx/${txHash}`,
        gnosis: `https://gnosisscan.io/tx/${txHash}`,
        scroll: `https://scrollscan.com/tx/${txHash}`,
        moonbeam: `https://moonscan.io/tx/${txHash}`,
        fuse: `https://explorer.fuse.io/tx/${txHash}`,
        aurora: `https://aurorascan.dev/tx/${txHash}`,
        lisk: `https://blockscout.lisk.com/tx/${txHash}`,
        somnia: `https://explorer.somnia.network/tx/${txHash}`,
      };
      return explorerUrls[chain] || `https://etherscan.io/tx/${txHash}`;
    };

    // Enhanced notification system - send to both phone and email if available
    const notifications = [];

    // Send SMS to recipient if they have a phone number
    if (recipientPhone) {
      try {
        await SMSService.sendTransactionNotification({
          phoneNumber: recipientPhone,
          amount: amountDisplay,
          tokenType: tokenSymbol,
          transactionHash: result.transactionHash,
          transactionType: "receive",
          status: "success",
          senderAddress: sender.walletAddress,
          explorerUrl: getExplorerUrl(chain, result.transactionHash),
        });
        console.log(`SMS sent to recipient: ${recipientPhone}`);
        notifications.push("SMS sent to recipient");
      } catch (smsError) {
        console.error("Failed to send SMS to recipient:", smsError);
      }
    }

    // Send email to recipient if they have an email
    if (recipientEmail) {
      try {
        // TODO: Implement email service for crypto notifications
        console.log(`Email notification would be sent to: ${recipientEmail}`);
        notifications.push("Email notification prepared for recipient");
      } catch (emailError) {
        console.error("Failed to prepare email for recipient:", emailError);
      }
    }

    // Send SMS to sender if they have a phone number
    if (sender.phoneNumber) {
      try {
        await SMSService.sendTransactionNotification({
          phoneNumber: sender.phoneNumber,
          amount: amountDisplay,
          tokenType: tokenSymbol,
          transactionHash: result.transactionHash,
          transactionType: "send",
          status: "success",
          recipientAddress: recipientAddress,
          explorerUrl: getExplorerUrl(chain, result.transactionHash),
        });
        console.log(`SMS sent to sender: ${sender.phoneNumber}`);
        notifications.push("SMS sent to sender");
      } catch (smsError) {
        console.error("Failed to send SMS to sender:", smsError);
      }
    }

    const explorerUrl = getExplorerUrl(chain, result.transactionHash);
    const isoTimestamp = new Date().toISOString();

    // Record the transaction in database
    const transactionId = randomUUID();
    const escrow = new Escrow({
      transactionId,
      userId: sender._id,
      amount: 0, // No fiat amount for direct transfers
      cryptoAmount: amount,
      type: "token_transfer",
      status: "completed",
      cryptoTransactionHash: result.transactionHash,
      completedAt: new Date(),
      tokenType: tokenSymbol,
      chain,
      metadata: {
        senderAddress,
        recipientAddress,
        recipientPhone,
        recipientEmail,
        recipientIdentifier,
        chain,
        tokenSymbol,
        transactionCode,
        securityLevel: isHighValueTransaction ? "high" : "standard",
        authMethod: password ? "password" : "google_auth",
        notifications,
        explorerUrl,
        directTransfer: true,
        transferType: "wallet_to_wallet",
      },
    });
    await escrow.save();

    console.log(`✅ Transaction recorded in database: ${transactionId}`);

    console.log(`Transaction completed successfully:`, {
      transactionHash: result.transactionHash,
      explorerUrl,
      amount: amountDisplay,
      chain,
      timestamp: isoTimestamp,
    });

    res.json({
      success: true,
      message: "Transaction completed successfully",
      data: {
        transactionCode,
        transactionHash: result.transactionHash,
        explorerUrl,
        amount: amountDisplay,
        tokenSymbol,
        chain,
        sender: {
          address: senderAddress,
          phone: sender.phoneNumber,
          email: sender.email,
        },
        recipient: {
          identifier: recipientForDisplay,
          address: recipientAddress,
          phone: recipientPhone,
          email: recipientEmail,
        },
        timestamp: {
          iso: isoTimestamp,
          local: currentDateTime,
          unix: Math.floor(Date.now() / 1000),
        },
        transaction: {
          hash: result.transactionHash,
          explorerUrl,
          chain,
          token: tokenSymbol,
          amount: amount,
          amountDisplay,
          status: "completed",
          confirmations: "pending",
          gasUsed: "estimated",
          blockNumber: "pending",
        },
        security: {
          level: isHighValueTransaction ? "high" : "standard",
          authMethod: password ? "password" : "google_auth",
          verified: true,
          transactionType: isHighValueTransaction ? "high_value" : "low_value",
        },
        notifications,
      },
    });
  } catch (error: any) {
    if (isUserFundedNetwork(chain)) {
      console.error(`Payment failed on ${chain}:`, {
        message: error?.message,
        code: error?.code,
        chain,
        tokenSymbol,
        amount,
        bodySender: senderAddress,
        userWallet: req.user?.walletAddress,
      });
      const failure = evmPaymentError(error, chain);
      return res.status(failure.status).json({
        success: false,
        message: failure.message,
        error: {
          code: failure.code,
          message: failure.message,
          requestId: res.locals.requestId,
        },
      });
    }
    console.error("Error in send API:", error);

    // Enhanced error logging for debugging
    console.error("Full error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      data: error.data,
    });

    // Determine error type and provide specific messages
    let errorCode = "TRANSFER_FAILED";
    let errorMessage = error.message || "Unknown error occurred";
    let statusCode = 500;

    if (error.message?.includes("insufficient funds")) {
      errorCode = "INSUFFICIENT_FUNDS";
      errorMessage = "Insufficient balance to complete this transaction";
      statusCode = 400;
    } else if (error.message?.includes("network")) {
      errorCode = "NETWORK_ERROR";
      errorMessage = "Network connection error. Please try again";
      statusCode = 503;
    } else if (error.message?.includes("gas")) {
      errorCode = "GAS_ERROR";
      errorMessage = "Transaction failed due to gas estimation error";
      statusCode = 400;
    } else if (error.message?.includes("nonce")) {
      errorCode = "NONCE_ERROR";
      errorMessage = "Transaction nonce error. Please try again";
      statusCode = 400;
    }

    res.status(statusCode).json({
      success: false,
      message: "Transaction failed",
      error: {
        code: errorCode,
        message: errorMessage,
        details:
          process.env.NODE_ENV === "development"
            ? {
                originalError: error.message,
                stack: error.stack?.split("\n").slice(0, 5),
              }
            : undefined,
        timestamp: new Date().toISOString(),
        requestId: Math.random().toString(36).substring(2, 12).toUpperCase(),
      },
    });
  }
};

export const pay = async (req: Request, res: Response) => {
  const {
    senderAddress,
    merchantId,
    amount,
    confirm,
    chainName,
    tokenSymbol = "USDC",
    password,
    googleAuthCode,
  } = req.body;

  // Enhanced validation with better error messages
  if (!merchantId || !amount || !senderAddress || !chainName) {
    console.log("Pay request failed: Missing required parameters");
    return res.status(400).json({
      success: false,
      message: "Required parameters are missing!",
      error: {
        code: "MISSING_FIELDS",
        message:
          "merchantId, amount, senderAddress, and chainName are required",
      },
    });
  }

  try {
    // Parallel database queries for better performance
    const [sender, business] = await Promise.all([
      User.findById(req.user._id).select("+privateKey"),
      Business.findOne({ merchantId }),
    ]);

    if (!business) {
      console.log("Business not found for merchantId:", merchantId);
      return res.status(404).json({
        success: false,
        message: "Business not found!",
        error: {
          code: "BUSINESS_NOT_FOUND",
          message: "The merchant ID you provided is not registered",
        },
      });
    }

    if (!sender) {
      console.log("Sender not found for address:", senderAddress);
      return res.status(404).json({
        success: false,
        message: "Sender not found!",
        error: {
          code: "SENDER_NOT_FOUND",
          message: "Your wallet address is not registered",
        },
      });
    }

    if (
      res.locals.transactionRecipientAddress &&
      business.walletAddress.toLowerCase() !==
        String(res.locals.transactionRecipientAddress).toLowerCase()
    ) {
      return res.status(409).json({
        success: false,
        error: {
          code: "PAYMENT_RECIPIENT_CHANGED",
          message:
            "Merchant wallet changed after approval. Review the payment and confirm again.",
        },
      });
    }

    if (!confirm) {
      console.log("Payment confirmation required for:", merchantId);
      return res.status(200).json({
        success: true,
        message: "Please confirm the payment to the business.",
        data: {
          businessName: business.businessName,
          businessAddress: business.walletAddress,
          amount,
          tokenSymbol,
          chainName,
          requiresConfirmation: true,
        },
      });
    }

    // Enhanced chain validation
    const supportedChains: string[] = paymentChains;
    if (!supportedChains.includes(chainName)) {
      return res.status(400).json({
        success: false,
        message: "Unsupported chain!",
        error: {
          code: "INVALID_CHAIN",
          message: `Supported chains: ${supportedChains.join(", ")}`,
        },
      });
    }

    const isHighValueTransaction = Number(amount) > 100;
    const result = await sendToken(
      business.walletAddress,
      amount,
      chainName,
      sender.privateKey,
      tokenSymbol,
      sender.walletAddress,
    );

    console.log(
      `Payment successful to ${business.walletAddress}: ${result.transactionHash}`,
    );

    // Enhanced success response
    res.json({
      success: true,
      message: "Payment to business completed successfully!",
      data: {
        businessName: business.businessName,
        businessAddress: business.walletAddress,
        amount,
        tokenSymbol,
        chainName,
        transactionHash: result.transactionHash,
        timestamp: new Date().toISOString(),
        status: "completed",
        securityLevel: isHighValueTransaction ? "high" : "standard",
        authenticationMethod: password ? "password" : "google_auth",
        authenticationDetails: {
          method: password ? "password" : "google_auth",
          verified: true,
          transactionType: isHighValueTransaction
            ? "high_value_business_payment"
            : "low_value_business_payment",
        },
      },
    });
  } catch (error: any) {
    if (isUserFundedNetwork(chainName)) {
      console.error(`Payment failed on ${chainName}:`, error);
      const failure = evmPaymentError(error, chainName);
      return res.status(failure.status).json({
        success: false,
        message: failure.message,
        error: {
          code: failure.code,
          message: failure.message,
          requestId: res.locals.requestId,
        },
      });
    }
    console.error("Error in pay API:", error);
    res.status(500).json({
      success: false,
      message: "Failed to complete payment to business.",
      error: {
        code: "PAYMENT_FAILED",
        message: error.message || "Unknown error occurred",
      },
    });
  }
};

export const tokenTransferEvents = async (req: Request, res: Response) => {
  const { address, chain } = req.query;

  if (!address) {
    console.log("Token transfer events request failed: Address missing");
    return res.status(400).send("Address is required as a query parameter.");
  }

  if (!chain) {
    console.log("Token transfer events request failed: Chain missing");
    return res.status(400).send("Chain is required as a query parameter.");
  }

  const chainName = String(chain);
  if (!paymentChains.includes(chainName as Chain)) {
    console.log("Invalid chain for token transfer events:", chain);
    return res
      .status(400)
      .send(`Invalid chain parameter. Supported chains: ${paymentChains.join(", ")}.`);
  }

  try {
    const events = await getAllTokenTransferEvents(
      chain as Chain,
      address as string,
    );
    console.log("Operation diagnostic");
    res.json(events);
  } catch (error: any) {
    console.error("Error fetching token transfer events:");
    res.status(500).send({
      message: "Internal server error",
      error: error.message || "Unknown error occurred",
    });
  }
};

export const unify = async (req: Request, res: Response) => {
  const { phoneNumber, password, otp } = req.body;

  if (!phoneNumber) {
    console.log("Unify request failed: Phone number missing");
    return res.status(400).send({ message: "Phone number is required." });
  }

  try {
    console.log(`Unifying wallets for phoneNumber: ${phoneNumber}`);

    const user = await User.findOne({ phoneNumber }).select("+privateKey");
    if (!user) {
      console.log("Operation diagnostic");
      return res.status(404).send({ message: "Phone number not registered." });
    }

    const status = {
      phoneNumberExists: true,
      isLocked: user.lockoutUntil && Date.now() < user.lockoutUntil,
      failedAttempts: user.failedPasswordAttempts,
      isUnified: user.isUnified,
    };
    console.log("Operation diagnostic");

    if (user.isUnified) {
      console.log("Operation diagnostic");
      return res.status(200).send({
        message: "Wallets have already been unified.",
        unifiedWalletAddress: user.walletAddress,
      });
    }

    if (status.isLocked) {
      const timeLeft = Math.ceil(
        (user.lockoutUntil! - Date.now()) / (1000 * 60),
      );
      console.log("Operation diagnostic");
      return res.status(429).send({
        message: `Too many failed attempts. Please try again in ${timeLeft} minutes using OTP or password.`,
      });
    }

    if (!otp) {
      if (!password) {
        console.log("Operation diagnostic");
        const generatedOtp = randomInt(100000, 1000000).toString();
        console.log("Operation diagnostic");

        try {
          // Send OTP via SMS using the new SMS service
          const smsSent = await SMSService.sendOTP(
            phoneNumber,
            generatedOtp,
            "unification",
          );

          if (!smsSent) {
            return res
              .status(500)
              .send({ message: "Failed to send OTP. Please try again." });
          }

          console.log(`SMS sent successfully to ${phoneNumber}`);
        } catch (smsError) {
          console.error(`Failed to send SMS to ${phoneNumber}:`, smsError);
          return res
            .status(500)
            .send({ message: "Failed to send OTP. Please try again." });
        }

        user.tempOtp = generatedOtp;
        user.otpExpires = Date.now() + 5 * 60 * 1000;
        await user.save();
        console.log("Operation diagnostic");
        return res.status(200).send({
          message: "OTP sent to your phone. Please provide it to proceed.",
        });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        user.failedPasswordAttempts += 1;
        console.log("Operation diagnostic");

        if (user.failedPasswordAttempts >= 5) {
          user.lockoutUntil = Date.now() + 60 * 60 * 1000;
          user.failedPasswordAttempts = 0;
          await user.save();
          console.log("Operation diagnostic");
          return res.status(429).send({
            message:
              "Too many failed attempts. Please try again in 1 hour using OTP or password.",
          });
        }

        await user.save();
        return res.status(401).send({
          message:
            "Incorrect password. Please verify your password or use OTP instead.",
          attempts: user.failedPasswordAttempts,
        });
      }

      user.failedPasswordAttempts = 0;
      await user.save();
      console.log("Operation diagnostic");
    } else {
      if (
        user.tempOtp !== otp ||
        !user.otpExpires ||
        Date.now() > user.otpExpires
      ) {
        console.log("Operation diagnostic");
        return res.status(400).send({ message: "Invalid or expired OTP." });
      }
      console.log("Operation diagnostic");
    }

    const unifiedAddress = await unifyWallets(user.privateKey);
    console.log(`Unified address generated: ${unifiedAddress}`);

    const binding = await verifyWalletBinding(user.privateKey, unifiedAddress);
    if (!binding.ok) {
      console.error(`[unify] wallet binding verification failed for ${phoneNumber}:`, binding.reason);
      return res.status(500).send({
        message: "Wallet binding verification failed. Please try again.",
      });
    }

    user.walletAddress = unifiedAddress;
    user.isUnified = true;
    user.tempOtp = undefined;
    user.otpExpires = undefined;
    await user.save();
    console.log("Operation diagnostic");

    res.send({
      message: "Wallets unified successfully!",
      unifiedWalletAddress: unifiedAddress,
    });
  } catch (error: any) {
    console.error(`Error in unify API for ${phoneNumber}:`, error);
    res.status(500).send({
      message: "Failed to unify wallets.",
      error: error.message || "Unknown error occurred",
    });
  }
};

export const migrate = async (req: Request, res: Response) => {
  const { phoneNumber, password, otp } = req.body;

  console.log("Raw request body:");

  if (!phoneNumber) {
    console.log("Migrate request failed: Phone number missing");
    return res.status(400).send({ message: "Phone number is required." });
  }

  try {
    console.log(`Migrating funds for phoneNumber: ${phoneNumber}`);
    const user = await User.findOne({ phoneNumber }).select("+privateKey");
    if (!user) {
      console.log("Operation diagnostic");
      return res.status(404).send({ message: "User not found." });
    }

    if (!user.isUnified || !user.walletAddress) {
      console.log("Operation diagnostic");
      return res.status(400).send({
        message: "User wallet is not unified. Please unify wallets first.",
      });
    }

    if (!otp) {
      if (!password) {
        console.log("Operation diagnostic");
        const generatedOtp = randomInt(100000, 1000000).toString();
        console.log("Operation diagnostic");

        try {
          // Send OTP via SMS using the new SMS service
          const smsSent = await SMSService.sendOTP(
            phoneNumber,
            generatedOtp,
            "migration",
          );

          if (!smsSent) {
            return res
              .status(500)
              .send({ message: "Failed to send OTP. Please try again." });
          }

          console.log(`SMS sent successfully to ${phoneNumber}`);
        } catch (smsError) {
          console.error(`Failed to send SMS to ${phoneNumber}:`, smsError);
          return res
            .status(500)
            .send({ message: "Failed to send OTP. Please try again." });
        }

        user.tempOtp = generatedOtp;
        user.otpExpires = Date.now() + 5 * 60 * 1000;
        await user.save();
        console.log("Operation diagnostic");
        return res.status(200).send({
          message: "OTP sent to your phone. Please provide it to proceed.",
        });
      }

      console.log("Operation diagnostic");
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        console.log("Operation diagnostic");
        return res.status(401).send({
          message:
            "Incorrect password. Please verify your password or use OTP.",
        });
      }
      console.log("Operation diagnostic");
    } else {
      if (
        user.tempOtp !== otp ||
        !user.otpExpires ||
        Date.now() > user.otpExpires
      ) {
        console.log("Operation diagnostic");
        return res.status(400).send({ message: "Invalid or expired OTP." });
      }
      console.log("Operation diagnostic");
    }

    if (!user.privateKey) {
      console.log(`Private key missing for ${phoneNumber}`);
      return res
        .status(400)
        .send({ message: "Private key not found in database!" });
    }

    const personalAccount = privateKeyToAccount({
      client,
      privateKey: user.privateKey,
    });
    const unifiedWalletAddress = user.walletAddress;
    const chains = [
      {
        name: "celo",
        chainId: config.celo.chainId,
        tokenAddress: config.celo.tokenAddress,
      },
      {
        name: "arbitrum",
        chainId: config.arbitrum.chainId,
        tokenAddress: config.arbitrum.tokenAddress,
      },
    ];
    const migrationResults = [];

    // Log unified wallet address
    console.log(`Unified wallet address: ${unifiedWalletAddress}`);

    for (const chain of chains) {
      try {
        const sourceWallet = smartWallet({
          chain: defineChain(chain.chainId),
          sponsorGas: false,
        });
        const sourceAccount = await sourceWallet.connect({
          client,
          personalAccount,
        });
        console.log(`Previous ${chain.name} address: ${sourceAccount.address}`);

        // Check balance
        const contract = getContract({
          client,
          chain: defineChain(chain.chainId),
          address: chain.tokenAddress,
        });
        const balance = await readContract({
          contract,
          method: "function balanceOf(address) view returns (uint256)",
          params: [sourceAccount.address],
        });
        const decimals = 6;
        const balanceInUSDC = Number(balance) / 10 ** decimals;
        console.log(
          `USDC balance on ${chain.name} for ${sourceAccount.address}: ${balanceInUSDC}`,
        );

        if (balanceInUSDC > 0) {
          const result = await migrateFunds(
            sourceAccount.address,
            unifiedWalletAddress,
            chain.name,
            user.privateKey,
          );
          migrationResults.push({
            chain: chain.name,
            transactionHash: result.transactionHash,
          });
          console.log(
            `Funds migrated on ${chain.name}: ${result.transactionHash}`,
          );
        } else {
          migrationResults.push({
            chain: chain.name,
            message: "No balance to migrate",
          });
          console.log(`No USDC balance to migrate on ${chain.name}`);
        }
      } catch (error: any) {
        console.error(`Migration failed for ${chain.name}:`, {
          errorMessage: error.message,
          errorDetails: error.shortMessage || error.details,
        });
        migrationResults.push({
          chain: chain.name,
          error: error.message || "Migration failed",
        });
      }
    }

    user.tempOtp = undefined;
    user.otpExpires = undefined;
    await user.save();
    console.log("Operation diagnostic");

    res.send({
      message: "Funds migration attempted for all chains.",
      unifiedWalletAddress,
      migrationResults,
    });
  } catch (error: any) {
    console.error(`Error in migrate API for ${phoneNumber}:`, error);
    res.status(500).send({
      message: "Failed to migrate funds.",
      error: error.message || "Unknown error occurred",
    });
  }
};

export const getReceiveInfo = async (req: Request, res: Response) => {
  try {
    // Get authenticated user from middleware
    const user = (req as any).user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
        data: null,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      });
    }

    if (!user.walletAddress)
      return res.status(409).json({
        success: false,
        message:
          "Wallet setup is pending. Account security settings are available.",
        error: { code: "WALLET_PROVISIONING_PENDING" },
      });

    // Supported chains for receiving crypto
    const supportedChains = [
      { name: "Arbitrum", id: "arbitrum", chainId: 42161 },
      { name: "Ethereum", id: "ethereum", chainId: 1 },
      { name: "Polygon", id: "polygon", chainId: 137 },
      { name: "Base", id: "base", chainId: 8453 },
      { name: "Optimism", id: "optimism", chainId: 10 },
      { name: "Celo", id: "celo", chainId: 42220 },
      { name: "Avalanche", id: "avalanche", chainId: 43114 },
      { name: "BNB Chain", id: "bnb", chainId: 56 },
      { name: "Scroll", id: "scroll", chainId: 534352 },
      { name: "Gnosis", id: "gnosis", chainId: 100 },
    ];
    // Capability-gated BOT networks share the wallet address, so they belong in
    // the receive list exactly like the primary chains above.
    for (const capability of botCapabilities()) {
      if (!capability.enabled || capability.testnet) continue;
      supportedChains.push({
        name: capability.name,
        id: capability.id,
        chainId: capability.chainId,
      });
    }

    const receiveInfo = {
      walletAddress: user.walletAddress,
      phoneNumber: user.phoneNumber,
      email: user.email || null,
      supportedChains,
      note: "This wallet address works across all supported chains. Make sure to select the correct network when sending.",
    };

    return res.json({
      success: true,
      message: "Receive information retrieved successfully",
      data: receiveInfo,
    });
  } catch (error: any) {
    console.error("Error in getReceiveInfo:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve receive information",
      data: null,
      error: {
        code: "SERVER_ERROR",
        message: error.message || "An unexpected error occurred",
      },
    });
  }
};

export const getUserBalance = async (req: Request, res: Response) => {
  try {
    // Get authenticated user from middleware
    const user = (req as any).user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
        data: null,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      });
    }

    if (!user.walletAddress)
      return res.status(409).json({
        success: false,
        message: "Wallet setup is pending.",
        error: { code: "WALLET_PROVISIONING_PENDING" },
      });

    // Check cache first (5 minute cache for balance data)
    const cacheKey = `balance:${user.walletAddress}:primary-mainnet-v5`;
    const cachedBalance =
      req.query.refresh === "true" ? null : await getCachedData(cacheKey);

    if (cachedBalance) {
      console.log("Operation diagnostic");
      return res.json({
        success: true,
        message: "User balance retrieved successfully (cached)",
        data: {
          ...cachedBalance,
          cached: true,
          cacheExpiry: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        },
      });
    }

    console.log("Operation diagnostic");

    // Focus on primary chains: Arbitrum (default), Base, Ethereum, and Celo
    const primaryChains = ["arbitrum", "base", "ethereum", "celo"];
    const balances: Record<string, Record<string, number>> = {};
    let totalUSDValue = 0;

    // BOT networks are capability-gated and join the same balance record.
    // The bot block and the primary chains resolve concurrently — running them
    // back to back made this endpoint take ~15s per refresh.
    const botWork = (async () => {
      const botIds: string[] = [];
      for (const capability of botCapabilities()) {
        if (!capability.enabled || capability.testnet) continue;
        botIds.push(capability.id);
        try {
          const botBalances = await botBalanceFor(
            user,
            capability.id as BotNetwork,
          );
          if (botBalances) {
            totalUSDValue += await botUsdValue(botBalances);
            balances[capability.id] = botBalances;
          }
        } catch (error: any) {
          console.error(
            `Failed to process BOT network ${capability.id}:`,
            error.message,
          );
        }
      }
      return botIds;
    })();

    // Get balances for each primary chain
    await Promise.all(primaryChains.map(async (chain) => {
      try {
        // Gas tokens (ETH) + ERC-20s this wallet can hold on the chain.
        const chainTokens = getBalanceTokens(chain as Chain);

        if (chainTokens.length === 0) return;

        balances[chain] = {};

        for (const token of chainTokens) {
          try {
            const tokenConfig = getTokenConfig(
              chain as Chain,
              token as TokenSymbol,
            );
            if (!tokenConfig) continue;

            const chainConfig = config[chain];
            if (!chainConfig?.chainId) continue;

            let balanceInToken: number;
            if (tokenConfig.address === "native") {
              const wei = await eth_getBalance(
                getRpcClient({
                  client,
                  chain: defineChain(chainConfig.chainId),
                }),
                { address: user.walletAddress as `0x${string}` },
              );
              balanceInToken = Number(ethers.formatUnits(wei, 18));
            } else {
              const contract = getContract({
                client,
                chain: defineChain(chainConfig.chainId),
                address: tokenConfig.address,
              });

              const balance = await readContract({
                contract,
                method: "function balanceOf(address) view returns (uint256)",
                params: [user.walletAddress],
              });

              balanceInToken = Number(balance) / 10 ** tokenConfig.decimals;
            }

            if (balanceInToken > 0) {
              balances[chain][token] = balanceInToken;

              // USD total: stables at $1, gas/volatile tokens at spot, others $0.
              const usdRate = await getUsdRate(token);
              if (usdRate > 0) totalUSDValue += balanceInToken * usdRate;
            }
          } catch (error: any) {
            // Skip tokens that fail to fetch
            console.error("Operation diagnostic");
          }
        }

        // Remove chain if no tokens have balance
        if (Object.keys(balances[chain]).length === 0) {
          delete balances[chain];
        }
      } catch (error: any) {
        console.error(`Failed to process chain ${chain}:`, error.message);
      }
    }));

    const botIds = await botWork;

    const balanceData = {
      walletAddress: user.walletAddress,
      totalUSDValue: Math.round(totalUSDValue * 100) / 100, // Round to 2 decimals
      balances,
      chainsWithBalance: Object.keys(balances).length,
      supportedChains: [...primaryChains, ...botIds],
      note: "Balances shown for primary chains: Arbitrum (default), Base, Ethereum, and Celo",
      lastUpdated: new Date().toISOString(),
    };

    // Cache the result for 5 minutes
    await setCachedData(cacheKey, balanceData, 300); // 5 minutes

    return res.json({
      success: true,
      message: "User balance retrieved successfully",
      data: balanceData,
    });
  } catch (error: any) {
    console.error("Error in getUserBalance:");
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve user balance",
      data: null,
      error: {
        code: "SERVER_ERROR",
        message: error.message || "An unexpected error occurred",
      },
    });
  }
};

// Get user balance for a specific chain
export const getUserBalanceByChain = async (req: Request, res: Response) => {
  try {
    // Get authenticated user from middleware
    const user = (req as any).user;
    const chain = String(req.params.chain);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
        data: null,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      });
    }

    if (!user.walletAddress)
      return res.status(409).json({
        success: false,
        message: "Wallet setup is pending.",
        error: { code: "WALLET_PROVISIONING_PENDING" },
      });

    // BOT networks share this endpoint so one chain selector serves every network.
    if (isBotNetwork(chain)) {
      const botConfig = getBotConfig(chain);
      if (!botConfig.enabled) {
        return res.status(400).json({
          success: false,
          message: `BOT network ${chain} is not enabled`,
          data: null,
          error: {
            code: "INVALID_CHAIN",
            message: `BOT network ${chain} is not enabled`,
          },
        });
      }
      const botCacheKey = `balance:${user.walletAddress}:${chain}:v2`;
      const cachedBotBalance =
        req.query.refresh === "true" ? null : await getCachedData(botCacheKey);
      if (cachedBotBalance) {
        return res.json({
          success: true,
          message: `User balance retrieved successfully for ${chain} (cached)`,
          data: {
            ...cachedBotBalance,
            cached: true,
            cacheExpiry: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
          },
        });
      }
      try {
        const botBalances = await botBalanceFor(user, chain);
        const chainBalanceData = {
          walletAddress: user.walletAddress,
          chain,
          balances: botBalances || {},
          totalUSDValue: Math.round((await botUsdValue(botBalances || {})) * 100) / 100,
          supportedTokens: Object.values(botConfig.tokens).map((t) => t.symbol),
          lastUpdated: new Date().toISOString(),
        };
        await setCachedData(botCacheKey, chainBalanceData, 180);
        return res.json({
          success: true,
          message: `User balance retrieved successfully for ${chain}`,
          data: chainBalanceData,
        });
      } catch (error: any) {
        console.error(`Error in getUserBalanceByChain(${chain}):`, error);
        return res.status(500).json({
          success: false,
          message: "Failed to retrieve user balance for chain",
          data: null,
          error: {
            code: "INTERNAL_ERROR",
            message: error.message || "An unexpected error occurred",
          },
        });
      }
    }

    // Validate chain parameter
    const supportedChains: string[] = paymentChains;
    if (!chain || !supportedChains.includes(chain)) {
      return res.status(400).json({
        success: false,
        message: "Invalid or unsupported chain",
        data: null,
        error: {
          code: "INVALID_CHAIN",
          message: `Supported chains: ${supportedChains.join(", ")}`,
        },
      });
    }

    // Check cache first (3 minute cache for individual chain balance)
    const cacheKey = `balance:${user.walletAddress}:${chain}:exact-v2`;
    const cachedBalance =
      req.query.refresh === "true" ? null : await getCachedData(cacheKey);

    if (cachedBalance) {
      console.log("Operation diagnostic");
      return res.json({
        success: true,
        message: `User balance retrieved successfully for ${chain} (cached)`,
        data: {
          ...cachedBalance,
          cached: true,
          cacheExpiry: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
        },
      });
    }

    console.log("Operation diagnostic");

    // Get supported tokens (incl. native gas token) for this specific chain
    const chainTokens = getBalanceTokens(chain as Chain);
    const balances: Record<string, number> = {};
    const exactBalances: Record<string, string> = {};
    let totalUSDValue = 0;

    for (const token of chainTokens) {
      try {
        const tokenConfig = getTokenConfig(
          chain as Chain,
          token as TokenSymbol,
        );
        if (!tokenConfig) continue;

        const chainConfig = config[chain];
        if (!chainConfig?.chainId) continue;

        let rawBalance: bigint;
        if (tokenConfig.address === "native") {
          rawBalance = await eth_getBalance(
            getRpcClient({
              client,
              chain: defineChain(chainConfig.chainId),
            }),
            { address: user.walletAddress as `0x${string}` },
          );
        } else {
          const contract = getContract({
            client,
            chain: defineChain(chainConfig.chainId),
            address: tokenConfig.address,
          });

          rawBalance = await readContract({
            contract,
            method: "function balanceOf(address) view returns (uint256)",
            params: [user.walletAddress],
          });
        }

        exactBalances[token] = ethers.formatUnits(
          rawBalance,
          tokenConfig.decimals,
        );
        const balanceInToken = Number(rawBalance) / 10 ** tokenConfig.decimals;

        if (balanceInToken > 0) {
          balances[token] = balanceInToken;

          const usdRate = await getUsdRate(token);
          if (usdRate > 0) totalUSDValue += balanceInToken * usdRate;
        }
      } catch (error: any) {
        console.error("Operation diagnostic");
      }
    }

    const chainBalanceData = {
      walletAddress: user.walletAddress,
      chain,
      balances,
      exactBalances,
      totalUSDValue: Math.round(totalUSDValue * 100) / 100,
      supportedTokens: chainTokens,
      lastUpdated: new Date().toISOString(),
    };

    // Cache the result for 3 minutes
    await setCachedData(cacheKey, chainBalanceData, 180); // 3 minutes

    return res.json({
      success: true,
      message: `User balance retrieved successfully for ${chain}`,
      data: chainBalanceData,
    });
  } catch (error: any) {
    console.error("Error in getUserBalanceByChain:");
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve user balance for chain",
      data: null,
      error: {
        code: "INTERNAL_ERROR",
        message: error.message || "An unexpected error occurred",
      },
    });
  }
};
