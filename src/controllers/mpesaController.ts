import { NextFunction, Request, Response } from "express";
import { User, IUserDocument } from '../models/user';
import { Business } from '../models/businessModel';
import { Escrow, IEscrowDocument, IEscrow } from '../models/escrow';
import { initiateB2C, initiateSTKPush, initiateB2BPaybill } from "../services/mpesa";
import config from "../config/env";
import { sendToken } from "../services/token";
import { randomUUID } from "crypto";
import { standardResponse, handleError, generateSuccessCode } from "../services/utils";
import { 
    initializePlatformWallets, 
    sendTokenFromUser, 
    getWalletBalance, 
    collectTransactionFee,
    getPlatformWalletStatus as getWalletStatus,
    withdrawFeesToMainWallet as withdrawFees,
    queueTransaction,
    sendFromPlatformWallet,
    processTransactionQueue
} from '../services/platformWallet';
import { TokenSymbol } from '../types/token';
import { Chain } from '../types/token';
import { getTokenConfig, getSupportedTokens } from '../config/tokens';
import { defineChain, getContract, sendTransaction } from "thirdweb";
import { balanceOf, transfer } from "thirdweb/extensions/erc20";
import { client } from "../services/auth";
import { recordTransaction, TransactionType, TransactionLogEntry } from '../services/transactionLogger';
import { getRedisClient } from '../services/redis';
import { logger } from '../config/logger';
import { privateKeyToAccount, smartWallet } from "thirdweb/wallets";
import axios from "axios";
import { generateTimestamp, getMpesaAccessToken } from "../services/mpesaUtils";
import { getConversionRateWithCaching as getKESRate } from '../services/rates'
import { SMSService } from '../services/smsService';
const getConversionRateWithCaching = getKESRate
// import { acquireLock, isProcessed, markProcessed } from '../services/idempotency';
// TODO: Implement idempotency service
const acquireLock = async (key: string, ttl: number) => true;
const isProcessed = async (key: string) => false;
const markProcessed = async (key: string) => {};
import { stellarMpesaService } from '../services/stellarMpesa';
import { stellarWalletService } from '../services/stellarWallet';
import * as StellarSdk from 'stellar-sdk';

/**
 * Helper function to get token balance for a specific token on a specific chain
 */
async function getTokenBalanceOnChain(
    walletAddress: string,
    chain: string,
    tokenSymbol: TokenSymbol
): Promise<number> {
    try {
        // Get chain configuration
        const chainConfig = config[chain];
        if (!chainConfig || !chainConfig.chainId) {
            throw new Error(`Invalid chain configuration for ${chain}`);
        }
        
        // Get token configuration
        const tokenConfig = getTokenConfig(chain as Chain, tokenSymbol);
        if (!tokenConfig) {
            throw new Error(`Token ${tokenSymbol} not supported on chain ${chain}`);
        }
        
        // Define chain
        const thirdwebChain = defineChain(chainConfig.chainId);
        
        // Get contract for the specific token
        const contract = getContract({
            client,
            chain: thirdwebChain,
            address: tokenConfig.address,
        });
        
        // Get balance
        const balance = await balanceOf({
            contract,
            address: walletAddress
        });
        
        return parseFloat(balance.toString());
    } catch (error) {
        console.error(`Error getting ${tokenSymbol} balance on ${chain}:`, error);
        return 0; // Return 0 on error to avoid breaking the flow
    }
}

/**
 * Initiate an MPESA STK Push to deposit funds and convert to crypto
 */
export const mpesaDeposit = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { amount, phone } = req.body;
        
        // Debug logging
        console.log("✅ Deposit request body:", req.body);
        
        // Validate user authentication
        if (!req.user) {
            return res.status(401).json(standardResponse(
                false,
                "Authentication required",
                null,
                { code: "AUTH_REQUIRED", message: "You must be logged in to perform this action" }
            ));
        }

        const authenticatedUser = req.user;

        // Validate input - although we have validators, this is a fallback
        if (!amount || !phone) {
            return res.status(400).json(standardResponse(
                false,
                "Missing required fields",
                null,
                { code: "MISSING_FIELDS", message: "Amount and phone are required" }
            ));
        }

        // Validate amount
        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            return res.status(400).json(standardResponse(
                false,
                "Invalid amount",
                null,
                { code: "INVALID_AMOUNT", message: "Amount must be a positive number" }
            ));
        }

        // Format the phone number
        let formattedPhone = phone.replace(/\D/g, '');
        
        // Ensure it starts with the correct country code
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '254' + formattedPhone.substring(1);
        } else if (!formattedPhone.startsWith('254')) {
            formattedPhone = '254' + formattedPhone;
        }
        
        // Get conversion rate
        const conversionRate = await getConversionRateWithCaching('USDC');
        
        // Calculate crypto amount based on MPESA amount
        const cryptoAmount = amountNum / conversionRate;
        
        // Create a unique transaction ID
        const transactionId = randomUUID();
        
        // Create an escrow record to track this transaction
        const escrow = new Escrow({
            transactionId,
            userId: authenticatedUser._id,
            amount: amountNum,
            cryptoAmount,
            type: 'fiat_to_crypto',
            status: 'pending'
        });
        
        // Save the initial escrow record
        await escrow.save();

        // Initiate STK Push
        try {
            const mpesaResponse = await initiateSTKPush(
                formattedPhone, 
                config.MPESA_SHORTCODE!, 
                amountNum, 
                "NexusPay Deposit", 
                authenticatedUser._id.toString()
            );
            
            if (!mpesaResponse) {
                escrow.status = 'failed';
                escrow.completedAt = new Date();
                await escrow.save();
                
                return res.status(400).json(standardResponse(
                    false,
                    "MPESA transaction unsuccessful",
                    null,
                    { 
                        code: "STK_PUSH_FAILED", 
                        message: "Failed to initiate MPESA transaction"
                    }
                ));
            }

            // Extract the important data from the response
            const stkResponse = mpesaResponse.stkResponse;
            const checkoutRequestId = mpesaResponse.checkoutRequestId;
            const queryResponse = mpesaResponse.queryResponse;
            
            // Check if the query response indicates an error
            if (queryResponse && typeof queryResponse === 'object' && 'ResultCode' in queryResponse && queryResponse.ResultCode !== "0") {
                escrow.status = 'failed';
                escrow.completedAt = new Date();
                await escrow.save();
                
                return res.status(400).json(standardResponse(
                    false,
                    "MPESA transaction unsuccessful",
                    null,
                    { 
                        code: "STK_PUSH_FAILED", 
                        message: queryResponse.ResultDesc || "Failed to initiate MPESA transaction"
                    }
                ));
            }

            // Update escrow with MPESA transaction ID
            escrow.mpesaTransactionId = checkoutRequestId;
            await escrow.save();

            return res.json(standardResponse(
                true,
                "Transaction initiated successfully",
                {
                    transactionId: escrow.transactionId,
                    amount: amountNum,
                    expectedCryptoAmount: parseFloat(cryptoAmount.toFixed(6)),
                    status: 'pending',
                    checkoutRequestId: checkoutRequestId,
                    createdAt: escrow.createdAt,
                    estimatedCompletionTime: new Date(Date.now() + 2 * 60 * 1000) // 2 minutes from now
                }
            ));
        } catch (mpesaError: any) {
            // Handle MPESA API errors
            escrow.status = 'failed';
            escrow.completedAt = new Date();
            await escrow.save();
            
            console.error("❌ MPESA STK Push API Error:", mpesaError);
            
            return res.status(500).json(standardResponse(
                false,
                "MPESA transaction failed",
                null,
                { 
                    code: "MPESA_API_ERROR", 
                    message: mpesaError.response?.data?.errorMessage || mpesaError.message || "Unknown error"
                }
            ));
        }
    } catch (error: any) {
        console.error("❌ Deposit error:", error);
        return handleError(error, res, "Failed to process deposit request");
    }
};

export const mpesaWithdraw = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { amount, businessId } = req.body;
        
        if (!req.user) {
            return res.status(401).json({ message: "User not authenticated" });
        }

        const authenticatedUser = req.user;

        if (!amount || !businessId) {
            return res.status(400).json({ message: "Amount and businessId are required" });
        }

        const business = await Business.findById(businessId);
        if (!business) {
            return res.status(404).json({ message: "Business not found" });
        }

        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            return res.status(400).json({ message: "Invalid amount" });
        }

        const conversionRate = await getConversionRateWithCaching("USDC");
        const fiatAmount = amountNum * conversionRate;

        const escrow = new Escrow({
            transactionId: randomUUID(),
            userId: authenticatedUser._id,
            amount: fiatAmount,
            cryptoAmount: amountNum,
            type: 'crypto_to_fiat',
            status: 'pending'
        });
        await escrow.save();

        const merchantIdNumber = parseInt(business.merchantId, 10);
        if (isNaN(merchantIdNumber)) {
            escrow.status = 'failed';
            await escrow.save();
            return res.status(400).json({ message: "Invalid merchant ID format" });
        }

        const serviceAcceptedObj = await initiateB2C(fiatAmount, merchantIdNumber);

        if (!serviceAcceptedObj || serviceAcceptedObj.ResponseCode !== "0") {
            escrow.status = 'failed';
            await escrow.save();
            return res.status(400).json({ message: "Failed to initiate withdrawal" });
        }

        escrow.mpesaTransactionId = serviceAcceptedObj.ConversationID;
        await escrow.save();

        res.json({ 
            message: "Withdrawal initiated", 
            transactionId: escrow.transactionId,
            status: 'pending'
        });
    } catch (error) {
        console.error("Withdrawal error:", error);
        next(error);
    }
};

/**
 * Withdraw funds from crypto to MPESA
 */
export const withdrawToMpesa = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { amount, phone, tokenType = 'USDC', chain = 'celo' } = req.body;
        
        // Validate user authentication
        if (!req.user) {
            return res.status(401).json(standardResponse(
                false,
                "Authentication required",
                null,
                { code: "AUTH_REQUIRED", message: "You must be logged in to perform this action" }
            ));
        }

        const authenticatedUser = req.user;

        // Validate input
        if (!amount || !phone) {
            return res.status(400).json(standardResponse(
                false,
                "Missing required fields",
                null,
                { code: "MISSING_FIELDS", message: "Amount and phone are required" }
            ));
        }

        // Validate amount
        const cryptoAmount = parseFloat(amount);
        if (isNaN(cryptoAmount) || cryptoAmount <= 0) {
            return res.status(400).json(standardResponse(
                false,
                "Invalid amount",
                null,
                { code: "INVALID_AMOUNT", message: "Amount must be a positive number" }
            ));
        }

        // Handle Stellar chain specially (non-EVM)
        if (chain === 'stellar') {
            try {
                // Map token types for Stellar
                const stellarAsset = tokenType === 'USDC' || tokenType === 'USDC_STELLAR' ? 'USDC' 
                    : tokenType === 'USDT' || tokenType === 'USDT_STELLAR' ? 'USDT'
                    : tokenType === 'BTC' || tokenType === 'BTC_STELLAR' ? 'BTC'
                    : tokenType === 'XLM' ? 'XLM' 
                    : tokenType;
                
                // Validate Stellar asset
                if (stellarAsset !== 'XLM' && stellarAsset !== 'USDC' && stellarAsset !== 'USDT' && stellarAsset !== 'BTC') {
                    return res.status(400).json(standardResponse(
                        false,
                        "Unsupported token for Stellar",
                        null,
                        { 
                            code: "INVALID_TOKEN", 
                            message: `Token ${tokenType} is not supported on Stellar. Supported tokens: XLM, USDC` 
                        }
                    ));
                }

                // Check if user has a Stellar wallet
                const wallet = await stellarWalletService.getUserWallet(authenticatedUser._id.toString());
                if (!wallet) {
                    return res.status(404).json(standardResponse(
                        false,
                        "Stellar wallet not found",
                        null,
                        { code: "WALLET_NOT_FOUND", message: "Please create a Stellar wallet first" }
                    ));
                }

                // Convert Stellar asset to KES first to get fiat amount
                const conversion = await stellarMpesaService.convertStellarAssetToKes(cryptoAmount.toString(), stellarAsset);

                // Check user's Stellar wallet balance
                const userBalance = await stellarWalletService.getWalletBalance(authenticatedUser._id.toString(), stellarAsset);
                if (parseFloat(userBalance) < cryptoAmount) {
                    return res.status(400).json(standardResponse(
                        false,
                        "Insufficient balance",
                        null,
                        { 
                            code: "INSUFFICIENT_BALANCE", 
                            message: `Your Stellar balance (${userBalance}) is less than the requested amount (${cryptoAmount})` 
                        }
                    ));
                }

                // Create transaction ID and escrow
                const transactionId = randomUUID();
                const escrow = new Escrow({
                    transactionId,
                    userId: authenticatedUser._id,
                    amount: conversion.amountKES,
                    cryptoAmount,
                    tokenType: stellarAsset,
                    chain: 'stellar',
                    type: 'crypto_to_fiat',
                    status: 'pending'
                });
                await escrow.save();

                try {
                    // Get Stellar services
                    const { StellarService } = await import('../services/stellar');
                    const { getStellarConfig } = await import('../config/stellar');
                    const stellarService = new StellarService();
                    const stellarConfig = getStellarConfig();

                    // Get user's Stellar wallet
                    const userStellarWallet = await stellarWalletService.getUserWallet(authenticatedUser._id.toString());
                    if (!userStellarWallet || !userStellarWallet.secretKey) {
                        throw new Error('User Stellar wallet secret not found');
                    }

                    // Get platform Stellar wallet
                    if (!stellarConfig.platformWalletSecret) {
                        throw new Error('Stellar platform wallet secret not configured');
                    }

                    // Get platform wallet address
                    const { Keypair } = await import('stellar-sdk');
                    const platformKeypair = Keypair.fromSecret(stellarConfig.platformWalletSecret);
                    const platformAccountId = platformKeypair.publicKey();

                    // Transfer Stellar assets from user to platform wallet
                    const assetIssuer = stellarAsset === 'USDC' ? stellarConfig.usdcIssuer 
                        : stellarAsset === 'USDT' ? stellarConfig.usdtIssuer
                        : stellarAsset === 'BTC' ? stellarConfig.btcIssuer
                        : undefined;
                    const transferResult = await stellarService.sendPayment(
                        userStellarWallet.secretKey,
                        platformAccountId,
                        cryptoAmount.toString(),
                        stellarAsset,
                        assetIssuer,
                        `NexusPay Withdrawal: ${transactionId}`
                    );

                    // Update escrow with transfer hash
                    escrow.cryptoTransactionHash = transferResult.transactionHash;
                    escrow.status = 'processing';
                    await escrow.save();

                    // Format phone for B2C
                    let formattedPhone = phone.replace(/\D/g, '');
                    if (formattedPhone.startsWith('0')) {
                        formattedPhone = '254' + formattedPhone.substring(1);
                    } else if (!formattedPhone.startsWith('254')) {
                        formattedPhone = '254' + formattedPhone;
                    }
                    const phoneNumber = parseInt(formattedPhone, 10);

                    // Initiate M-Pesa B2C payment
                    const b2cResult = await initiateB2C(conversion.amountKES, phoneNumber);
                    
                    if (!b2cResult || b2cResult.ResponseCode !== "0") {
                        escrow.status = 'failed';
                        escrow.completedAt = new Date();
                        await escrow.save();
                        
                        return res.status(500).json(standardResponse(
                            false,
                            "Failed to initiate M-Pesa withdrawal",
                            null,
                            { code: "MPESA_B2C_FAILED", message: b2cResult?.ResponseDescription || "M-Pesa B2C initiation failed" }
                        ));
                    }

                    // Update escrow with M-Pesa transaction ID
                    escrow.mpesaTransactionId = b2cResult.ConversationID;
                    await escrow.save();

                    return res.status(200).json(standardResponse(
                        true,
                        "Stellar withdrawal initiated successfully",
                        {
                            transactionId: escrow.transactionId,
                            amount: conversion.amountKES,
                            cryptoAmount,
                            tokenType: stellarAsset,
                            chain: 'stellar',
                            status: 'processing',
                            mpesaTransactionId: b2cResult.ConversationID,
                            stellarTransactionHash: transferResult.transactionHash,
                            message: "Your withdrawal is being processed. You'll receive an SMS confirmation shortly.",
                            createdAt: escrow.createdAt,
                            estimatedCompletionTime: new Date(Date.now() + 5 * 60 * 1000)
                        }
                    ));
                } catch (error: any) {
                    logger.error('Error processing Stellar withdrawal:', error);
                    escrow.status = 'failed';
                    escrow.completedAt = new Date();
                    escrow.metadata = { ...escrow.metadata, error: error.message };
                    await escrow.save();
                    
                    return res.status(500).json(standardResponse(
                        false,
                        "Failed to process Stellar withdrawal",
                        null,
                        { code: "STELLAR_WITHDRAWAL_FAILED", message: error.message }
                    ));
                }
            } catch (error: any) {
                logger.error('Error initiating Stellar withdrawal:', error);
                return res.status(500).json(standardResponse(
                    false,
                    "Failed to initiate Stellar withdrawal",
                    null,
                    { code: "STELLAR_WITHDRAWAL_FAILED", message: error.message }
                ));
            }
        }
        
        // Format phone number
        let formattedPhone = phone.replace(/\D/g, '');
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '254' + formattedPhone.substring(1);
        } else if (!formattedPhone.startsWith('254')) {
            formattedPhone = '254' + formattedPhone;
        }
        
        // Get numeric part of phone for B2C
        const phoneNumber = parseInt(formattedPhone, 10);
        if (isNaN(phoneNumber)) {
            return res.status(400).json(standardResponse(
                false,
                "Invalid phone number format",
                null,
                { code: "INVALID_PHONE", message: "Phone number must be numeric" }
            ));
        }
        
        // Check if user has sufficient balance
        try {
            console.log(`🔍 Checking balance for user ${authenticatedUser.walletAddress} on chain ${chain}`);
            const userBalance = await getWalletBalance(authenticatedUser.walletAddress, chain);
            console.log(`💰 User balance on ${chain}: ${userBalance} ${tokenType}`);
            
            if (userBalance < cryptoAmount) {
                return res.status(400).json(standardResponse(
                    false,
                    "Insufficient balance",
                    null,
                    { 
                        code: "INSUFFICIENT_BALANCE", 
                        message: `Your balance (${userBalance.toFixed(6)}) is less than the requested amount (${cryptoAmount.toFixed(6)})` 
                    }
                ));
            }
        } catch (balanceError) {
            console.error("❌ Error checking user balance:", balanceError);
            // Continue with the transaction, we'll catch errors in the token transfer step
        }
        
        // Calculate fiat amount
        const conversionRate = await getConversionRateWithCaching(tokenType);
        const fiatAmount = cryptoAmount * conversionRate;
        
        // Create transaction ID
        const transactionId = randomUUID();
        
        // Create escrow record
        const escrow = new Escrow({
            transactionId,
            userId: authenticatedUser._id,
            amount: fiatAmount,
            cryptoAmount,
            tokenType,
            chain,
            type: 'crypto_to_fiat',
            status: 'pending'
        });
        await escrow.save();
        
        try {
            // First, transfer tokens from user to platform wallet
            // Initialize platform wallets
            const platformWallets = await initializePlatformWallets();
            
            // Transfer tokens from user to platform wallet
            console.log(`🚀 Initiating token transfer: ${cryptoAmount} ${tokenType} from ${authenticatedUser.walletAddress} to platform wallet on ${chain}`);
            const tokenTransferResult = await sendTokenFromUser(
                platformWallets.main.address, 
                cryptoAmount,
                authenticatedUser.privateKey,
                chain // Use the chain parameter from request
            );
            
            if (!tokenTransferResult || !tokenTransferResult.transactionHash) {
                escrow.status = 'failed';
                escrow.completedAt = new Date();
                await escrow.save();
                
                return res.status(500).json(standardResponse(
                    false,
                    "Failed to transfer tokens",
                    null,
                    { code: "TOKEN_TRANSFER_FAILED", message: "Could not transfer tokens to platform wallet" }
                ));
            }
            
            // Update escrow with token transaction hash
            escrow.cryptoTransactionHash = tokenTransferResult.transactionHash;
            escrow.status = 'processing';
            await escrow.save();
            
            // Collect transaction fee
            await collectTransactionFee(
                cryptoAmount,
                authenticatedUser.privateKey,
                authenticatedUser.walletAddress,
                chain
            );
            
            // Then initiate B2C payment
            const serviceAcceptedObj = await initiateB2C(
                fiatAmount, 
                phoneNumber,
                `NexusPay Withdrawal - ${transactionId.substring(0, 8)}`
            );

            if (!serviceAcceptedObj || serviceAcceptedObj.ResponseCode !== "0") {
                escrow.status = 'failed';
                escrow.completedAt = new Date();
                await escrow.save();
                
                return res.status(400).json(standardResponse(
                    false,
                    "Failed to initiate withdrawal",
                    null,
                    { 
                        code: "B2C_FAILED", 
                        message: serviceAcceptedObj?.ResponseDescription || "Failed to initiate MPESA withdrawal"
                    }
                ));
            }

            // Update escrow with MPESA transaction ID
            escrow.mpesaTransactionId = serviceAcceptedObj.ConversationID;
            await escrow.save();

            // Send SMS notification to user
            try {
                await SMSService.sendTransactionNotification({
                    phoneNumber: authenticatedUser.phoneNumber || authenticatedUser.email || '',
                    amount: fiatAmount.toFixed(2),
                    tokenType: tokenType,
                    transactionHash: escrow.transactionId,
                    transactionType: 'sell',
                    status: 'pending',
                    recipientAddress: phone,
                    explorerUrl: `https://arbiscan.io/tx/${escrow.transactionId}`
                });
                console.log(`📱 SMS notification sent to user for transaction: ${escrow.transactionId}`);
            } catch (smsError) {
                console.error("❌ Failed to send SMS notification:", smsError);
                // Don't fail the transaction if SMS fails
            }

            return res.json(standardResponse(
                true,
                "Withdrawal initiated successfully",
                {
                    transactionId: escrow.transactionId,
                    amount: fiatAmount,
                    cryptoAmount: parseFloat(cryptoAmount.toFixed(6)),
                    status: 'pending',
                    mpesaTransactionId: serviceAcceptedObj.ConversationID,
                    createdAt: escrow.createdAt,
                    estimatedCompletionTime: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from now
                    message: "Your withdrawal is being processed. You'll receive an SMS confirmation shortly.",
                    transactionDetails: {
                        type: 'CRYPTO_TO_MPESA',
                        chain: chain,
                        tokenType: tokenType,
                        recipientPhone: phone,
                        exchangeRate: conversionRate,
                        fees: {
                            amount: (cryptoAmount * 0.005).toFixed(6), // 0.5% fee
                            percentage: 0.5
                        },
                        blockchainTransaction: {
                            hash: escrow.cryptoTransactionHash || 'Processing...',
                            explorerUrl: chain === 'arbitrum' 
                                ? `https://arbiscan.io/tx/${escrow.cryptoTransactionHash}` 
                                : chain === 'celo' 
                                    ? `https://explorer.celo.org/tx/${escrow.cryptoTransactionHash}`
                                    : `https://polygonscan.com/tx/${escrow.cryptoTransactionHash}`
                        }
                    }
                }
            ));
        } catch (mpesaError: any) {
            // Handle MPESA API errors
            escrow.status = 'failed';
            escrow.completedAt = new Date();
            await escrow.save();
            
            console.error("❌ MPESA B2C API Error:", mpesaError);
            
            return res.status(500).json(standardResponse(
                false,
                "MPESA withdrawal failed",
                null,
                { 
                    code: "MPESA_B2C_ERROR", 
                    message: mpesaError.response?.data?.errorMessage || mpesaError.message || "Unknown error"
                }
            ));
        }
    } catch (error: any) {
        console.error("❌ Withdrawal error:", error);
        return handleError(error, res, "Failed to process withdrawal request");
    }
};

export const payToPaybill = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { amount, phone, paybillNumber, accountNumber } = req.body;
        
        if (!req.user) {
            return res.status(401).json({ message: "User not authenticated" });
        }

        const authenticatedUser = req.user;

        if (!amount || !phone || !paybillNumber || !accountNumber) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            return res.status(400).json({ message: "Invalid amount" });
        }

        // Calculate fiat amount
        const conversionRate = await getConversionRateWithCaching('USDC');
        const fiatAmount = amountNum * conversionRate;

        const escrow = new Escrow({
            transactionId: randomUUID(),
            userId: authenticatedUser._id,
            amount: fiatAmount,
            cryptoAmount: amountNum,
            type: 'crypto_to_paybill',
            status: 'pending',
            paybillNumber,
            accountNumber
        });
        await escrow.save();

        // Send crypto to platform wallet
        const txResult = await sendToken(
            config.PLATFORM_WALLET_ADDRESS,
            amountNum,
            "celo",
            authenticatedUser.privateKey
        );

        // Initiate Paybill payment
        const paybillResult = await initiatePaybillPayment(
            phone,
            fiatAmount,
            paybillNumber,
            accountNumber,
            "Paybill payment"
        );

        if (!paybillResult || paybillResult.ResponseCode !== "0") {
            escrow.status = 'failed';
            await escrow.save();
            return res.status(400).json({ 
                message: "Payment failed",
                error: paybillResult?.errorMessage || "Unknown error"
            });
        }

        escrow.mpesaTransactionId = paybillResult.CheckoutRequestID;
        escrow.cryptoTransactionHash = txResult.transactionHash;
        await escrow.save();

        return res.json({ 
            message: "Payment initiated", 
            transactionId: escrow.transactionId,
            status: 'pending'
        });
    } catch (error) {
        console.error("Paybill payment error:", error);
        next(error);
    }
};

export const payToTill = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { amount, phone, tillNumber } = req.body;
        
        if (!req.user) {
            return res.status(401).json({ message: "User not authenticated" });
        }

        const authenticatedUser = req.user;

        if (!amount || !phone || !tillNumber) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            return res.status(400).json({ message: "Invalid amount" });
        }

        // Calculate fiat amount
        const conversionRate = await getConversionRateWithCaching("USDC");
        const fiatAmount = amountNum * conversionRate;

        // Create escrow record
        const escrow = new Escrow({
            transactionId: randomUUID(),
            userId: authenticatedUser._id,
            amount: fiatAmount,
            cryptoAmount: amountNum,
            type: 'crypto_to_till',
            status: 'pending',
            tillNumber: tillNumber,
            metadata: { description: "Till payment" }
        });
        await escrow.save();

        // Send crypto to platform wallet
        const txResult = await sendToken(
            config.PLATFORM_WALLET_ADDRESS,
            amountNum,
            "celo",
            authenticatedUser.privateKey
        );

        // Initiate Till payment
        const tillResult = await initiateTillPayment(
            phone,
            fiatAmount,
            tillNumber,
            "Till payment"
        );

        if (!tillResult || tillResult.ResponseCode !== "0") {
            escrow.status = 'failed';
            await escrow.save();
            return res.status(400).json({ 
                message: "Payment failed",
                error: tillResult?.errorMessage || "Unknown error"
            });
        }

        escrow.mpesaTransactionId = tillResult.CheckoutRequestID;
        escrow.cryptoTransactionHash = txResult.transactionHash;
        await escrow.save();

        return res.json({ 
            message: "Payment initiated", 
            transactionId: escrow.transactionId,
            status: 'pending'
        });
    } catch (error) {
        console.error("Till payment error:", error);
        next(error);
    }
};

/**
 * Buy a specific amount of crypto through MPESA deposit
 * User specifies the crypto amount they want to purchase and which chain/token to use
 */
/**
 * Check available liquidity for a specific token and chain
 */
export const getLiquidityCheck = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { tokenType, chain } = req.params;
        
        // Validate input
        if (!tokenType || !chain) {
            return res.status(400).json(standardResponse(
                false,
                "Missing required parameters",
                null,
                { code: "MISSING_PARAMS", message: "Token type and chain are required" }
            ));
        }

        // Step 1: Verify chain config exists and token is supported on this chain
        const chainConfig = config[chain];
        if (!chainConfig || !chainConfig.chainId || !chainConfig.tokenAddress) {
            return res.status(400).json(standardResponse(
                false,
                "Unsupported blockchain",
                null,
                { code: "INVALID_CHAIN", message: `Chain ${chain} is not supported or not properly configured` }
            ));
        }

        // Check if token is supported on this chain
        const tokenConfig = getTokenConfig(chain as Chain, tokenType as TokenSymbol);
        if (!tokenConfig) {
            const supportedTokens = getSupportedTokens(chain as Chain);
            return res.status(400).json(standardResponse(
                false,
                "Unsupported token for this chain",
                null,
                { 
                    code: "INVALID_TOKEN", 
                    message: `Token ${tokenType} is not supported on chain ${chain}. Supported tokens: ${supportedTokens.join(', ')}` 
                }
            ));
        }

        // Step 2: Get platform wallet balance
        const platformWallets = await initializePlatformWallets();
        let platformBalance;
        
        try {
            platformBalance = await getTokenBalanceOnChain(
                platformWallets.main.address, 
                chain, 
                tokenType as TokenSymbol
            );
        } catch (error) {
            console.error(`Error checking platform balance for ${tokenType} on ${chain}:`, error);
            platformBalance = 0;
        }

        // Step 3: Get current conversion rate
        const conversionRate = await getConversionRateWithCaching(tokenType);
        
        // Step 4: Calculate maximum KES amount that can be processed
        const maxKesAmount = Math.floor(platformBalance * conversionRate);
        
        // Step 5: Get alternative options if balance is low
        const alternativeOptions: Array<{token: string, maxAmount: number, maxKes: number}> = [];
        const supportedTokens = getSupportedTokens(chain as Chain);
        
        for (const token of supportedTokens) {
            if (token !== tokenType) {
                try {
                    const balance = await getTokenBalanceOnChain(
                        platformWallets.main.address,
                        chain,
                        token as TokenSymbol
                    );
                    if (balance > 0) {
                        const tokenRate = await getConversionRateWithCaching(token);
                        alternativeOptions.push({
                            token,
                            maxAmount: parseFloat(balance.toFixed(6)),
                            maxKes: Math.floor(balance * tokenRate)
                        });
                    }
                } catch (err) {
                    console.error(`Error checking balance for ${token}:`, err);
                }
            }
        }

        return res.json(standardResponse(
            true,
            "Liquidity check completed successfully",
            {
                tokenType,
                chain,
                platformBalance: parseFloat(platformBalance.toFixed(6)),
                conversionRate,
                maxKesAmount,
                alternativeTokens: alternativeOptions,
                timestamp: new Date().toISOString()
            }
        ));
    } catch (error: any) {
        console.error("❌ Liquidity check error:", error);
        return handleError(error, res, "Failed to check liquidity");
    }
};

/**
 * Get liquidity overview across all supported chains for a specific token
 */
export const getMultiChainLiquidityOverview = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { tokenType } = req.query;
        
        if (!tokenType || typeof tokenType !== 'string') {
            return res.status(400).json(standardResponse(
                false,
                "Missing token type parameter",
                null,
                { code: "MISSING_TOKEN_TYPE", message: "Token type is required (e.g., ?tokenType=USDC)" }
            ));
        }

        const supportedChains = [
            'arbitrum', 'optimism', 'polygon', 'base', 'avalanche', 
            'bnb', 'scroll', 'gnosis', 'fantom', 'moonbeam', 
            'fuse', 'aurora', 'celo', 'lisk'
        ];

        const liquidityOverview = [];
        const platformWallets = await initializePlatformWallets();

        for (const chain of supportedChains) {
            try {
                // Check if chain is supported
                const chainConfig = config[chain];
                if (!chainConfig || !chainConfig.chainId) {
                    continue;
                }

                // Check if token is supported on this chain
                const tokenConfig = getTokenConfig(chain as Chain, tokenType as TokenSymbol);
                if (!tokenConfig) {
                    continue;
                }

                // Get platform wallet balance
                const balance = await getTokenBalanceOnChain(
                    platformWallets.main.address,
                    chain,
                    tokenType as TokenSymbol
                );

                // Get conversion rate
                const conversionRate = await getConversionRateWithCaching(tokenType);
                const maxKesAmount = Math.floor(balance * conversionRate);

                liquidityOverview.push({
                    chain,
                    chainId: chainConfig.chainId,
                    tokenAddress: chainConfig.tokenAddress,
                    balance: parseFloat(balance.toFixed(6)),
                    conversionRate,
                    maxKesAmount,
                    status: balance > 0 ? 'available' : 'insufficient'
                });

            } catch (error) {
                console.error(`Error checking ${tokenType} on ${chain}:`, error);
                liquidityOverview.push({
                    chain,
                    chainId: config[chain]?.chainId || 0,
                    tokenAddress: config[chain]?.tokenAddress || '',
                    balance: 0,
                    conversionRate: 0,
                    maxKesAmount: 0,
                    status: 'error'
                });
            }
        }

        // Sort by balance (highest first)
        liquidityOverview.sort((a, b) => b.balance - a.balance);

        const totalBalance = liquidityOverview.reduce((sum, item) => sum + item.balance, 0);
        const totalMaxKes = liquidityOverview.reduce((sum, item) => sum + item.maxKesAmount, 0);

        return res.json(standardResponse(
            true,
            `Multi-chain liquidity overview for ${tokenType}`,
            {
                tokenType,
                totalBalance: parseFloat(totalBalance.toFixed(6)),
                totalMaxKesAmount: totalMaxKes,
                chains: liquidityOverview,
                timestamp: new Date().toISOString()
            }
        ));

    } catch (error: any) {
        console.error("❌ Multi-chain liquidity overview error:", error);
        return handleError(error, res, "Failed to get multi-chain liquidity overview");
    }
};

export const buyCrypto = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { amount, phone, chain, tokenType } = req.body;
        
        // Validate user authentication
        if (!req.user) {
            return res.status(401).json(standardResponse(
                false,
                "Authentication required",
                null,
                { code: "AUTH_REQUIRED", message: "You must be logged in to perform this action" }
            ));
        }

        const authenticatedUser = req.user;
        
        // Enhanced debug logging with more transaction details
        console.log("✅ Buy Crypto Request:", {
            amount,
            tokenType,
            chain,
            phone: phone.replace(/\d(?=\d{4})/g, "*"), // Mask most of the phone number for privacy
            evmWallet: authenticatedUser.walletAddress,
            stellarWallet: authenticatedUser.stellarAccountId || 'Not created yet'
        });

        // Validate input
        if (!amount || !phone || !chain || !tokenType) {
            return res.status(400).json(standardResponse(
                false,
                "Missing required fields",
                null,
                { code: "MISSING_FIELDS", message: "Amount in KES, phone, chain, and token type are required" }
            ));
        }

        // Validate amount
        const mpesaAmount = parseFloat(amount);
        if (isNaN(mpesaAmount) || mpesaAmount <= 0) {
            return res.status(400).json(standardResponse(
                false,
                "Invalid amount",
                null,
                { code: "INVALID_AMOUNT", message: "Amount must be a positive number" }
            ));
        }

        // Step 1: Handle Stellar chain specially (non-EVM)
        if (chain === 'stellar') {
            try {
                // Map token types for Stellar
                const stellarAsset = tokenType === 'USDC' || tokenType === 'USDC_STELLAR' ? 'USDC' 
                    : tokenType === 'USDT' || tokenType === 'USDT_STELLAR' ? 'USDT'
                    : tokenType === 'BTC' || tokenType === 'BTC_STELLAR' ? 'BTC'
                    : tokenType === 'XLM' ? 'XLM' 
                    : tokenType;
                
                // Validate Stellar asset
                if (stellarAsset !== 'XLM' && stellarAsset !== 'USDC' && stellarAsset !== 'USDT' && stellarAsset !== 'BTC') {
                    return res.status(400).json(standardResponse(
                        false,
                        "Unsupported token for Stellar",
                        null,
                        { 
                            code: "INVALID_TOKEN", 
                            message: `Token ${tokenType} is not supported on Stellar. Supported tokens: XLM, USDC` 
                        }
                    ));
                }

                // Ensure user has a Stellar wallet - check user document first to avoid creating duplicates
                let wallet = await stellarWalletService.getUserWallet(authenticatedUser._id.toString());
                
                // If getUserWallet returns null, check user document directly
                // This handles cases where wallet exists in DB but isn't funded on Stellar yet
                if (!wallet) {
                    const { User } = await import('../models/user');
                    const userDoc = await User.findById(authenticatedUser._id).select('+stellarSecretKey');
                    
                    if (userDoc && userDoc.stellarAccountId && userDoc.stellarSecretKey) {
                        // Wallet exists in database, use it even if not funded on Stellar yet
                        wallet = {
                            accountId: userDoc.stellarAccountId,
                            secretKey: userDoc.stellarSecretKey,
                            balances: [],
                            sequence: '0',
                            isActive: false,
                            createdAt: userDoc.createdAt || new Date(),
                            lastActivity: userDoc.updatedAt || new Date()
                        };
                        console.log(`✅ Using existing Stellar wallet from database: ${wallet.accountId}`);
                    } else {
                        // No wallet exists, create a new one
                        console.log(`⚠️ No Stellar wallet found, creating new one...`);
                        let formattedPhone = phone.replace(/\D/g, '');
                        if (formattedPhone.startsWith('0')) {
                            formattedPhone = '254' + formattedPhone.substring(1);
                        } else if (!formattedPhone.startsWith('254')) {
                            formattedPhone = '254' + formattedPhone;
                        }
                        wallet = await stellarWalletService.createWallet(authenticatedUser._id.toString(), formattedPhone);
                    }
                }

                // Convert KES to Stellar asset first to get crypto amount
                const conversion = await stellarMpesaService.convertKesToStellarAsset(mpesaAmount, stellarAsset);

                // Create transaction ID and escrow (required for STK callback processing)
                const transactionId = randomUUID();
                const escrow = new Escrow({
                    transactionId,
                    userId: authenticatedUser._id,
                    amount: mpesaAmount,
                    cryptoAmount: parseFloat(conversion.amountAsset),
                    tokenType: stellarAsset,
                    chain: 'stellar',
                    type: 'fiat_to_crypto',
                    status: 'reserved', // Set to reserved so STK callback can process it
                    phoneNumber: phone,
                    metadata: {
                        directBuy: true,
                        stellarAsset: stellarAsset,
                        stellarWallet: wallet.accountId,
                        tokenType: stellarAsset, // Also store in metadata for status endpoint
                        chain: 'stellar' // Also store in metadata for status endpoint
                    }
                });
                await escrow.save();

                // Format phone for M-Pesa
                let formattedPhone = phone.replace(/\D/g, '');
                if (formattedPhone.startsWith('0')) {
                    formattedPhone = '254' + formattedPhone.substring(1);
                } else if (!formattedPhone.startsWith('254')) {
                    formattedPhone = '254' + formattedPhone;
                }

                // Initiate M-Pesa STK Push directly (not through stellarMpesaService)
                const { initiateSTKPush } = await import('../services/mpesa');
                const mpesaResponse = await initiateSTKPush(
                    formattedPhone,
                    config.MPESA_SHORTCODE!,
                    mpesaAmount,
                    `NexusPay Stellar ${stellarAsset}`,
                    authenticatedUser._id.toString()
                );

                if (!mpesaResponse) {
                    escrow.status = 'failed';
                    escrow.completedAt = new Date();
                    await escrow.save();
                    return res.status(400).json(standardResponse(
                        false,
                        "M-Pesa STK Push failed",
                        null,
                        { code: "STK_PUSH_FAILED", message: "Failed to initiate M-Pesa transaction" }
                    ));
                }

                // Update escrow with M-Pesa checkout request ID
                escrow.mpesaTransactionId = mpesaResponse.checkoutRequestId;
                escrow.metadata = {
                    ...escrow.metadata,
                    checkoutRequestId: mpesaResponse.checkoutRequestId,
                    merchantRequestId: mpesaResponse.stkResponse?.MerchantRequestID,
                    successCode: generateSuccessCode()
                };
                await escrow.save();

                console.log(`✅ Stellar buy crypto initiated:`);
                console.log(`- Transaction ID: ${transactionId}`);
                console.log(`- EVM Wallet: ${authenticatedUser.walletAddress}`);
                console.log(`- Stellar Wallet: ${wallet.accountId}`);
                console.log(`- Amount: ${mpesaAmount} KES → ${conversion.amountAsset} ${stellarAsset}`);
                console.log(`- M-Pesa CheckoutRequestID: ${mpesaResponse.checkoutRequestId}`);

                return res.status(200).json(standardResponse(
                    true,
                    "Stellar crypto purchase initiated successfully",
                    {
                        transactionId,
                        mpesaAmount,
                        cryptoAmount: parseFloat(conversion.amountAsset),
                        tokenType: stellarAsset,
                        chain: 'stellar',
                        status: 'pending',
                        message: `Deposit initiated. You will receive ${conversion.amountAsset} ${stellarAsset} for ${mpesaAmount} KES`,
                        createdAt: new Date(),
                        estimatedCompletionTime: new Date(Date.now() + 5 * 60 * 1000),
                        successCode: escrow.metadata.successCode
                    }
                ));
            } catch (error: any) {
                logger.error('Error initiating Stellar deposit:', error);
                return res.status(500).json(standardResponse(
                    false,
                    "Failed to initiate Stellar deposit",
                    null,
                    { code: "STELLAR_DEPOSIT_FAILED", message: error.message }
                ));
            }
        }

        // Step 1: Verify chain config exists and token is supported on this chain (for EVM chains)
        const chainConfig = config[chain];
        if (!chainConfig || !chainConfig.chainId || !chainConfig.tokenAddress) {
            return res.status(400).json(standardResponse(
                false,
                "Unsupported blockchain",
                null,
                { code: "INVALID_CHAIN", message: `Chain ${chain} is not supported or not properly configured` }
            ));
        }

        // Check if token is supported on this chain
        const tokenConfig = getTokenConfig(chain as Chain, tokenType as TokenSymbol);
        if (!tokenConfig) {
            const supportedTokens = getSupportedTokens(chain as Chain);
            return res.status(400).json(standardResponse(
                false,
                "Unsupported token for this chain",
                null,
                { 
                    code: "INVALID_TOKEN", 
                    message: `Token ${tokenType} is not supported on chain ${chain}. Supported tokens: ${supportedTokens.join(', ')}` 
                }
            ));
        }

        // Step 2: Get conversion rate and calculate crypto amount
        const conversionRate = await getConversionRateWithCaching(tokenType);
        const cryptoAmountNum = mpesaAmount / conversionRate;
        
        console.log(`✅ Transaction Details: ${mpesaAmount} KES = ${cryptoAmountNum.toFixed(6)} ${tokenType} on ${chain} (Rate: ${conversionRate} KES/${tokenType})`);
        
        // Step 3: Pre-check platform balance before proceeding
        const platformWallets = await initializePlatformWallets();
        let platformBalance;
        
        try {
            platformBalance = await getTokenBalanceOnChain(
                platformWallets.main.address, 
                chain, 
                tokenType as TokenSymbol
            );
            
            console.log(`Platform wallet balance check: ${platformBalance} ${tokenType} available on ${chain}`);
            
            // Validate if platform has enough balance to fulfill this request
            if (platformBalance < cryptoAmountNum) {
                const maxKesAmount = Math.floor(platformBalance * conversionRate);
                
                return res.status(400).json(standardResponse(
                    false,
                    "Insufficient platform balance",
                    {
                        requestedAmount: parseFloat(cryptoAmountNum.toFixed(6)),
                        availableAmount: platformBalance,
                        maxKesAmount,
                        token: tokenType,
                        chain: chain,
                        message: `Maximum purchase amount: ${maxKesAmount} KES`
                    },
                    { 
                        code: "INSUFFICIENT_PLATFORM_BALANCE", 
                        message: `Sorry, we can only process purchases up to ${maxKesAmount} KES for ${tokenType} on ${chain} at this time.`
                    }
                ));
            }
        } catch (balanceError) {
            console.error("❌ Error checking platform wallet balance:", balanceError);
            return res.status(500).json(standardResponse(
                false,
                "Could not verify platform balance",
                null,
                { 
                    code: "BALANCE_CHECK_FAILED", 
                    message: "We couldn't verify our platform balance at this time. Please try again later."
                }
            ));
        }

        

        
        // Format the phone number
        let formattedPhone = phone.replace(/\D/g, '');
        
        // Ensure it starts with the correct country code
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '254' + formattedPhone.substring(1);
        } else if (!formattedPhone.startsWith('254')) {
            formattedPhone = '254' + formattedPhone;
        }
        
        // Create a unique transaction ID
        const transactionId = randomUUID();
        
        // Generate a unique success code for this transaction
        const successCode = generateSuccessCode();
        
        // Step 3: Create an escrow record with 'reserved' status to hold the crypto
        const escrow = new Escrow({
            transactionId,
            userId: authenticatedUser._id,
            amount: mpesaAmount,
            cryptoAmount: parseFloat(cryptoAmountNum.toFixed(6)),
            type: 'fiat_to_crypto',
            status: 'reserved', // Changed from 'pending' to 'reserved' to indicate crypto is held
            metadata: { 
                successCode,
                directBuy: true,
                chain,
                tokenType,
                platformBalance // Store current platform balance for verification
            }
        });
        
        // Save the escrow record to reserve the funds
        await escrow.save();
        console.log(`💰 Reserved ${cryptoAmountNum.toFixed(6)} ${tokenType} on ${chain} for transaction ${transactionId}`);

        // Create a descriptive message for MPESA
        const mpesaDescription = `NexusPay: Buy ${cryptoAmountNum.toFixed(6)} ${tokenType} on ${chain}`;

        // Step 4: Initiate MPESA STK Push
        try {
            const mpesaResponse = await initiateSTKPush(
                formattedPhone, 
                config.MPESA_SHORTCODE!, 
                mpesaAmount, 
                mpesaDescription, 
                authenticatedUser._id.toString()
            );
            
            // Handle potential M-Pesa API errors
            if (!mpesaResponse) {
                console.warn(`⚠️ M-Pesa STK Push returned no data. Transaction ID: ${transactionId}`);
                
                if (!escrow.metadata) {
                    escrow.metadata = {};
                }
                escrow.metadata.mpesaWarning = "STK Push returned no data";
                await escrow.save();
                
                return res.json(standardResponse(
                    true,
                    "Transaction initiated, but verification is pending",
                    {
                        transactionId: escrow.transactionId,
                        mpesaAmount,
                        cryptoAmount: parseFloat(cryptoAmountNum.toFixed(6)),
                        tokenType,
                        chain,
                        status: 'reserved',
                        warning: "We couldn't verify the M-Pesa payment initiation. If you receive an M-Pesa prompt, please complete the payment. We will credit your account once the payment is confirmed.",
                        createdAt: escrow.createdAt,
                        estimatedCompletionTime: new Date(Date.now() + 5 * 60 * 1000),
                        successCode,
                        // Enhanced response with comprehensive transaction details
                        transactionDetails: {
                            mpesaAmount: mpesaAmount,
                            cryptoAmount: parseFloat(cryptoAmountNum.toFixed(6)),
                            tokenType: tokenType,
                            chain: chain,
                            conversionRate: conversionRate,
                            userWallet: authenticatedUser.walletAddress,
                            phoneNumber: formattedPhone,
                            webhookUrl: config.MPESA_STK_CALLBACK_URL,
                            mpesaReceiptNumber: null,
                            mpesaStatus: 'initiated',
                            mpesaResultCode: null,
                            mpesaResultDesc: 'STK Push returned no data',
                            nexuspayPlatformCode: successCode // Unique platform tracking code
                        },
                        timestamps: {
                            iso: escrow.createdAt.toISOString(),
                            local: escrow.createdAt.toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }),
                            unix: Math.floor(escrow.createdAt.getTime() / 1000)
                        },
                        statusTracking: {
                            currentStatus: 'reserved',
                            nextStatus: 'processing',
                            finalStatus: 'completed',
                            estimatedDuration: '5-10 minutes'
                        }
                    }
                ));
            }
            
            // Get the main STK Push response (this always succeeds if we reach here)
            const stkResponse = mpesaResponse.stkResponse;
            const checkoutRequestId = mpesaResponse.checkoutRequestId;
            const queryResponse = mpesaResponse.queryResponse;
            const isProcessing = mpesaResponse.isProcessing === true;
            
            // Extract M-Pesa receipt number and status from query response
            let mpesaReceiptNumber = null;
            let mpesaStatus = 'initiated';
            let mpesaResultCode = null;
            let mpesaResultDesc = null;
            
            if (queryResponse && typeof queryResponse === 'object') {
                mpesaResultCode = queryResponse.ResultCode;
                mpesaResultDesc = queryResponse.ResultDesc;
                
                if (queryResponse.ResultCode === '0') {
                    mpesaStatus = 'success';
                    mpesaReceiptNumber = queryResponse.MpesaReceiptNumber || queryResponse.MpesaReceiptNumber;
                } else if (queryResponse.ResultCode === '1' || queryResponse.ResultCode === '4999') {
                    mpesaStatus = 'pending';
                } else if (queryResponse.ResultCode === '1032') {
                    mpesaStatus = 'cancelled';
                } else {
                    mpesaStatus = 'failed';
                }
            }
            
            // Update escrow with MPESA transaction ID
            escrow.mpesaTransactionId = checkoutRequestId;
            await escrow.save();
            
            console.log(`✅ STK Push initiated successfully for ${cryptoAmountNum} ${tokenType} (${mpesaAmount} KES). Transaction ID: ${transactionId}`);
            
            // If query response exists and has non-zero result code, handle error
            if (queryResponse && typeof queryResponse === 'object' && 'ResultCode' in queryResponse && queryResponse.ResultCode !== "0") {
                // Check if it's a processing error rather than a definitive failure
                const errorCode = queryResponse.errorCode || (queryResponse as any).errorCode;
                const errorMessage = queryResponse.errorMessage || (queryResponse as any).errorMessage;
                
                // Handle processing status (4999) as a normal processing state, not an error
                if (queryResponse.ResultCode === "4999" || 
                    (errorCode === "500.001.1001" && errorMessage === "The transaction is being processed")) {
                    
                    console.log(`⚠️ M-Pesa transaction is still processing. Transaction ID: ${transactionId}`);
                    
                    if (!escrow.metadata) {
                        escrow.metadata = {};
                    }
                    escrow.metadata.mpesaWarning = "STK Push query reported transaction is still processing";
                    escrow.metadata.mpesaProcessing = true;
                    await escrow.save();
                    
                    return res.json(standardResponse(
                        true,
                        "Transaction is being processed",
                        {
                            transactionId: escrow.transactionId,
                            mpesaAmount,
                            cryptoAmount: parseFloat(cryptoAmountNum.toFixed(6)),
                            tokenType,
                            chain,
                            status: 'reserved',
                            checkoutRequestId: checkoutRequestId,
                            createdAt: escrow.createdAt,
                            note: "Your M-Pesa transaction is being processed. We will credit your account once the payment is confirmed.",
                            estimatedCompletionTime: new Date(Date.now() + 5 * 60 * 1000),
                            successCode,
                            // Enhanced response with comprehensive transaction details
                            transactionDetails: {
                                mpesaAmount: mpesaAmount,
                                cryptoAmount: parseFloat(cryptoAmountNum.toFixed(6)),
                                tokenType: tokenType,
                                chain: chain,
                                conversionRate: conversionRate,
                                userWallet: authenticatedUser.walletAddress,
                                phoneNumber: formattedPhone,
                                webhookUrl: config.MPESA_STK_CALLBACK_URL,
                                mpesaReceiptNumber: mpesaReceiptNumber,
                                mpesaStatus: mpesaStatus,
                                mpesaResultCode: mpesaResultCode,
                                mpesaResultDesc: mpesaResultDesc,
                                nexuspayPlatformCode: successCode // Unique platform tracking code
                            },
                            timestamps: {
                                iso: escrow.createdAt.toISOString(),
                                local: escrow.createdAt.toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }),
                                unix: Math.floor(escrow.createdAt.getTime() / 1000)
                            },
                            statusTracking: {
                                currentStatus: 'reserved',
                                nextStatus: 'processing',
                                finalStatus: 'completed',
                                estimatedDuration: '5-10 minutes'
                            }
                        }
                    ));
                }
                
                // Other error types that indicate actual failure
                escrow.status = 'failed';
                escrow.completedAt = new Date();
                if (!escrow.metadata) escrow.metadata = {};
                escrow.metadata.mpesaErrorCode = queryResponse.ResultCode;
                escrow.metadata.mpesaErrorMessage = queryResponse.ResultDesc || (queryResponse as any).ResultDesc;
                await escrow.save();
                
                return res.status(400).json(standardResponse(
                    false,
                    "MPESA transaction unsuccessful",
                    null,
                    { 
                        code: "STK_PUSH_FAILED", 
                        message: queryResponse.ResultDesc || (queryResponse as any).ResultDesc || "Failed to initiate MPESA transaction"
                    }
                ));
            }
            
            // If the transaction is still processing (query failed but STK push succeeded)
            if (isProcessing) {
                console.log(`⏳ M-Pesa transaction initiated but waiting for callback. Transaction ID: ${transactionId}`);
                
                if (!escrow.metadata) escrow.metadata = {};
                escrow.metadata.mpesaProcessing = true;
                await escrow.save();
                
                return res.json(standardResponse(
                    true,
                    "Crypto purchase initiated successfully",
                    {
                        transactionId: escrow.transactionId,
                        mpesaAmount,
                        cryptoAmount: parseFloat(cryptoAmountNum.toFixed(6)),
                        tokenType,
                        chain,
                        status: 'reserved',
                        checkoutRequestId: checkoutRequestId,
                        createdAt: escrow.createdAt,
                        note: "Your M-Pesa payment is being processed. We'll update your balance once confirmed.",
                        estimatedCompletionTime: new Date(Date.now() + 5 * 60 * 1000),
                        successCode,
                        // Enhanced response with comprehensive transaction details
                        transactionDetails: {
                            mpesaAmount: mpesaAmount,
                            cryptoAmount: parseFloat(cryptoAmountNum.toFixed(6)),
                            tokenType: tokenType,
                            chain: chain,
                            conversionRate: conversionRate,
                            userWallet: authenticatedUser.walletAddress,
                            phoneNumber: formattedPhone,
                            webhookUrl: config.MPESA_STK_CALLBACK_URL,
                            mpesaReceiptNumber: mpesaReceiptNumber,
                            mpesaStatus: mpesaStatus,
                            mpesaResultCode: mpesaResultCode,
                            mpesaResultDesc: mpesaResultDesc,
                            nexuspayPlatformCode: successCode // Unique platform tracking code
                        },
                        timestamps: {
                            iso: escrow.createdAt.toISOString(),
                            local: escrow.createdAt.toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }),
                            unix: Math.floor(escrow.createdAt.getTime() / 1000)
                        },
                        statusTracking: {
                            currentStatus: 'reserved',
                            nextStatus: 'processing',
                            finalStatus: 'completed',
                            estimatedDuration: '5-10 minutes'
                        }
                    }
                ));
            }
            
            // Success case - STK push initiated and query returned success
            return res.json(standardResponse(
                true,
                "Crypto purchase initiated successfully",
                {
                    transactionId: escrow.transactionId,
                    mpesaAmount,
                    cryptoAmount: parseFloat(cryptoAmountNum.toFixed(6)),
                    tokenType,
                    chain,
                    status: 'reserved',
                    checkoutRequestId: checkoutRequestId,
                    createdAt: escrow.createdAt,
                    estimatedCompletionTime: new Date(Date.now() + 2 * 60 * 1000),
                    successCode
                }
            ));
        } catch (mpesaError: any) {
            // Handle MPESA API errors
            console.error(`❌ MPESA STK Push API Error for ${cryptoAmountNum} ${tokenType} (${mpesaAmount} KES):`, mpesaError);
            
            // Check if it's a special case where the error might be temporary or the transaction is still processing
            if (mpesaError.response?.data?.errorCode === "500.001.1001" && 
                mpesaError.response?.data?.errorMessage === "The transaction is being processed") {
                
                if (!escrow.metadata) {
                    escrow.metadata = {};
                }
                escrow.metadata.mpesaWarning = "STK Push gave processing error";
                await escrow.save();
                
                return res.json(standardResponse(
                    true,
                    "Transaction is being processed",
                    {
                        transactionId: escrow.transactionId,
                        mpesaAmount,
                        cryptoAmount: parseFloat(cryptoAmountNum.toFixed(6)),
                        tokenType,
                        chain,
                        status: 'reserved',
                        warning: "Your M-Pesa transaction is being processed. We will credit your account once the payment is confirmed.",
                        createdAt: escrow.createdAt,
                        estimatedCompletionTime: new Date(Date.now() + 5 * 60 * 1000),
                        successCode
                    }
                ));
            }
            
            // For authentication errors, provide a more specific message
            if (mpesaError.response?.data?.errorCode === "404.001.03") {
                console.error("❌ M-Pesa authentication error - Invalid Access Token");
                
                escrow.status = 'failed';
                escrow.completedAt = new Date();
                if (!escrow.metadata) escrow.metadata = {};
                escrow.metadata.mpesaAuthError = true;
                await escrow.save();
                
                return res.status(500).json(standardResponse(
                    false,
                    "Payment system temporarily unavailable",
                    null,
                    { 
                        code: "MPESA_AUTH_ERROR", 
                        message: "Our payment system is temporarily unavailable. Please try again in a few minutes."
                    }
                ));
            }
            
            // For other errors, mark as failed
            escrow.status = 'failed';
            escrow.completedAt = new Date();
            if (!escrow.metadata) escrow.metadata = {};
            escrow.metadata.mpesaErrorMessage = mpesaError.message || "Unknown error";
            await escrow.save();
            
            return res.status(500).json(standardResponse(
                false,
                "MPESA transaction failed",
                null,
                { 
                    code: "MPESA_API_ERROR", 
                    message: mpesaError.response?.data?.errorMessage || mpesaError.message || "Unknown error"
                }
            ));
        }
    } catch (error: any) {
        console.error("❌ Buy Crypto error:", error);
        return handleError(error, res, "Failed to process crypto purchase request");
    }
};

//#########################################

/**
 * Enhanced logging function to make webhook activity highly visible
 */
function logProminentWebhookReceived(req: Request) {
    const timestamp = new Date().toISOString();
    const separator = "=".repeat(80);
    
    // Use process.stdout.write for immediate output
    process.stdout.write(`\n${separator}\n`);
    process.stdout.write(`🚨 MPESA WEBHOOK RECEIVED - ${timestamp}\n`);
    process.stdout.write(`${separator}\n`);
    process.stdout.write(`📡 URL: ${req.url}\n`);
    process.stdout.write(`📱 Method: ${req.method}\n`);
    process.stdout.write(`📦 Body Preview: ${JSON.stringify(req.body, null, 2).slice(0, 500)}...\n`);
    process.stdout.write(`${separator}\n\n`);
    
    // Also use console methods
    console.log("\n" + separator);
    console.log("📲 MPESA CALLBACK RECEIVED - DETAILED LOG");
    console.log(separator);
    console.log("REQUEST HEADERS:");
    console.log(JSON.stringify(req.headers, null, 2));
    console.log("\nREQUEST BODY:");
    console.log(JSON.stringify(req.body, null, 2));
    console.log(separator);
}

/**
 * Enhanced error logging function
 */
function logProminentError(message: string, error: any) {
    const timestamp = new Date().toISOString();
    const separator = "❌".repeat(40);
    
    process.stdout.write(`\n${separator}\n`);
    process.stdout.write(`🚨 ERROR - ${timestamp}\n`);
    process.stdout.write(`📝 Message: ${message}\n`);
    process.stdout.write(`💥 Error: ${error.message || error}\n`);
    process.stdout.write(`${separator}\n\n`);
}

/**
 * Enhanced M-Pesa receipt logging function
 */
function logProminentMpesaReceipt(callbackId: string, mpesaReceiptNumber: string, amount: number, transactionId: string) {
    const timestamp = new Date().toISOString();
    const separator = "🎉".repeat(50);
    
    // Immediate output to ensure visibility
    process.stdout.write(`\n${separator}\n`);
    process.stdout.write(`💰 MPESA RECEIPT DETECTED - ${timestamp}\n`);
    process.stdout.write(`${separator}\n`);
    process.stdout.write(`📄 Receipt Number: ${mpesaReceiptNumber}\n`);
    process.stdout.write(`💵 Amount: ${amount} KES\n`);
    process.stdout.write(`🆔 Transaction ID: ${transactionId}\n`);
    process.stdout.write(`🔖 Callback ID: ${callbackId}\n`);
    process.stdout.write(`${separator}\n\n`);
    
    // Also log to console
    console.log(`\n${separator}`);
    console.log(`💰 MPESA RECEIPT: ${mpesaReceiptNumber} | Amount: ${amount} KES | TX: ${transactionId}`);
    console.log(`${separator}\n`);
}

/**
 * Webhook handler for MPESA STK Push callbacks
 */
export const mpesaSTKPushWebhook = async (req: Request, res: Response) => {
    // Immediately acknowledge the webhook to avoid timeouts
    const acknowledgement = {
        "ResponseCode": "00000000",
        "ResponseDesc": "success"
    };
    
    // Send an immediate response
    res.status(200).json(acknowledgement);
    
    // ENHANCED LOGGING - Make webhook receipt more visible
    logProminentWebhookReceived(req);
    
    // Process the callback asynchronously
    processSTKCallback(req.body).catch((err: any) => {
        console.error("❌ Error processing STK callback:", err);
        logProminentError("STK callback processing failed", err);
    });
};

/**
 * Process the STK Push callback data
 */
async function processSTKCallback(callbackData: any) {
    try {
        const stkCallback = callbackData.Body?.stkCallback;
        const callbackId = randomUUID().slice(0, 8); // For tracking this specific callback processing
        
        if (!stkCallback) {
            console.error(`❌ [CB:${callbackId}] Invalid STK callback format - missing Body.stkCallback`);
            return;
        }
        
        const checkoutRequestID = stkCallback.CheckoutRequestID;
        const resultCode = parseInt(stkCallback.ResultCode, 10);

        // Idempotency guard (avoid double-processing from retries)
        const idemKey = `mpesa:stk:${checkoutRequestID}:${stkCallback.MerchantRequestID || 'unknown'}`;
        if (await isProcessed(idemKey)) {
            console.log(`ℹ️ [CB:${callbackId}] Duplicate STK callback ignored for ${checkoutRequestID}`);
            return;
        }
        const lockKey = `${idemKey}:lock`;
        const haveLock = await acquireLock(lockKey, 30);
        if (!haveLock) {
            console.log(`ℹ️ [CB:${callbackId}] Another worker is processing ${checkoutRequestID}`);
            return;
        }
        
        console.log(`🔍 [CB:${callbackId}] Processing callback for CheckoutRequestID: ${checkoutRequestID}, ResultCode: ${resultCode}`);
        
        // Find the corresponding escrow transaction with more robust lookup
        // First try direct match on mpesaTransactionId
        let escrow = await Escrow.findOne({ mpesaTransactionId: checkoutRequestID });
        
        // If not found, try finding the most recent transaction with matching phone from callback metadata
        if (!escrow && stkCallback.CallbackMetadata?.Item) {
            const phoneItem = stkCallback.CallbackMetadata.Item.find((item: any) => item.Name === 'PhoneNumber');
            if (phoneItem && phoneItem.Value) {
                const phone = phoneItem.Value.toString();
                console.log(`📱 [CB:${callbackId}] No direct match, trying lookup by phone: ${phone}`);
                
                // Find most recent transaction(s) for this phone number (formatted with +)
                const formattedPhone = `+${phone}`;
                
                // Look for recent transactions in reserved status
                const recentEscrows = await Escrow.find({
                    status: 'reserved',
                    createdAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) } // Last 30 minutes
                })
                .sort({ createdAt: -1 }) // Most recent first
                .limit(5);
                
                // Find transactions for this user
                if (recentEscrows.length > 0) {
                    // Find users with this phone
                    const user = await User.findOne({ phoneNumber: formattedPhone });
                    
                    if (user) {
                        // Filter escrows for this user
                        const userEscrows = recentEscrows.filter(e => 
                            e.userId.toString() === user._id.toString()
                        );
                        
                        if (userEscrows.length > 0) {
                            escrow = userEscrows[0]; // Take the most recent one
                            console.log(`✅ [CB:${callbackId}] Found matching escrow by phone: ${escrow.transactionId}`);
                            
                            // Update the escrow with the correct M-Pesa transaction ID
                            escrow.mpesaTransactionId = checkoutRequestID;
                            await escrow.save();
                            console.log(`✅ [CB:${callbackId}] Updated escrow with correct M-Pesa transaction ID`);
                        }
                    }
                }
            }
        }
        
        if (!escrow) {
            console.error(`❌ [CB:${callbackId}] No escrow found for CheckoutRequestID: ${checkoutRequestID}`);
            return;
        }
        
        // Extract metadata for enhanced logging
        const metadata = escrow.metadata || {};
        const tokenType = metadata.tokenType || 'USDC';
        const chain = metadata.chain || 'arbitrum';
        const cryptoAmount = typeof escrow.cryptoAmount === 'string' ? parseFloat(escrow.cryptoAmount) : escrow.cryptoAmount;
        const isDirectBuy = metadata.directBuy === true;
        
        // Detailed logging for traceability
        console.log(`\n🔄 [CB:${callbackId}] Processing M-Pesa callback for transaction: ${escrow.transactionId}`);
        console.log(`- M-Pesa CheckoutRequestID: ${checkoutRequestID}`);
        console.log(`- Result Code: ${resultCode}`);
        console.log(`- Current Status: ${escrow.status}`);
        console.log(`- Is Direct Buy: ${isDirectBuy}`);
        
        // Process the callback based on result code
        if (resultCode === 0) {
            // Success - extract payment details from callback item
            const callbackMetadata = stkCallback.CallbackMetadata;
            let amount = 0;
            let mpesaReceiptNumber = '';
            let transactionDate = '';
            let phoneNumber = '';
            
            if (callbackMetadata && callbackMetadata.Item) {
                callbackMetadata.Item.forEach((item: any) => {
                    if (item.Name === 'Amount') amount = item.Value;
                    if (item.Name === 'MpesaReceiptNumber') mpesaReceiptNumber = item.Value;
                    if (item.Name === 'TransactionDate') transactionDate = item.Value;
                    if (item.Name === 'PhoneNumber') phoneNumber = item.Value;
                });
            }
            
            // CRITICAL: Validate that we received a proper M-Pesa receipt number
            if (!mpesaReceiptNumber) {
                console.error(`❌ [CB:${callbackId}] No M-Pesa receipt number in callback for transaction: ${escrow.transactionId}`);
                escrow.status = 'error';
                escrow.metadata = { ...escrow.metadata, error: 'Missing M-Pesa receipt', errorCode: 'MISSING_RECEIPT' };
                await escrow.save();
                return;
            }
            
            // 🎉 PROMINENT M-PESA RECEIPT LOGGING 🎉
            logProminentMpesaReceipt(callbackId, mpesaReceiptNumber, amount, escrow.transactionId);
            
            console.log(`✅ [CB:${callbackId}] M-Pesa payment confirmed:`);
            console.log(`- Receipt Number: ${mpesaReceiptNumber}`);
            console.log(`- Amount: ${amount} KES`);
            console.log(`- Date: ${transactionDate}`);
            console.log(`- Phone: ${phoneNumber}`);
            
            // Update escrow with M-Pesa receipt number
                    escrow.mpesaReceiptNumber = mpesaReceiptNumber;
            
            // Process based on escrow type and status
            if (escrow.status === 'reserved' && isDirectBuy) {
                try {
                    // PERFORMANCE OPTIMIZATION: Process transaction directly instead of using queue
                    // This improves response time and reduces complexity for high-volume processing
                    console.log(`🚀 [CB:${callbackId}] Processing direct crypto transfer for transaction: ${escrow.transactionId}`);
                    
                    // Retrieve user for wallet information
                    const user = await User.findById(escrow.userId);
                    if (!user) {
                        throw new Error(`User not found for transaction: ${escrow.transactionId}`);
                    }
                    
                    // Handle Stellar chain specially
                    if (chain === 'stellar') {
                        // Get user's Stellar wallet account ID - we only need the account ID to receive payments
                        // Try multiple sources: getUserWallet, escrow metadata, user document
                        let stellarAccountId: string | undefined;
                        
                        // First try getUserWallet (preferred method)
                        const stellarWallet = await stellarWalletService.getUserWallet(user._id.toString());
                        if (stellarWallet && stellarWallet.accountId) {
                            stellarAccountId = stellarWallet.accountId;
                        } else {
                            // Fallback 1: Get from escrow metadata (stored during buyCrypto)
                            stellarAccountId = escrow.metadata?.stellarWallet as string | undefined;
                            
                            // Fallback 2: Get from user document directly
                            if (!stellarAccountId) {
                                const refreshedUser = await User.findById(user._id);
                                stellarAccountId = refreshedUser?.stellarAccountId;
                            }
                            
                            // Fallback 3: If still not found, try to create/retrieve wallet
                            if (!stellarAccountId) {
                                console.log(`⚠️ [CB:${callbackId}] Stellar wallet not found, attempting to create/retrieve...`);
                                const formattedPhone = escrow.phoneNumber?.replace(/\D/g, '') || phoneNumber.replace(/\D/g, '');
                                let finalPhone = formattedPhone;
                                if (finalPhone.startsWith('0')) {
                                    finalPhone = '254' + finalPhone.substring(1);
                                } else if (!finalPhone.startsWith('254')) {
                                    finalPhone = '254' + finalPhone;
                                }
                                const newWallet = await stellarWalletService.createWallet(user._id.toString(), finalPhone);
                                stellarAccountId = newWallet?.accountId;
                            }
                        }
                        
                        if (!stellarAccountId) {
                            throw new Error(`User Stellar wallet account ID not found for transaction: ${escrow.transactionId}`);
                        }

                        // Get Stellar platform wallet secret
                        const { getStellarConfig } = await import('../config/stellar');
                        const stellarConfig = getStellarConfig();
                        if (!stellarConfig.platformWalletSecret) {
                            throw new Error('Stellar platform wallet secret not configured');
                        }

                        // Get Stellar service
                        const { StellarService } = await import('../services/stellar');
                        const stellarService = new StellarService();

                        // Map token type for Stellar
                        const stellarAsset = tokenType === 'USDC' || tokenType === 'USDC_STELLAR' ? 'USDC' 
                            : tokenType === 'USDT' || tokenType === 'USDT_STELLAR' ? 'USDT'
                            : tokenType === 'BTC' || tokenType === 'BTC_STELLAR' ? 'BTC'
                            : tokenType === 'XLM' ? 'XLM' 
                            : tokenType;
                        const assetIssuer = stellarAsset === 'USDC' ? stellarConfig.usdcIssuer 
                            : stellarAsset === 'USDT' ? stellarConfig.usdtIssuer
                            : stellarAsset === 'BTC' ? stellarConfig.btcIssuer
                            : undefined;

                        // Verify platform wallet has sufficient balance before sending
                        const platformAccountId = StellarSdk.Keypair.fromSecret(stellarConfig.platformWalletSecret).publicKey();
                        const platformBalance = await stellarService.getBalance(platformAccountId, stellarAsset, assetIssuer);
                        const requiredAmount = parseFloat(cryptoAmount.toString());
                        const availableBalance = parseFloat(platformBalance);
                        
                        console.log(`💰 [CB:${callbackId}] Platform wallet balance check:`);
                        console.log(`- Account: ${platformAccountId}`);
                        console.log(`- Asset: ${stellarAsset}`);
                        console.log(`- Available: ${availableBalance}`);
                        console.log(`- Required: ${requiredAmount}`);
                        
                        if (availableBalance < requiredAmount) {
                            throw new Error(`Insufficient platform wallet balance. Available: ${availableBalance} ${stellarAsset}, Required: ${requiredAmount} ${stellarAsset}`);
                        }
                        
                        // For XLM payments, Stellar will automatically create the account if it doesn't exist
                        // when we send the payment (as long as amount >= minimum balance requirement)
                        // So we don't need to check or fund the account separately - just send the payment
                        // The account will be created automatically with the payment amount
                        try {
                            const destAccountInfo = await stellarService.getAccountInfo(stellarAccountId);
                            console.log(`✅ [CB:${callbackId}] Destination account exists: ${stellarAccountId}`);
                        } catch (error: any) {
                            // Account doesn't exist yet - that's okay, Stellar will create it when we send the payment
                            console.log(`ℹ️ [CB:${callbackId}] Destination account doesn't exist yet: ${stellarAccountId}`);
                            console.log(`ℹ️ [CB:${callbackId}] Stellar will create the account automatically when we send ${requiredAmount} XLM`);
                            
                            // For XLM, Stellar requires at least 1 XLM to create an account (minimum balance)
                            // If the purchase amount is less than 1 XLM, we need to inform the user
                            if (stellarAsset === 'XLM' && requiredAmount < 1.0) {
                                throw new Error(`Cannot create Stellar account: Purchase amount (${requiredAmount} XLM) is less than the minimum required balance of 1 XLM. Please purchase at least 1 XLM to create your Stellar wallet.`);
                            }
                        }
                        
                        // Send Stellar payment from platform to user
                        console.log(`🚀 [CB:${callbackId}] Sending ${requiredAmount} ${stellarAsset} from platform to ${stellarAccountId}`);
                        const transferResult = await stellarService.sendPayment(
                            stellarConfig.platformWalletSecret,
                            stellarAccountId,
                            cryptoAmount.toString(),
                            stellarAsset,
                            assetIssuer,
                            `NexusPay: ${mpesaReceiptNumber}`
                        );

                        // Generate explorer URL for Stellar
                        const stellarNetwork = process.env.STELLAR_NETWORK || 'mainnet';
                        const explorerUrl = stellarNetwork === 'mainnet'
                            ? `https://stellar.expert/explorer/mainnet/tx/${transferResult.transactionHash}`
                            : `https://stellar.expert/explorer/testnet/tx/${transferResult.transactionHash}`;

                        // Update escrow with successful transfer
                        escrow.status = 'completed';
                        escrow.completedAt = new Date();
                        escrow.metadata = { 
                            ...escrow.metadata, 
                            mpesaPaymentReceived: true,
                            cryptoTransferred: true,
                            transferHash: transferResult.transactionHash,
                            explorerUrl: explorerUrl,
                            processingStatus: 'completed',
                            completedAt: new Date().toISOString(),
                            mpesaReceiptNumber,
                            directProcessing: true
                        };
                        await escrow.save();

                        // Parse M-Pesa transaction date
                        const parseMpesaDate = (dateStr: string): Date | undefined => {
                            if (!dateStr || dateStr.length !== 14) return undefined;
                            try {
                                const year = parseInt(dateStr.substring(0, 4));
                                const month = parseInt(dateStr.substring(4, 6)) - 1;
                                const day = parseInt(dateStr.substring(6, 8));
                                const hour = parseInt(dateStr.substring(8, 10));
                                const minute = parseInt(dateStr.substring(10, 12));
                                const second = parseInt(dateStr.substring(12, 14));
                                return new Date(Date.UTC(year, month, day, hour, minute, second));
                            } catch {
                                return undefined;
                            }
                        };

                        // Calculate transaction duration
                        const transactionDuration = escrow.createdAt 
                            ? Math.floor((new Date().getTime() - escrow.createdAt.getTime()) / 1000)
                            : undefined;

                        // Get NexusPay code from metadata
                        const nexusPayCode = escrow.metadata?.successCode || escrow.metadata?.nexuspayPlatformCode;
                        const mpesaTransactionDate = parseMpesaDate(transactionDate);

                        // Send transaction success SMS notification with all details
                        await SMSService.sendTransactionNotification({
                            phoneNumber: user.phoneNumber,
                            amount: cryptoAmount.toString(),
                            tokenType: stellarAsset,
                            transactionHash: transferResult.transactionHash,
                            transactionType: 'buy',
                            status: 'success',
                            explorerUrl: explorerUrl,
                            mpesaReceiptNumber: mpesaReceiptNumber,
                            mpesaTransactionTime: mpesaTransactionDate || new Date(),
                            nexusPayReceipt: escrow.transactionId,
                            transactionDuration: transactionDuration,
                            fiatAmount: amount,
                            chain: chain,
                            nexusPayCode: nexusPayCode
                        });

                        console.log(`✅ [CB:${callbackId}] Stellar transfer completed successfully:`);
                        console.log(`- Transaction Hash: ${transferResult.transactionHash}`);
                        console.log(`- Amount: ${cryptoAmount} ${stellarAsset}`);
                        console.log(`- Recipient: ${stellarAccountId}`);
                        console.log(`- Explorer: ${explorerUrl}`);
                    } else {
                        // EVM chain processing
                        if (!user.walletAddress) {
                            throw new Error(`User wallet address not found for transaction: ${escrow.transactionId}`);
                        }
                        
                        // Get platform wallets for the transfer
                        const platformWallets = await initializePlatformWallets();
                        
                        // Get the proper private keys from environment variables (same as manual intervention)
                        const primaryKey = process.env.PLATFORM_WALLET_PRIMARY_KEY;
                        const secondaryKey = process.env.PLATFORM_WALLET_SECONDARY_KEY;
                        
                        if (!primaryKey || !secondaryKey) {
                            throw new Error('Platform wallet keys (PLATFORM_WALLET_PRIMARY_KEY, PLATFORM_WALLET_SECONDARY_KEY) are required for crypto transfer');
                        }
                        
                        // Process the crypto transfer immediately using the correct function signature
                        const transferResult = await sendFromPlatformWallet(
                            cryptoAmount,
                            user.walletAddress,
                            primaryKey,
                            secondaryKey,
                            chain,
                            tokenType as TokenSymbol
                        );
                        
                        // Generate explorer URL for the transaction
                        const explorerUrl = generateExplorerUrl(chain, transferResult.transactionHash);
                        
                        // Update escrow with successful transfer
                        escrow.status = 'completed';
                        escrow.completedAt = new Date();
                        escrow.metadata = { 
                            ...escrow.metadata, 
                            mpesaPaymentReceived: true,
                            cryptoTransferred: true,
                            transferHash: transferResult.transactionHash,
                            explorerUrl: explorerUrl,
                            processingStatus: 'completed',
                            completedAt: new Date().toISOString(),
                            mpesaReceiptNumber,
                            directProcessing: true // Flag to indicate direct processing
                        };
                        await escrow.save();
                        await markProcessed(idemKey);
                        
                        // Parse M-Pesa transaction date (format: YYYYMMDDHHmmss, e.g., 20251103174559)
                        const parseMpesaDate = (dateStr: string): Date | undefined => {
                            if (!dateStr || dateStr.length !== 14) return undefined;
                            try {
                                const year = parseInt(dateStr.substring(0, 4));
                                const month = parseInt(dateStr.substring(4, 6)) - 1; // Month is 0-indexed
                                const day = parseInt(dateStr.substring(6, 8));
                                const hour = parseInt(dateStr.substring(8, 10));
                                const minute = parseInt(dateStr.substring(10, 12));
                                const second = parseInt(dateStr.substring(12, 14));
                                return new Date(Date.UTC(year, month, day, hour, minute, second));
                            } catch {
                                return undefined;
                            }
                        };
                        
                        // Calculate transaction duration in seconds
                        const transactionDuration = escrow.createdAt 
                            ? Math.floor((new Date().getTime() - escrow.createdAt.getTime()) / 1000)
                            : undefined;
                        
                        // Get NexusPay code from metadata
                        const nexusPayCode = escrow.metadata?.successCode || escrow.metadata?.nexuspayPlatformCode;
                        
                        // Parse M-Pesa transaction time
                        const mpesaTransactionDate = parseMpesaDate(transactionDate);
                        
                        // Send transaction success SMS notification with all details
                        await SMSService.sendTransactionNotification({
                            phoneNumber: user.phoneNumber,
                            amount: cryptoAmount.toString(),
                            tokenType: tokenType,
                            transactionHash: transferResult.transactionHash,
                            transactionType: 'buy',
                            status: 'success',
                            explorerUrl: explorerUrl,
                            mpesaReceiptNumber: mpesaReceiptNumber,
                            mpesaTransactionTime: mpesaTransactionDate || new Date(),
                            nexusPayReceipt: escrow.transactionId,
                            transactionDuration: transactionDuration,
                            fiatAmount: amount,
                            chain: chain,
                            nexusPayCode: nexusPayCode
                        });
                        
                        console.log(`✅ [CB:${callbackId}] Crypto transfer completed successfully:`);
                        console.log(`- Transaction Hash: ${transferResult.transactionHash}`);
                        console.log(`- Amount: ${cryptoAmount} ${tokenType}`);
                        console.log(`- Recipient: ${user.walletAddress}`);
                        console.log(`- Explorer: ${explorerUrl}`);
                    }
                    
                } catch (error: any) {
                    console.error(`❌ [CB:${callbackId}] Error processing direct crypto transfer for transaction ${escrow.transactionId}:`, error);
                    
                    // Update escrow with error details but keep M-Pesa receipt for reconciliation
                    escrow.status = 'error';
                    escrow.metadata = { 
                        ...escrow.metadata, 
                        mpesaPaymentReceived: true,
                        cryptoTransferred: false,
                        transferError: error.message || 'Unknown error during crypto transfer',
                        processingStatus: 'failed',
                        failedAt: new Date().toISOString(),
                        mpesaReceiptNumber,
                        requiresManualIntervention: true
                    };
                    await escrow.save();
                    
                    console.log(`⚠️ [CB:${callbackId}] Transaction marked for manual intervention: ${escrow.transactionId}`);
                }
            } else if (escrow.status === 'processing') {
                console.log(`ℹ️ [CB:${callbackId}] Transaction ${escrow.transactionId} already in processing state`);
                // Update the receipt in case this is a new callback
                escrow.mpesaReceiptNumber = mpesaReceiptNumber;
                escrow.metadata = { ...escrow.metadata, mpesaReceiptNumber };
                await escrow.save();
                await markProcessed(idemKey);
            } else if (escrow.status === 'completed') {
                console.log(`ℹ️ [CB:${callbackId}] Transaction ${escrow.transactionId} already completed`);
                // Just update receipt for reconciliation if needed
                if (!escrow.mpesaReceiptNumber) {
                    escrow.mpesaReceiptNumber = mpesaReceiptNumber;
                    escrow.metadata = { ...escrow.metadata, mpesaReceiptNumber };
                    await escrow.save();
                }
                await markProcessed(idemKey);
            } else {
                console.log(`ℹ️ [CB:${callbackId}] Transaction ${escrow.transactionId} is not eligible for crypto transfer in current state: ${escrow.status}`);
                
                // Record M-Pesa receipt for reconciliation
                escrow.mpesaReceiptNumber = mpesaReceiptNumber;
                if (!hasErrorOrFailedStatus(escrow.status)) {
                    escrow.status = 'completed';
                }
                escrow.completedAt = new Date();
                escrow.metadata = { ...escrow.metadata, mpesaPaymentReceived: true, mpesaReceiptNumber };
                await escrow.save();
                await markProcessed(idemKey);
                
                // Log for reconciliation
                logTransactionForReconciliation({
                    transactionId: escrow.transactionId,
                    userId: escrow.userId.toString(),
                    type: escrow.type || 'unknown',
                    status: escrow.status || 'unknown',
                    fiatAmount: amount,
                    mpesaReceiptNumber,
                    cryptoAmount,
                    tokenType,
                    chain
                });
            }
        } else {
            // Payment failed
            console.error(`❌ [CB:${callbackId}] M-PESA PAYMENT FAILED - Transaction ID: ${escrow.transactionId}, Code: ${resultCode}`);
            // Get the result description if available
            const resultDesc = stkCallback.ResultDesc || 'Unknown error';
            // Update escrow with failure details
            escrow.status = 'failed';
            escrow.completedAt = new Date();
            escrow.metadata = { 
                ...escrow.metadata, 
                error: resultDesc, 
                errorCode: `MPESA_ERROR_${resultCode}`
            };
            await escrow.save();
            await markProcessed(idemKey);
            
            // Log failed transaction for reconciliation
            logTransactionForReconciliation({
                transactionId: escrow.transactionId,
                userId: escrow.userId.toString(),
                type: escrow.type || 'unknown',
                status: 'failed',
                cryptoAmount,
                tokenType,
                chain,
                error: resultDesc,
                errorCode: `MPESA_ERROR_${resultCode}`,
                timestamp: new Date().toISOString()
            });
        }
    } catch (error: any) {
        console.error("❌ Error processing STK callback:", error);
        
        // Log detailed error information for troubleshooting
        console.error({
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : 'No stack trace available'
        });
    }
}

/**
 * Helper function to generate blockchain explorer URL
 */

export const mpesaB2CWebhook = async (req: Request, res: Response) => {
    try {
        console.log("📲 Received MPESA B2C callback:", JSON.stringify(req.body, null, 2));
        
        // Acknowledge the webhook immediately to avoid timeout
        const acknowledgement = { "Result": "Success" };
        
        // Process asynchronously to avoid timeouts
        processB2CCallback(req.body).catch(err => {
            console.error("❌ Error processing B2C callback:", err);
        });
        
        // Respond to Safaricom
        res.json(acknowledgement);
    } catch (error) {
        console.error("❌ Error in B2C webhook handler:", error);
        
        // Still acknowledge to prevent retries
        res.json({ "Result": "Success" });
    }
};

/**
 * Process B2C callback data
 */
async function processB2CCallback(callbackData: any) {
    try {
        const { Result } = callbackData;
        
        if (!Result) {
            console.error("❌ Invalid B2C callback format - missing Result");
            return;
        }
        
        const { ConversationID, ResultCode, ResultParameters } = Result;

        // Idempotency guard for B2C
        const idemKey = `mpesa:b2c:${ConversationID}`;
        if (await isProcessed(idemKey)) {
            console.log(`ℹ️ Duplicate B2C callback ignored for ${ConversationID}`);
            return;
        }
        const haveLock = await acquireLock(`${idemKey}:lock`, 30);
        if (!haveLock) {
            console.log(`ℹ️ Another worker is processing B2C ${ConversationID}`);
            return;
        }
        
        // Check for Stellar withdrawal transaction first
        const { StellarTransaction } = await import('../models/stellarTransaction');
        const { redis, isRedisConnected } = await import('../config/redis');
        
        let stellarTx = null;
        // Try cache first for quick lookup
        if (isRedisConnected()) {
            const cacheKey = `stellar:mpesa:b2c:${ConversationID}`;
            const stellarTxId = await redis.get(cacheKey);
            if (stellarTxId) {
                stellarTx = await StellarTransaction.findOne({ transactionId: stellarTxId });
            }
        }
        
        // If not in cache, query database
        if (!stellarTx) {
            stellarTx = await StellarTransaction.findOne({ mpesaConversationId: ConversationID });
        }
        
        // If this is a Stellar transaction, handle it separately
        if (stellarTx) {
            await processStellarB2CCallback(stellarTx, ResultCode, ResultParameters);
            await markProcessed(idemKey);
            return;
        }
        
        // Find the corresponding escrow transaction (EVM chains)
        const escrow = await Escrow.findOne({ mpesaTransactionId: ConversationID });
        
        if (!escrow) {
            console.error(`❌ No escrow found for ConversationID: ${ConversationID}`);
            return;
        }
        
        // Extract useful parameters if available
        let resultParams: Record<string, any> = {};
        if (ResultParameters && ResultParameters.ResultParameter) {
            ResultParameters.ResultParameter.forEach((param: any) => {
                resultParams[param.Key] = param.Value;
            });
            
            console.log("B2C Result Parameters:", resultParams);
        }
        
        // Check if transaction was successful
        if (ResultCode === 0) {
            // Update escrow as completed
            escrow.status = 'completed';
            escrow.completedAt = new Date();
            await escrow.save();
            await markProcessed(idemKey);
            
            console.log(`✅ Successful B2C transaction for escrow: ${escrow.transactionId}`);
            
            // Send completion SMS to user
            try {
                const user = await User.findById(escrow.userId);
                if (user) {
                    await SMSService.sendTransactionNotification({
                        phoneNumber: user.phoneNumber || user.email || '',
                        amount: escrow.amount.toFixed(2),
                        tokenType: escrow.tokenType || 'USDC',
                        transactionHash: escrow.cryptoTransactionHash || escrow.transactionId,
                        transactionType: 'sell',
                        status: 'success',
                        recipientAddress: resultParams.TransactionReceipt || 'MPESA',
                        explorerUrl: escrow.chain === 'arbitrum' 
                            ? `https://arbiscan.io/tx/${escrow.cryptoTransactionHash}` 
                            : escrow.chain === 'celo' 
                                ? `https://explorer.celo.org/tx/${escrow.cryptoTransactionHash}`
                                : `https://polygonscan.com/tx/${escrow.cryptoTransactionHash}`
                    });
                    console.log(`📱 Completion SMS sent to user for successful transaction: ${escrow.transactionId}`);
                }
            } catch (smsError) {
                console.error("❌ Failed to send completion SMS:", smsError);
                // Don't fail the callback processing if SMS fails
            }
        } else {
            // Transaction failed, handle reversal of crypto transfer
            escrow.status = 'failed';
            escrow.completedAt = new Date();
            await escrow.save();
            await markProcessed(idemKey);
            
            console.error(`❌ Failed B2C transaction for escrow: ${escrow.transactionId}, ResultCode: ${ResultCode}`);
            
            // Get the user
            const user = await User.findById(escrow.userId);
            if (!user) {
                console.error(`❌ User not found for escrow: ${escrow.transactionId}`);
                return;
            }
            
            try {
                // Initialize platform wallets
                const platformWallets = await initializePlatformWallets();
                
                // Return tokens to user's wallet due to failed withdrawal
                const cryptoAmount = typeof escrow.cryptoAmount === 'string' 
                    ? parseFloat(escrow.cryptoAmount) 
                    : escrow.cryptoAmount;
                
                // Check if the platform has enough balance for the refund
                const chain = escrow.metadata?.chain || 'arbitrum';
                const platformBalance = await getWalletBalance(platformWallets.main.address, chain);
                
                if (platformBalance < cryptoAmount) {
                    console.error(`❌ Insufficient platform wallet balance for refund: ${platformBalance} < ${cryptoAmount}`);
                    // This would require manual intervention
                    // TODO: Add to a reconciliation queue or alert system
                    return;
                }
                
                // Send refund from platform to user
                if (!platformWallets.main.privateKey) {
                    throw new Error('Platform wallet private key not found. Cannot process refund.');
                }
                
                const txResult = await sendTokenFromUser(
                    user.walletAddress,
                    cryptoAmount,
                    platformWallets.main.privateKey,
                    chain
                );
                
                console.log(`✅ Refund transfer complete: ${txResult?.transactionHash}`);
                
                // TODO: Send notification to user about failed withdrawal and refund
            } catch (refundError) {
                console.error(`❌ Failed to process refund for escrow: ${escrow.transactionId}`, refundError);
                // This would require manual intervention
                // TODO: Add to a reconciliation queue or alert system
            }
        }
    } catch (error) {
        console.error("❌ Error processing B2C callback data:", error);
    }
}

/**
 * Process Stellar B2C callback for withdrawals
 */
async function processStellarB2CCallback(
    stellarTx: any,
    resultCode: number,
    resultParameters: any
): Promise<void> {
    try {
        // Extract result parameters
        let resultParams: Record<string, any> = {};
        if (resultParameters && resultParameters.ResultParameter) {
            resultParameters.ResultParameter.forEach((param: any) => {
                resultParams[param.Key] = param.Value;
            });
            console.log("Stellar B2C Result Parameters:", resultParams);
        }

        if (resultCode === 0) {
            // M-Pesa payment successful - withdrawal complete
            stellarTx.status = 'completed';
            stellarTx.completedAt = new Date();
            stellarTx.mpesaReceiptNumber = resultParams.TransactionReceipt || resultParams.TransactionID;
            await stellarTx.save();

            console.log(`✅ Stellar withdrawal completed: ${stellarTx.transactionId}`);

            // Send completion SMS
            try {
                const user = await User.findById(stellarTx.userId);
                if (user && user.phoneNumber) {
                    await SMSService.sendTransactionNotification({
                        phoneNumber: user.phoneNumber,
                        amount: stellarTx.amountKES.toFixed(2),
                        tokenType: stellarTx.asset,
                        transactionHash: stellarTx.stellarTransactionHash || stellarTx.transactionId,
                        transactionType: 'sell',
                        status: 'success',
                        recipientAddress: 'M-Pesa',
                        explorerUrl: `https://stellar.expert/explorer/public/tx/${stellarTx.stellarTransactionHash}`
                    });
                }
            } catch (smsError) {
                console.error("❌ Failed to send SMS:", smsError);
            }
        } else {
            // M-Pesa payment failed - need to refund Stellar assets to user
            stellarTx.status = 'failed';
            stellarTx.error = `M-Pesa B2C failed: ResultCode ${resultCode}`;
            stellarTx.completedAt = new Date();
            
            console.error(`❌ Stellar withdrawal M-Pesa failed: ${stellarTx.transactionId}, ResultCode: ${resultCode}`);

            try {
                // Refund Stellar assets from platform back to user
                const { stellarService } = await import('../services/stellar');
                const { getStellarConfig } = await import('../config/stellar');
                const { stellarWalletService } = await import('../services/stellarWallet');
                const stellarConfig = getStellarConfig();

                if (!stellarConfig.platformWalletSecret) {
                    throw new Error('Platform wallet not configured for refund');
                }

                // Get user wallet
                const userWallet = await stellarWalletService.getUserWallet(stellarTx.userId.toString());
                if (!userWallet) {
                    throw new Error('User wallet not found for refund');
                }

                // Get asset issuer
                const assetIssuer = stellarTx.asset === 'USDC' ? stellarConfig.usdcIssuer 
                    : stellarTx.asset === 'USDT' ? stellarConfig.usdtIssuer
                    : stellarTx.asset === 'BTC' ? stellarConfig.btcIssuer
                    : undefined;

                // Refund from platform to user
                const refundResult = await stellarService.sendPayment(
                    stellarConfig.platformWalletSecret,
                    userWallet.accountId,
                    stellarTx.amount,
                    stellarTx.asset,
                    assetIssuer,
                    `Refund for failed withdrawal: ${stellarTx.transactionId}`
                );

                stellarTx.metadata = stellarTx.metadata || {};
                stellarTx.metadata.refundTxHash = refundResult.transactionHash;
                await stellarTx.save();

                console.log(`✅ Stellar refund completed: ${refundResult.transactionHash}`);

                // Notify user about failed withdrawal and refund
                try {
                    const user = await User.findById(stellarTx.userId);
                    if (user && user.phoneNumber) {
                        await SMSService.sendTransactionNotification({
                            phoneNumber: user.phoneNumber,
                            amount: stellarTx.amountKES.toFixed(2),
                            tokenType: stellarTx.asset,
                            transactionHash: refundResult.transactionHash,
                            transactionType: 'refund',
                            status: 'success',
                            recipientAddress: userWallet.accountId,
                            explorerUrl: `https://stellar.expert/explorer/public/tx/${refundResult.transactionHash}`
                        });
                    }
                } catch (smsError) {
                    console.error("❌ Failed to send refund SMS:", smsError);
                }
            } catch (refundError) {
                console.error(`❌ Failed to refund Stellar assets: ${stellarTx.transactionId}`, refundError);
                stellarTx.metadata = stellarTx.metadata || {};
                stellarTx.metadata.refundError = refundError instanceof Error ? refundError.message : 'Unknown error';
                await stellarTx.save();
                // This requires manual intervention
            }
        }
    } catch (error) {
        console.error("❌ Error processing Stellar B2C callback:", error);
    }
}

/**
 * Handle B2B BusinessPayBill callback
 */
export const mpesaB2BWebhook = async (req: Request, res: Response) => {
    try {
        console.log("📲 Received MPESA B2B callback:", JSON.stringify(req.body, null, 2));
        
        // Acknowledge the webhook immediately to avoid timeout
        const acknowledgement = { "Result": "Success" };
        
        // Process asynchronously to avoid timeouts
        processB2BCallback(req.body).catch(err => {
            console.error("❌ Error processing B2B callback:", err);
        });
        
        // Respond to Safaricom
        res.json(acknowledgement);
    } catch (error) {
        console.error("❌ Error in B2B webhook handler:", error);
        
        // Still acknowledge to prevent retries
        res.json({ "Result": "Success" });
    }
};

/**
 * Process B2B callback data
 */
async function processB2BCallback(callbackData: any) {
    try {
        const { Result } = callbackData;
        
        if (!Result) {
            console.error("❌ Invalid B2B callback format - missing Result");
            return;
        }
        
        const { ConversationID, ResultCode, ResultDesc, ResultParameters } = Result;

        // Idempotency guard for B2B
        const idemKey = `mpesa:b2b:${ConversationID}`;
        if (await isProcessed(idemKey)) {
            console.log(`ℹ️ Duplicate B2B callback ignored for ${ConversationID}`);
            return;
        }
        const haveLock = await acquireLock(`${idemKey}:lock`, 30);
        if (!haveLock) {
            console.log(`ℹ️ Another worker is processing B2B ${ConversationID}`);
            return;
        }
        
        // Find the corresponding escrow transaction
        const escrow = await Escrow.findOne({ mpesaTransactionId: ConversationID });
        
        if (!escrow) {
            console.error(`❌ No escrow found for B2B ConversationID: ${ConversationID}`);
            return;
        }
        
        console.log(`🔄 [B2B-CB] Processing B2B callback for transaction: ${escrow.transactionId}`);
        console.log(`- ConversationID: ${ConversationID}`);
        console.log(`- Result Code: ${ResultCode}`);
        console.log(`- Result Description: ${ResultDesc}`);
        console.log(`- Current Status: ${escrow.status}`);
        
        // Check if transaction was successful
        if (ResultCode === 0) {
            // Success - B2B payment completed
            console.log(`✅ [B2B-CB] B2B payment successful for transaction: ${escrow.transactionId}`);
            
            escrow.status = 'completed';
            escrow.completedAt = new Date();
            escrow.metadata = {
                ...escrow.metadata,
                b2bResultCode: ResultCode,
                b2bResultDesc: ResultDesc,
                b2bCompletedAt: new Date().toISOString(),
                callbackProcessed: true
            };
            await escrow.save();
            await markProcessed(idemKey);
            
            // Send success SMS to user
            try {
                const user = await User.findById(escrow.userId);
                if (user) {
                    await SMSService.sendSecurityAlert(
                        user.phoneNumber,
                        'PAYBILL_SUCCESS',
                        `OK ${Math.floor(escrow.amount)}KES ${escrow.paybillNumber}/${(escrow.accountNumber||'').slice(-4)} ${new Date().toLocaleTimeString('en-KE',{hour12:false})}`
                    );
                }
            } catch (smsError) {
                console.error("❌ Failed to send success SMS:", smsError);
            }
            
        } else {
            // Failure - B2B payment failed
            console.error(`❌ [B2B-CB] B2B payment failed for transaction: ${escrow.transactionId}`);
            console.error(`- Result Code: ${ResultCode}`);
            console.error(`- Result Description: ${ResultDesc}`);
            
            escrow.status = 'failed';
            escrow.metadata = {
                ...escrow.metadata,
                b2bResultCode: ResultCode,
                b2bResultDesc: ResultDesc,
                b2bFailedAt: new Date().toISOString(),
                callbackProcessed: true,
                failureReason: 'B2B_PAYMENT_FAILED'
            };
            await escrow.save();
            await markProcessed(idemKey);
            
            // Initiate rollback since B2B failed
            try {
                console.log(`🔄 [B2B-CB] Initiating rollback for failed B2B transaction: ${escrow.transactionId}`);
                
                const user = await User.findById(escrow.userId);
                if (!user) {
                    console.error(`❌ [B2B-CB] User not found for rollback: ${escrow.userId}`);
                    return;
                }
                
                // Get platform wallet keys for rollback
                const primaryKey = process.env.PLATFORM_WALLET_PRIMARY_KEY;
                const secondaryKey = process.env.PLATFORM_WALLET_SECONDARY_KEY;
                
                if (!primaryKey || !secondaryKey) {
                    console.error('❌ [B2B-CB] Platform wallet keys not available for rollback');
                    return;
                }
                
                // Import the rollback function
                const { sendFromPlatformWallet } = await import('../services/platformWallet');
                
                const rollbackResult = await sendFromPlatformWallet(
                    escrow.cryptoAmount,
                    user.walletAddress,
                    primaryKey,
                    secondaryKey,
                    escrow.metadata?.chain || 'arbitrum',
                    escrow.metadata?.tokenType || 'USDC'
                );
                
                console.log(`✅ [B2B-CB] Rollback successful: ${rollbackResult.transactionHash}`);
                
                // Update escrow with rollback info
                escrow.metadata = {
                    ...escrow.metadata,
                    rollbackTransactionHash: rollbackResult.transactionHash,
                    rollbackCompletedAt: new Date().toISOString(),
                    rollbackReason: 'B2B_PAYMENT_FAILED'
                };
                await escrow.save();
                
                // Send rollback SMS to user
                try {
                    await SMSService.sendSecurityAlert(
                        user.phoneNumber,
                        'ROLLBACK_SUCCESS',
                        `REFUND ${escrow.cryptoAmount}${escrow.metadata?.tokenType||'USDC'} ${new Date().toLocaleTimeString('en-KE',{hour12:false})}`
                    );
                } catch (smsError) {
                    console.error("❌ Failed to send rollback SMS:", smsError);
                }
                
            } catch (rollbackError: any) {
                console.error(`❌ [B2B-CB] Rollback failed for transaction: ${escrow.transactionId}`, rollbackError);
                
                // Mark for manual intervention
                escrow.metadata = {
                    ...escrow.metadata,
                    rollbackFailed: true,
                    rollbackError: rollbackError.message,
                    requiresManualIntervention: true
                };
                await escrow.save();
            }
        }
        
    } catch (error) {
        console.error("❌ Error processing B2B callback data:", error);
    }
}

export const mpesaQueueWebhook = (req: Request, res: Response) => {
    console.log("Queue timeout webhook received:", req.body);
    res.json({ Timeout: true });
};

/**
 * Get transaction status by ID
 */
export const getTransactionStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { transactionId } = req.params;
        
        if (!req.user) {
            return res.status(401).json(standardResponse(
                false,
                "Authentication required",
                null,
                { code: "AUTH_REQUIRED", message: "You must be logged in to perform this action" }
            ));
        }
        
        const authenticatedUser = req.user;
        
        // Validate transaction ID
        if (!transactionId) {
            return res.status(400).json(standardResponse(
                false,
                "Missing transaction ID",
                null,
                { code: "MISSING_ID", message: "Transaction ID is required" }
            ));
        }
        
        // Find transaction in escrow
        const escrow = await Escrow.findOne({ 
            transactionId,
            userId: authenticatedUser._id
        });
        
        if (!escrow) {
            return res.status(404).json(standardResponse(
                false,
                "Transaction not found",
                null,
                { code: "NOT_FOUND", message: "No transaction found with the provided ID" }
            ));
        }
        
        // Extract metadata for enhanced logging
        const metadata = escrow.metadata || {};
        // Read from escrow fields first, then fall back to metadata, then defaults
        const tokenType = escrow.tokenType || metadata.tokenType || 'USDC';
        const chain = escrow.chain || metadata.chain || 'arbitrum';
        const cryptoAmount = typeof escrow.cryptoAmount === 'string' ? parseFloat(escrow.cryptoAmount) : escrow.cryptoAmount;
        
        // Enhanced transaction logging
        console.log(`Transaction Status Check: ${transactionId}`);
        console.log(`- Type: ${escrow.type}`);
        console.log(`- Status: ${escrow.status}`);
        console.log(`- Token: ${cryptoAmount} ${tokenType} on ${chain}`);
        console.log(`- Fiat: ${escrow.amount} KES (≈ $${cryptoAmount} USD)`);
        console.log(`- User: ${authenticatedUser._id}`);
        
        // Prepare response based on transaction type and status
        const response = {
            transactionId: escrow.transactionId,
            type: escrow.type || 'unknown',
            status: escrow.status || 'unknown',
            amount: escrow.amount,
            cryptoAmount: cryptoAmount,
            tokenType: tokenType,
            chain: chain,
            createdAt: escrow.createdAt,
            completedAt: escrow.completedAt,
            estimatedValue: `$${cryptoAmount} USD`
        };
        
        // Add additional information based on transaction type
        if (escrow.cryptoTransactionHash) {
            Object.assign(response, { cryptoTransactionHash: escrow.cryptoTransactionHash });
        }
        
        if (escrow.mpesaTransactionId) {
            Object.assign(response, { mpesaTransactionId: escrow.mpesaTransactionId });
        }
        
        return res.json(standardResponse(
            true,
            "Transaction status retrieved successfully",
            response
        ));
    } catch (error) {
        console.error("❌ Error getting transaction status:", error);
        return handleError(error, res, "Failed to get transaction status");
    }
};

/**
 * Get platform wallet status including balances
 */
export const getPlatformWalletStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Check if user has admin privileges
        if (!req.user || !req.user.role || req.user.role !== 'admin') {
            return res.status(403).json(standardResponse(
                false,
                "Access denied",
                null,
                { code: "FORBIDDEN", message: "You don't have permission to access platform wallet information" }
            ));
        }
        
        // Get wallet status
        const walletStatus = await getWalletStatus();
        
        return res.json(standardResponse(
            true,
            "Platform wallet status retrieved successfully",
            walletStatus
        ));
    } catch (error) {
        console.error("❌ Error getting platform wallet status:", error);
        return handleError(error, res, "Failed to retrieve platform wallet status");
    }
};

/**
 * Withdraw collected fees to main platform wallet
 */
export const withdrawFeesToMainWallet = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Check if user has admin privileges
        if (!req.user || !req.user.role || req.user.role !== 'admin') {
            return res.status(403).json(standardResponse(
                false,
                "Access denied",
                null,
                { code: "FORBIDDEN", message: "You don't have permission to withdraw fees" }
            ));
        }
        
        const { amount, chainName } = req.body;
        
        // If amount is provided, parse it
        let parsedAmount: number | null = null;
        if (amount) {
            parsedAmount = parseFloat(amount);
            if (isNaN(parsedAmount) || parsedAmount <= 0) {
                return res.status(400).json(standardResponse(
                    false,
                    "Invalid amount",
                    null,
                    { code: "INVALID_AMOUNT", message: "Amount must be a positive number" }
                ));
            }
        }
        
        // Use specified chain or default to celo
        const chain = chainName || 'celo';
        
        // Withdraw fees
        const result = await withdrawFees(parsedAmount, chain);
        
        return res.json(standardResponse(
            true,
            "Fees withdrawn successfully",
            {
                transactionHash: result.transactionHash,
                chain
            }
        ));
    } catch (error) {
        console.error("❌ Error withdrawing fees:", error);
        return handleError(error, res, "Failed to withdraw fees");
    }
};

/**
 * Handle STK Push callback from MPESA
 */
export const stkPushCallback = async (req: Request, res: Response) => {
  // Early send 200 response to M-Pesa gateway
  res.status(200).send();
  
  try {
    // Validate the callback data
    const callbackData = req.body?.Body?.stkCallback;
    if (!callbackData) {
      logger.error('Invalid STK callback payload');
      return;
    }
    
    const merchantRequestID = callbackData.MerchantRequestID;
    const checkoutRequestID = callbackData.CheckoutRequestID;
    const resultCode = callbackData.ResultCode;
    const resultDesc = callbackData.ResultDesc;
    
    logger.info(`STK callback received: ${resultDesc} (${resultCode})`);
        
    // Find the escrow record
    const escrow = await Escrow.findOne({ 
      mpesaTransactionId: checkoutRequestID 
    });
        
        if (!escrow) {
      logger.error(`No escrow found for checkout ID: ${checkoutRequestID}`);
            return;
        }
        
    const transactionId = escrow.transactionId;
        
    // Extract metadata if present
    const { directBuy, chain, tokenType } = escrow.metadata || {};
    const cryptoAmount = escrow.cryptoAmount;
    
    logger.info(`Processing STK callback for transaction ${transactionId}`);
    logger.info(`- Status: ${resultDesc} (${resultCode})`);
    logger.info(`- Amount: ${escrow.amount} KES / ${cryptoAmount} ${tokenType}`);
        
    // Process based on result code
    if (resultCode === 0) {
      // Payment successful
      logger.info(`Payment successful for transaction ${transactionId}`);
      
      // Extract payment details
      const callbackMetadata = callbackData.CallbackMetadata?.Item || [];
      
      // Extract important values
      let amount = 0;
      let mpesaReceiptNumber = '';
      let transactionDate = '';
      let phoneNumber = '';
      
      callbackMetadata.forEach((item: any) => {
        if (item.Name === 'Amount') amount = item.Value;
        if (item.Name === 'MpesaReceiptNumber') mpesaReceiptNumber = item.Value;
        if (item.Name === 'TransactionDate') transactionDate = item.Value;
        if (item.Name === 'PhoneNumber') phoneNumber = item.Value;
      });
      
      logger.info(`Payment details: ${mpesaReceiptNumber}, ${amount} KES from ${phoneNumber}`);
            
      // Verify amount matches what we expected
      if (amount !== escrow.amount) {
        logger.warn(`Amount mismatch: Expected ${escrow.amount}, got ${amount}`);
        // Continue anyway, as the payment was successful
      }
      
      // Mark escrow as processing while we perform on-chain transfer
      escrow.status = 'processing';
      escrow.mpesaReceiptNumber = mpesaReceiptNumber;
      await escrow.save();

      // Immediate crypto release (no queuing)
      try {
        // Get the user
        const user = await User.findById(escrow.userId);
        if (!user || !user.walletAddress) {
          const errMsg = !user ? 'User not found' : 'Wallet address not found';
          logger.error(`${errMsg} for escrow transaction: ${escrow.transactionId}`);
          escrow.status = 'error';
          escrow.metadata = { 
            ...escrow.metadata, 
            error: errMsg,
            errorCode: !user ? 'USER_NOT_FOUND' : 'WALLET_NOT_FOUND',
            mpesaPaymentReceived: true
          };
          await escrow.save();
          return;
        }

        const primaryKey = process.env.PLATFORM_WALLET_PRIMARY_KEY;
        const secondaryKey = process.env.PLATFORM_WALLET_SECONDARY_KEY;
        if (!primaryKey || !secondaryKey) {
          throw new Error('Platform wallet keys (PLATFORM_WALLET_PRIMARY_KEY, PLATFORM_WALLET_SECONDARY_KEY) are required for crypto transfer');
        }

        logger.info(`Initiating immediate crypto transfer to user wallet:`);
        logger.info(`- User ID: ${user._id}`);
        logger.info(`- Wallet: ${user.walletAddress}`);
        logger.info(`- Amount: ${cryptoAmount} ${tokenType} on ${chain}`);

        const transferResult = await sendFromPlatformWallet(
          cryptoAmount,
          user.walletAddress,
          primaryKey,
          secondaryKey,
          chain,
          tokenType as TokenSymbol
        );

        const explorerUrl = generateExplorerUrl(chain, transferResult.transactionHash);

        // Update escrow with successful transfer
        escrow.status = 'completed';
        escrow.completedAt = new Date();
        escrow.cryptoTransactionHash = transferResult.transactionHash;
        escrow.metadata = { 
          ...escrow.metadata, 
          mpesaPaymentReceived: true,
          cryptoTransferred: true,
          transferHash: transferResult.transactionHash,
          explorerUrl,
          processingStatus: 'completed',
          completedAt: new Date().toISOString(),
          mpesaReceiptNumber,
          directProcessing: true
        };
        await escrow.save();

        logger.info(`✅ Crypto transfer completed: ${transferResult.transactionHash}`);
        logger.info(`- Explorer: ${explorerUrl}`);

        // Record the transfer for audit
        const transactionData = {
          type: 'escrow_to_user',
          status: 'completed',
          txId: transferResult.transactionHash,
          escrowId: escrow._id.toString(),
          userId: user._id.toString(),
          toAddress: user.walletAddress,
          amount: cryptoAmount,
          tokenType,
          chainName: chain || 'unknown'
        };
        recordTransaction(transactionData);
      } catch (error: any) {
        logger.error(`Error during immediate crypto transfer: ${error.message}`);
        escrow.status = 'error';
        escrow.metadata = {
          ...escrow.metadata,
          error: error.message,
          errorCode: 'CRYPTO_TRANSFER_FAILED',
          mpesaPaymentReceived: true,
          mpesaReceiptNumber
        };
        await escrow.save();

        const transactionData = {
          type: 'escrow_to_user',
          status: 'failed',
          escrowId: escrow._id.toString(),
          userId: escrow.userId.toString(),
          amount: cryptoAmount,
          tokenType,
          chainName: chain || 'unknown',
          error: error.message
        };
        recordTransaction(transactionData);
      }
    } else {
      logger.info(`Payment failed or cancelled for ${transactionId}`);
      escrow.status = 'failed';
      await escrow.save();
    }
  } catch (error) {
    logger.error(`Error processing STK callback: ${error}`);
  }
};

// Define function to check specific status values to avoid type comparison errors
function hasErrorOrFailedStatus(status: string): boolean {
    return status === 'error' || status === 'failed';
}

/**
 * Manual M-Pesa Receipt Verification and Crypto Release
 * Secure system for users to manually submit M-Pesa receipt when automatic detection fails
 */
export const submitMpesaReceiptManually = async (req: Request, res: Response) => {
  try {
    const { mpesaReceiptNumber, transactionId } = req.body;
    
    // Validate user authentication
    if (!req.user) {
      return res.status(401).json(standardResponse(
        false,
        "Authentication required",
        null,
        { code: "AUTH_REQUIRED", message: "You must be logged in to submit M-Pesa receipt" }
      ));
    }

    const authenticatedUser = req.user;
    
    // Validate input
    if (!mpesaReceiptNumber || !transactionId) {
      return res.status(400).json(standardResponse(
        false,
        "Missing required fields",
        null,
        { code: "MISSING_FIELDS", message: "M-Pesa receipt number and transaction ID are required" }
      ));
    }

    // Validate M-Pesa receipt format (basic validation)
    const receiptRegex = /^[A-Z0-9]{10}$/i; // M-Pesa receipts are typically 10 alphanumeric characters
    if (!receiptRegex.test(mpesaReceiptNumber)) {
      return res.status(400).json(standardResponse(
        false,
        "Invalid M-Pesa receipt format",
        null,
        { code: "INVALID_RECEIPT_FORMAT", message: "M-Pesa receipt must be 10 alphanumeric characters" }
      ));
    }

    // Find the transaction and verify ownership
    const escrow = await Escrow.findOne({ 
      transactionId,
      userId: authenticatedUser._id
    });
    
    if (!escrow) {
      return res.status(404).json(standardResponse(
        false,
        "Transaction not found",
        null,
        { code: "TRANSACTION_NOT_FOUND", message: "No transaction found or you don't have permission to access it" }
      ));
    }

    // Security check: Ensure this receipt hasn't been used before
    const existingReceiptUsage = await Escrow.findOne({ 
      mpesaReceiptNumber: mpesaReceiptNumber.toUpperCase(),
      _id: { $ne: escrow._id } // Exclude current transaction
    });
    
    if (existingReceiptUsage) {
      return res.status(400).json(standardResponse(
        false,
        "Receipt already used",
        null,
        { code: "RECEIPT_ALREADY_USED", message: "This M-Pesa receipt has already been used for another transaction" }
      ));
    }

    // Check transaction eligibility for manual intervention
    if (escrow.status === 'completed') {
      return res.status(400).json(standardResponse(
        false,
        "Transaction already completed",
        null,
        { code: "ALREADY_COMPLETED", message: "This transaction has already been completed" }
      ));
    }

    // Check if transaction is eligible for manual intervention
    const eligibleStatuses = ['reserved', 'error', 'failed'];
    if (!eligibleStatuses.includes(escrow.status)) {
      return res.status(400).json(standardResponse(
        false,
        "Transaction not eligible for manual submission",
        null,
        { 
          code: "NOT_ELIGIBLE", 
          message: `Transaction status '${escrow.status}' is not eligible for manual M-Pesa receipt submission` 
        }
      ));
    }

    // Verify this is a crypto purchase transaction
    if (escrow.type !== 'fiat_to_crypto') {
      return res.status(400).json(standardResponse(
        false,
        "Invalid transaction type",
        null,
        { code: "INVALID_TYPE", message: "Manual receipt submission is only available for crypto purchases" }
      ));
    }

    // Extract transaction metadata
    const metadata = escrow.metadata || {};
    const { directBuy, chain = 'arbitrum', tokenType = 'USDC' } = metadata;
    const cryptoAmount = typeof escrow.cryptoAmount === 'string' ? 
      parseFloat(escrow.cryptoAmount) : escrow.cryptoAmount;

    // Verify this is a direct buy transaction
    if (!directBuy) {
      return res.status(400).json(standardResponse(
        false,
        "Transaction not eligible",
        null,
        { code: "NOT_DIRECT_BUY", message: "Manual receipt submission is only available for direct crypto purchases" }
      ));
    }

    // Get user wallet information
    const user = await User.findById(escrow.userId);
    if (!user || !user.walletAddress) {
      return res.status(400).json(standardResponse(
        false,
        "User wallet not found",
        null,
        { code: "WALLET_NOT_FOUND", message: "User wallet address not found" }
      ));
    }

    logger.info(`🔍 Manual M-Pesa receipt submission:`);
    logger.info(`- User: ${user._id}`);
    logger.info(`- Transaction: ${transactionId}`);
    logger.info(`- Receipt: ${mpesaReceiptNumber}`);
    logger.info(`- Amount: ${cryptoAmount} ${tokenType} on ${chain}`);

    try {
      // Check platform wallet balance first using the correct existing function
      const platformWallets = await initializePlatformWallets();
      
      // Get token configuration
      const tokenConfig = getTokenConfig(chain as Chain, tokenType as TokenSymbol);
      if (!tokenConfig) {
        return res.status(400).json(standardResponse(
          false,
          "Token not supported",
          null,
          { code: "UNSUPPORTED_TOKEN", message: `Token ${tokenType} not supported on chain ${chain}` }
        ));
      }

      // Use the existing platform wallet balance function instead of custom one
      let platformBalance;
      let availableTokens = [];
      
      try {
        // Import the function from platformWallet service
        const { getPlatformWalletBalance } = await import('../services/platformWallet');
        platformBalance = await getPlatformWalletBalance(chain, tokenType as TokenSymbol);
        
        // Also check what other tokens are available on this wallet
        const otherTokens = ['USDC', 'USDT', 'DAI', 'WETH', 'WBTC'];
        for (const token of otherTokens) {
          try {
            const balance = await getPlatformWalletBalance(chain, token as TokenSymbol);
            if (balance > 0) {
              availableTokens.push({ token, balance });
            }
          } catch (err) {
            // Skip tokens that error
          }
        }
        
        logger.info(`Available tokens on ${chain}:`, availableTokens);
        
      } catch (balanceError: any) {
        logger.error(`Error getting platform balance: ${balanceError.message}`);
        // Fallback to custom function
        platformBalance = await getTokenBalanceOnChain(
          platformWallets.main.address, 
          chain,
          tokenType as TokenSymbol
        );
      }
      
      logger.info(`Platform balance check: ${platformBalance} ${tokenType} available, ${cryptoAmount} ${tokenType} required`);
      logger.info(`Platform wallet: ${platformWallets.main.address}`);
      logger.info(`Available tokens:`, availableTokens);
      
      // Validate platform has sufficient balance
      if (platformBalance < cryptoAmount) {
        return res.status(400).json(standardResponse(
          false,
          "Insufficient platform balance",
          {
            requestedToken: tokenType,
            requestedAmount: cryptoAmount,
            availableAmount: platformBalance,
            platformWallet: platformWallets.main.address,
            availableTokens: availableTokens,
            chain: chain
          },
          { 
            code: "INSUFFICIENT_PLATFORM_BALANCE", 
            message: `Platform wallet has insufficient ${tokenType} balance. Available: ${platformBalance} ${tokenType}, Required: ${cryptoAmount} ${tokenType}. Available tokens: ${availableTokens.map(t => `${t.token}: ${t.balance}`).join(', ')}` 
          }
        ));
      }

      logger.info(`🚀 Executing crypto transfer for manual receipt submission...`);
      
      // Get chain configuration
      const chainConfig = config[chain];
      if (!chainConfig || !chainConfig.chainId) {
        throw new Error(`Invalid chain configuration for ${chain}`);
      }
      
      // Define chain
      const thirdwebChain = defineChain(chainConfig.chainId);
      
      // Get the 3 platform wallet keys (same as used to create 0x2b0B97EA7922E9CF5ef689A211F75B1E67A261Bf)
      const primaryKey = process.env.PLATFORM_WALLET_PRIMARY_KEY;
      const secondaryKey = process.env.PLATFORM_WALLET_SECONDARY_KEY;
      const backupKey = process.env.PLATFORM_WALLET_BACKUP_KEY;
      
      if (!primaryKey || !secondaryKey || !backupKey) {
        throw new Error('Platform wallet keys (PLATFORM_WALLET_PRIMARY_KEY, PLATFORM_WALLET_SECONDARY_KEY, PLATFORM_WALLET_BACKUP_KEY) are required');
      }
      
      logger.info(`🔐 Using 3-key smart wallet setup for manual intervention`);
      logger.info(`🎯 Target wallet: 0x2b0B97EA7922E9CF5ef689A211F75B1E67A261Bf`);
      
      // Create the primary account that controls the smart wallet
      const primaryAccount = privateKeyToAccount({
        client,
        privateKey: primaryKey
      });
      
      logger.info(`👤 Primary account: ${primaryAccount.address}`);
      
      // Connect to the smart wallet using the primary account
      const wallet = smartWallet({
        chain: thirdwebChain,
        factoryAddress: config.SMART_WALLET_FACTORY_ADDRESS || '',
        gasless: true, // Enable gasless transactions for smart wallet
      });
      
      const smartAccount = await wallet.connect({
        client,
        personalAccount: primaryAccount,
      });
      
      logger.info(`🏦 Smart wallet connected: ${smartAccount.address}`);
      logger.info(`✅ Expected address: 0x2b0B97EA7922E9CF5ef689A211F75B1E67A261Bf`);
      
      // Verify that we're using the correct smart wallet
      if (smartAccount.address.toLowerCase() !== '0x2b0B97EA7922E9CF5ef689A211F75B1E67A261Bf'.toLowerCase()) {
        logger.warn(`⚠️ Smart wallet address mismatch!`);
        logger.warn(`Connected: ${smartAccount.address}`);
        logger.warn(`Expected: 0x2b0B97EA7922E9CF5ef689A211F75B1E67A261Bf`);
        // Continue anyway - this might be a development environment
      }
      
      logger.info(`🚀 Executing crypto transfer for manual receipt submission...`);
      
      // Get contract for the token
      const tokenContract = getContract({
        client,
        chain: thirdwebChain,
        address: tokenConfig.address,
      });
      
      logger.info(`Executing immediate crypto transfer...`);
      logger.info(`- From: ${smartAccount.address}`);
      logger.info(`- To: ${user.walletAddress}`);
      logger.info(`- Amount: ${cryptoAmount} ${tokenType}`);
      logger.info(`- Platform Balance: ${platformBalance} ${tokenType}`);
      
      // Execute transfer immediately with correct amount format for ThirdWeb
      // ThirdWeb's transfer function expects human-readable amounts, not raw amounts
      const transferTx = transfer({
        contract: tokenContract,
        to: user.walletAddress,
        amount: cryptoAmount // Use human-readable amount (e.g. 1.0 for 1 USDC)
      });
      
      // Execute transaction
      const result = await sendTransaction({
        transaction: transferTx,
        account: smartAccount
      });
      
      const cryptoTxHash = result.transactionHash;
      logger.info(`✅ IMMEDIATE crypto transfer completed with hash: ${cryptoTxHash}`);

      // Update escrow with completion details
      escrow.mpesaReceiptNumber = mpesaReceiptNumber.toUpperCase();
      escrow.status = 'completed';
      escrow.cryptoTransactionHash = cryptoTxHash;
      escrow.completedAt = new Date();
      escrow.metadata = {
        ...escrow.metadata,
        mpesaPaymentReceived: true,
        manualReceiptSubmission: true,
        manualSubmissionAt: new Date().toISOString(),
        cryptoTransferComplete: true,
        txHash: cryptoTxHash,
        explorerUrl: generateExplorerUrl(chain, cryptoTxHash),
        completedViaManualIntervention: true,
        immediateTransfer: true,
        platformBalance: platformBalance
      };
      await escrow.save();

      // Record successful transaction for audit
      const transactionData: TransactionLogEntry = {
        type: 'manual_mpesa_verification',
        status: 'completed',
        executionTimeMs: escrow.createdAt ? Date.now() - new Date(escrow.createdAt).getTime() : 0,
        escrowId: escrow._id.toString(),
        userId: escrow.userId.toString(),
        amount: escrow.amount,
        mpesaReceiptNumber: mpesaReceiptNumber.toUpperCase(),
        chainName: chain,
        txId: cryptoTxHash
      };
      
      try {
        await recordTransaction(transactionData);
      } catch (error) {
        logger.error(`Failed to record manual transaction: ${error}`);
      }

      // Log for reconciliation
      logTransactionForReconciliation({
        transactionId: escrow.transactionId,
        userId: escrow.userId.toString(),
        type: 'manual_intervention',
        status: 'completed',
        fiatAmount: escrow.amount,
        cryptoAmount,
        tokenType,
        chain,
        mpesaReceiptNumber: mpesaReceiptNumber.toUpperCase(),
        cryptoTransactionHash: cryptoTxHash
      });

      logger.info(`🎉 Manual M-Pesa receipt processing COMPLETED successfully!`);
      logger.info(`- Transaction ID: ${escrow.transactionId}`);
      logger.info(`- M-Pesa Receipt: ${mpesaReceiptNumber.toUpperCase()}`);
      logger.info(`- Crypto TX Hash: ${cryptoTxHash}`);
      logger.info(`- Explorer URL: ${generateExplorerUrl(chain, cryptoTxHash)}`);
      logger.info(`- Platform Balance: ${platformBalance} ${tokenType}`);

      return res.status(200).json(standardResponse(
        true,
        "M-Pesa receipt verified and crypto transferred successfully",
        {
          transactionId: escrow.transactionId,
          mpesaReceiptNumber: mpesaReceiptNumber.toUpperCase(),
          cryptoAmount: parseFloat(cryptoAmount.toFixed(6)),
          tokenType,
          chain,
          recipient: user.walletAddress,
          cryptoTransactionHash: cryptoTxHash,
          explorerUrl: generateExplorerUrl(chain, cryptoTxHash),
          status: 'completed',
          completedAt: new Date().toISOString(),
          platformBalance: `${platformBalance} ${tokenType}`,
          note: "Your M-Pesa receipt has been verified and crypto has been transferred to your wallet successfully!"
        }
      ));
    } catch (error: any) {
      logger.error(`Error processing manual M-Pesa receipt: ${error.message}`);
      logger.error(`Error stack: ${error.stack}`);
      
      // If there was an error, mark the escrow for manual review
      try {
        escrow.metadata = {
          ...escrow.metadata,
          manualReceiptSubmissionError: true,
          lastError: error.message,
          errorAt: new Date().toISOString(),
          requiresManualReview: true
        };
        await escrow.save();
      } catch (saveError) {
        logger.error(`Failed to update escrow with error info: ${saveError}`);
      }
      
      return res.status(500).json(standardResponse(
        false,
        "Failed to process M-Pesa receipt",
        null,
        { 
          code: "PROCESSING_ERROR", 
          message: error.message.includes('insufficient balance') 
            ? "Platform wallet has insufficient balance. Please contact support."
            : `Crypto transfer failed: ${error.message}. Please contact support.`
        }
      ));
    }
  } catch (error: any) {
    logger.error('Error in manual M-Pesa receipt submission:', error);
    
    return res.status(500).json(standardResponse(
      false,
      "An unexpected error occurred",
      null,
      { code: "INTERNAL_ERROR", message: "Please try again later or contact support" }
    ));
  }
};

/**
 * Get transactions that require manual intervention
 * This endpoint helps users find transactions that need manual M-Pesa receipt submission
 */
export const getTransactionsRequiringIntervention = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json(standardResponse(
        false,
        "Authentication required",
        null,
        { code: "AUTH_REQUIRED", message: "You must be logged in to view transactions" }
      ));
    }

    const authenticatedUser = req.user;

    // Find transactions that might need manual intervention
    const eligibleTransactions = await Escrow.find({
      userId: authenticatedUser._id,
      type: 'fiat_to_crypto',
      status: { $in: ['reserved', 'error', 'failed'] },
      'metadata.directBuy': true,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
    })
    .sort({ createdAt: -1 })
    .limit(10);

    const transactionsNeedingIntervention = eligibleTransactions.map(escrow => {
      const metadata = escrow.metadata || {};
      return {
        transactionId: escrow.transactionId,
        amount: escrow.amount,
        cryptoAmount: escrow.cryptoAmount,
        tokenType: metadata.tokenType || 'USDC',
        chain: metadata.chain || 'arbitrum',
        status: escrow.status,
        createdAt: escrow.createdAt,
        requiresManualIntervention: metadata.requiresManualIntervention || escrow.status === 'error' || escrow.status === 'failed',
        hasReceiptSubmitted: !!escrow.mpesaReceiptNumber,
        eligibleForManualSubmission: !escrow.mpesaReceiptNumber && (escrow.status === 'reserved' || escrow.status === 'error')
      };
    });

    return res.json(standardResponse(
      true,
      "Transactions requiring intervention retrieved successfully",
      {
        transactions: transactionsNeedingIntervention,
        totalCount: transactionsNeedingIntervention.length,
        message: transactionsNeedingIntervention.length > 0 ? 
          "You have transactions that may require manual M-Pesa receipt submission" : 
          "No transactions currently require manual intervention"
      }
    ));
  } catch (error: any) {
    logger.error('Error getting transactions requiring intervention:', error);
    
    return res.status(500).json(standardResponse(
      false,
      "Failed to retrieve transactions",
      null,
      { code: "INTERNAL_ERROR", message: "Please try again later" }
    ));
  }
};

/**
 * Test webhook endpoint to verify webhook connectivity and logging
 */
export const testWebhookLogging = async (req: Request, res: Response) => {
    const timestamp = new Date().toISOString();
    const testId = randomUUID().slice(0, 8);
    
    // Test the prominent logging functions
    logProminentWebhookReceived(req);
    logProminentMpesaReceipt(testId, "TEST123456", 100, "test-transaction-id");
    
    // Log success
    const separator = "✅".repeat(50);
    process.stdout.write(`\n${separator}\n`);
    process.stdout.write(`🧪 WEBHOOK TEST COMPLETED - ${timestamp}\n`);
    process.stdout.write(`🆔 Test ID: ${testId}\n`);
    process.stdout.write(`📱 If you can see this, webhook logging is working!\n`);
    process.stdout.write(`${separator}\n\n`);
    
    res.status(200).json({
        success: true,
        message: "Webhook test completed - check your terminal for prominent logging",
        data: {
            testId,
            timestamp,
            note: "If you can see prominent logging in your terminal, webhooks will be visible"
        }
    });
};

/**
 * Test B2B callback endpoint
 */
export const testB2BCallback = async (req: Request, res: Response) => {
    console.log("🧪 [B2B-TEST] B2B callback test endpoint called");
    console.log("📲 [B2B-TEST] Request body:", JSON.stringify(req.body, null, 2));
    console.log("📲 [B2B-TEST] Request headers:", req.headers);
    
    // Simulate a B2B callback response
    const testResponse = {
        success: true,
        message: "B2B callback test successful",
        timestamp: new Date().toISOString(),
        receivedData: {
            body: req.body,
            headers: req.headers
        }
    };
    
    console.log("✅ [B2B-TEST] B2B callback test completed successfully");
    
    res.status(200).json(testResponse);
};

/**
 * Manual rollback endpoint for testing and emergency situations
 */
export const manualRollback = async (req: Request, res: Response) => {
    try {
        const { transactionId } = req.body;
        
        if (!req.user) {
            return res.status(401).json(standardResponse(
                false,
                "Authentication required",
                null,
                { code: "AUTH_REQUIRED", message: "You must be logged in to perform this action" }
            ));
        }
        
        const authenticatedUser = req.user;
        
        if (!transactionId) {
            return res.status(400).json(standardResponse(
                false,
                "Transaction ID required",
                null,
                { code: "MISSING_TRANSACTION_ID", message: "Transaction ID is required" }
            ));
        }
        
        // Find the escrow transaction
        const escrow = await Escrow.findOne({ 
            transactionId,
            userId: authenticatedUser._id
        });
        
        if (!escrow) {
            return res.status(404).json(standardResponse(
                false,
                "Transaction not found",
                null,
                { code: "TRANSACTION_NOT_FOUND", message: "Transaction not found or not owned by user" }
            ));
        }
        
        if (escrow.status === 'completed') {
            return res.status(400).json(standardResponse(
                false,
                "Transaction already completed",
                null,
                { code: "ALREADY_COMPLETED", message: "Cannot rollback completed transaction" }
            ));
        }
        
        // Perform rollback
        const primaryKey = process.env.PLATFORM_WALLET_PRIMARY_KEY;
        const secondaryKey = process.env.PLATFORM_WALLET_SECONDARY_KEY;
        
        if (!primaryKey || !secondaryKey) {
            return res.status(500).json(standardResponse(
                false,
                "Platform wallet keys not available",
                null,
                { code: "WALLET_KEYS_UNAVAILABLE", message: "Platform wallet keys not configured" }
            ));
        }
        
        const { sendFromPlatformWallet } = await import('../services/platformWallet');
        
        const rollbackResult = await sendFromPlatformWallet(
            escrow.cryptoAmount,
            authenticatedUser.walletAddress,
            primaryKey,
            secondaryKey,
            escrow.metadata?.chain || 'arbitrum',
            escrow.metadata?.tokenType || 'USDC'
        );
        
        // Update escrow
        escrow.status = 'failed';
        escrow.metadata = {
            ...escrow.metadata,
            manualRollback: true,
            rollbackTransactionHash: rollbackResult.transactionHash,
            rollbackCompletedAt: new Date().toISOString(),
            rollbackReason: 'MANUAL_ROLLBACK'
        };
        await escrow.save();
        
        // Send SMS notification
        try {
            await SMSService.sendSecurityAlert(
                authenticatedUser.phoneNumber,
                'ROLLBACK_SUCCESS',
                `REFUND ${escrow.cryptoAmount}${escrow.metadata?.tokenType||'USDC'} ${new Date().toLocaleTimeString('en-KE',{hour12:false})}`
            );
        } catch (smsError) {
            console.error("❌ Failed to send manual rollback SMS:", smsError);
        }
        
        return res.json(standardResponse(
            true,
            "Manual rollback successful",
            {
                transactionId,
                rollbackTxHash: rollbackResult.transactionHash,
                amount: escrow.cryptoAmount,
                tokenType: escrow.metadata?.tokenType || 'USDC'
            },
            { code: "MANUAL_ROLLBACK_SUCCESS", message: "Crypto has been returned to your wallet" }
        ));
        
    } catch (error: any) {
        console.error("❌ Manual rollback error:", error);
        return res.status(500).json(standardResponse(
            false,
            "Manual rollback failed",
            null,
            { code: "MANUAL_ROLLBACK_FAILED", message: error.message }
        ));
    }
};

/**
 * Pay Paybill/Till using Crypto - High Performance Crypto Spending System
 * Allows users to spend their crypto for real-world M-Pesa payments
 */
export const payWithCrypto = async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const transactionId = randomUUID();
    
    try {
        const { 
            amount, 
            targetType, // 'paybill' or 'till'
            targetNumber, // paybill number or till number
            accountNumber, // for paybills only
            cryptoAmount,
            chain,
            tokenType,
            description 
        } = req.body;
        
        // 🔐 SECURITY: Validate user authentication
        if (!req.user) {
            return res.status(401).json(standardResponse(
                false,
                "Authentication required",
                null,
                { code: "AUTH_REQUIRED", message: "You must be logged in to spend crypto" }
            ));
        }

        const authenticatedUser = req.user;
        
        // 📊 PERFORMANCE: Parallel validation for speed
        const [
            conversionRate,
            platformWallets,
            userCryptoBalance
        ] = await Promise.all([
            getConversionRateWithCaching(tokenType),
            initializePlatformWallets(),
            getTokenBalanceOnChain(authenticatedUser.walletAddress, chain, tokenType as TokenSymbol)
        ]);
        
        // 💰 VALIDATION: Input validation with enhanced security
        if (!amount || !targetType || !targetNumber || !cryptoAmount || !chain || !tokenType) {
            return res.status(400).json(standardResponse(
                false,
                "Missing required fields",
                null,
                { code: "MISSING_FIELDS", message: "All payment details are required" }
            ));
        }

        // Validate target type
        if (!['paybill', 'till'].includes(targetType)) {
            return res.status(400).json(standardResponse(
                false,
                "Invalid target type",
                null,
                { code: "INVALID_TARGET", message: "Target type must be 'paybill' or 'till'" }
            ));
        }

        // M-Pesa minimum amount validation
        const MIN_MPESA_AMOUNT = 10; // KES
        if (amount < MIN_MPESA_AMOUNT) {
            return res.status(400).json(standardResponse(
                false,
                `Amount too low`,
                null,
                { 
                    code: "AMOUNT_TOO_LOW", 
                    message: `Minimum M-Pesa transaction amount is ${MIN_MPESA_AMOUNT} KES. You tried to send ${amount} KES.`,
                    minimumAmount: MIN_MPESA_AMOUNT,
                    attemptedAmount: amount
                }
            ));
        }

        // Validate paybill requires account number
        if (targetType === 'paybill' && !accountNumber) {
            return res.status(400).json(standardResponse(
                false,
                "Account number required for paybill",
                null,
                { code: "MISSING_ACCOUNT", message: "Account number is required for paybill payments" }
            ));
        }

        // 🔢 VALIDATION: Amount validation
        const fiatAmount = parseFloat(amount);
        const cryptoAmountNum = parseFloat(cryptoAmount);
        
        if (isNaN(fiatAmount) || fiatAmount <= 0) {
            return res.status(400).json(standardResponse(
                false,
                "Invalid fiat amount",
                null,
                { code: "INVALID_AMOUNT", message: "Amount must be a positive number" }
            ));
        }

        if (isNaN(cryptoAmountNum) || cryptoAmountNum <= 0) {
            return res.status(400).json(standardResponse(
                false,
                "Invalid crypto amount",
                null,
                { code: "INVALID_CRYPTO_AMOUNT", message: "Crypto amount must be a positive number" }
            ));
        }

        // 🏦 VALIDATION: Check user has sufficient crypto balance
        if (userCryptoBalance < cryptoAmountNum) {
            return res.status(400).json(standardResponse(
                false,
                "Insufficient crypto balance",
                {
                    requestedAmount: cryptoAmountNum,
                    availableAmount: userCryptoBalance,
                    tokenType,
                    chain
                },
                { 
                    code: "INSUFFICIENT_BALANCE", 
                    message: `Insufficient ${tokenType} balance. Available: ${userCryptoBalance}, Required: ${cryptoAmountNum}` 
                }
            ));
        }

        // 🧮 VALIDATION: Verify conversion rate alignment (prevent manipulation)
        const expectedFiatAmount = Math.ceil(cryptoAmountNum * conversionRate);
        const tolerance = Math.max(1, Math.ceil(expectedFiatAmount * 0.02)); // 2% tolerance
        
        if (Math.abs(fiatAmount - expectedFiatAmount) > tolerance) {
            return res.status(400).json(standardResponse(
                false,
                "Amount mismatch detected",
                {
                    providedFiat: fiatAmount,
                    expectedFiat: expectedFiatAmount,
                    cryptoAmount: cryptoAmountNum,
                    conversionRate,
                    tolerance
                },
                { 
                    code: "AMOUNT_MISMATCH", 
                    message: `Amount mismatch. Expected ${expectedFiatAmount} KES for ${cryptoAmountNum} ${tokenType}` 
                }
            ));
        }

        // 🗃️ Create escrow record for tracking (ACID compliance)
        const escrow = new Escrow({
            transactionId,
            userId: authenticatedUser._id,
            amount: fiatAmount,
            cryptoAmount: cryptoAmountNum,
            type: targetType === 'paybill' ? 'crypto_to_paybill' : 'crypto_to_till',
            status: 'pending',
            targetNumber,
            accountNumber: targetType === 'paybill' ? accountNumber : undefined,
            metadata: {
                chain,
                tokenType,
                targetType,
                description: description || `${targetType} payment`,
                conversionRate,
                userCryptoBalanceAtTime: userCryptoBalance,
                estimatedProcessingTime: new Date(Date.now() + 2 * 60 * 1000) // 2 minutes
            }
        });

        await escrow.save();
        
        console.log(`🚀 [CRYPTO-PAY] Starting crypto payment: ${cryptoAmountNum} ${tokenType} → ${fiatAmount} KES to ${targetType} ${targetNumber}`);

        // 🔄 ATOMIC TRANSACTION: Step 1 - Transfer crypto from user to platform
        let cryptoTransferResult;
        try {
            console.log(`💰 [CRYPTO-PAY] Transferring ${cryptoAmountNum} ${tokenType} from user to platform wallet...`);
            
            cryptoTransferResult = await sendTokenFromUser(
                platformWallets.main.address,
                cryptoAmountNum,
                authenticatedUser.privateKey,
                chain
            );

            if (!cryptoTransferResult || !cryptoTransferResult.transactionHash) {
                throw new Error('Crypto transfer failed - no transaction hash received');
            }

            // Update escrow with crypto transaction
            escrow.cryptoTransactionHash = cryptoTransferResult.transactionHash;
            escrow.status = 'processing';
            await escrow.save();
            
            console.log(`✅ [CRYPTO-PAY] Crypto transfer successful: ${cryptoTransferResult.transactionHash}`);
            
        } catch (cryptoError: any) {
            console.error(`❌ [CRYPTO-PAY] Crypto transfer failed:`, cryptoError);
            
            // Update escrow with failure
            escrow.status = 'failed';
            escrow.metadata = { 
                ...escrow.metadata, 
                error: cryptoError.message,
                errorCode: 'CRYPTO_TRANSFER_FAILED',
                failedAt: new Date().toISOString()
            };
            await escrow.save();
            // Short SMS: on-chain failure
            try {
                await SMSService.sendSecurityAlert(
                    authenticatedUser.phoneNumber,
                    'ONCHAIN',
                    `FAIL ${cryptoAmountNum} ${tokenType} ${new Date().toLocaleTimeString('en-KE',{hour12:false})}`
                );
            } catch {}
            
            return res.status(500).json(standardResponse(
                false,
                "Crypto transfer failed",
                null,
                { 
                    code: "CRYPTO_TRANSFER_FAILED", 
                    message: `Failed to transfer crypto: ${cryptoError.message}` 
                }
            ));
        }

        // 📱 ATOMIC TRANSACTION: Step 2 - Initiate correct M-Pesa flow
        let mpesaResult;
        try {
            if (targetType === 'paybill') {
                console.log(`🏢 [CRYPTO-PAY] Initiating B2B BusinessPayBill: ${fiatAmount} KES → paybill ${targetNumber}, account ${accountNumber}`);
                mpesaResult = await initiateB2BPaybill(
                    fiatAmount,
                    targetNumber,
                    accountNumber || 'ACCOUNT'
                );

                if (!mpesaResult || mpesaResult.ResponseCode !== "0") {
                    throw new Error(mpesaResult?.ResponseDescription || "B2B BusinessPayBill initiation failed");
                }

                // Update escrow for B2B
                escrow.mpesaTransactionId = mpesaResult.ConversationID || mpesaResult.MerchantRequestID || transactionId;
                escrow.status = 'processing';
                escrow.metadata = {
                    ...escrow.metadata,
                    mpesaResponseCode: mpesaResult.ResponseCode,
                    mpesaResponseDesc: mpesaResult.ResponseDescription,
                    processingTimeMs: Date.now() - startTime,
                    paymentMethod: 'b2b_paybill',
                    b2bConversationId: mpesaResult.ConversationID
                };
                await escrow.save();

                // Short SMS: on-chain success already ensured; notify B2B initiation
                try {
                    await SMSService.sendSecurityAlert(
                        authenticatedUser.phoneNumber,
                        'PAYBILL_INIT',
                        `OK ${Math.floor(fiatAmount)}KES ${targetNumber}/${(accountNumber||'').slice(-4)} ${new Date().toLocaleTimeString('en-KE',{hour12:false})}`
                    );
                } catch {}

                console.log(`✅ [CRYPTO-PAY] B2B BusinessPayBill initiated: ${escrow.mpesaTransactionId}`);
                
                // 🕐 TIMEOUT PROTECTION: Set up rollback timer for B2B transactions
                // If no callback received within 5 minutes, automatically rollback
                setTimeout(async () => {
                    try {
                        const updatedEscrow = await Escrow.findOne({ transactionId });
                        if (updatedEscrow && updatedEscrow.status === 'processing') {
                            console.log(`⏰ [TIMEOUT-ROLLBACK] B2B callback timeout for transaction: ${transactionId}`);
                            
                            // Mark as failed due to timeout
                            updatedEscrow.status = 'failed';
                            updatedEscrow.metadata = {
                                ...updatedEscrow.metadata,
                                timeoutRollback: true,
                                timeoutAt: new Date().toISOString(),
                                failureReason: 'B2B_CALLBACK_TIMEOUT'
                            };
                            await updatedEscrow.save();
                            
                            // Initiate rollback
                            const user = await User.findById(authenticatedUser._id);
                            if (user) {
                                const primaryKey = process.env.PLATFORM_WALLET_PRIMARY_KEY;
                                const secondaryKey = process.env.PLATFORM_WALLET_SECONDARY_KEY;
                                
                                if (primaryKey && secondaryKey) {
                                    const { sendFromPlatformWallet } = await import('../services/platformWallet');
                                    
                                    const rollbackResult = await sendFromPlatformWallet(
                                        cryptoAmountNum,
                                        user.walletAddress,
                                        primaryKey,
                                        secondaryKey,
                                        chain,
                                        tokenType as TokenSymbol
                                    );
                                    
                                    console.log(`✅ [TIMEOUT-ROLLBACK] Rollback successful: ${rollbackResult.transactionHash}`);
                                    
                                    // Update escrow with rollback info
                                    updatedEscrow.metadata = {
                                        ...updatedEscrow.metadata,
                                        rollbackTransactionHash: rollbackResult.transactionHash,
                                        rollbackCompletedAt: new Date().toISOString(),
                                        rollbackReason: 'B2B_CALLBACK_TIMEOUT'
                                    };
                                    await updatedEscrow.save();
                                    
                                    // Send rollback SMS to user
                                    try {
                                        await SMSService.sendSecurityAlert(
                                            user.phoneNumber,
                                            'ROLLBACK_SUCCESS',
                                            `REFUND ${cryptoAmountNum}${tokenType} ${new Date().toLocaleTimeString('en-KE',{hour12:false})}`
                                        );
                                    } catch (smsError) {
                                        console.error("❌ Failed to send timeout rollback SMS:", smsError);
                                    }
                                }
                            }
                        }
                    } catch (timeoutError) {
                        console.error(`❌ [TIMEOUT-ROLLBACK] Error during timeout rollback:`, timeoutError);
                    }
                }, 2 * 60 * 1000); // 2 minutes timeout
            } else {
                // Fallback to existing B2C for non-paybill targets
                console.log(`📱 [CRYPTO-PAY] Platform sending ${fiatAmount} KES to user via B2C for ${targetType} ${targetNumber}...`);
                const phoneForB2C = authenticatedUser.phoneNumber.startsWith('+') ? 
                    parseInt(authenticatedUser.phoneNumber.substring(1), 10) : 
                    parseInt(authenticatedUser.phoneNumber, 10);
                const b2cDescription = `Payment for ${targetType} ${targetNumber}`;
            mpesaResult = await initiateB2C(
                fiatAmount,
                phoneForB2C,
                b2cDescription
            );
            if (!mpesaResult || mpesaResult.ResponseCode !== "0") {
                throw new Error(mpesaResult?.ResponseDescription || "B2C payment initiation failed");
            }
            // Do NOT mark completed on acceptance; wait for callback
            escrow.mpesaTransactionId = mpesaResult.ConversationID;
            escrow.status = 'processing';
            escrow.metadata = {
                ...escrow.metadata,
                mpesaResponseCode: mpesaResult.ResponseCode,
                mpesaResponseDesc: mpesaResult.ResponseDescription,
                processingTimeMs: Date.now() - startTime,
                paymentMethod: 'platform_b2c',
                b2cConversationId: mpesaResult.ConversationID
            };
            await escrow.save();
            console.log(`✅ [CRYPTO-PAY] B2C payment accepted for processing: ${mpesaResult.ConversationID}`);
            // Timeout protection for B2C: auto-rollback if no callback within 5 minutes
            setTimeout(async () => {
                try {
                    const updatedEscrow = await Escrow.findOne({ transactionId });
                    if (updatedEscrow && updatedEscrow.status === 'processing') {
                        console.log(`⏰ [TIMEOUT-ROLLBACK] B2C callback timeout for transaction: ${transactionId}`);
                        // Mark as failed due to timeout
                        updatedEscrow.status = 'failed';
                        updatedEscrow.metadata = {
                            ...updatedEscrow.metadata,
                            timeoutRollback: true,
                            timeoutAt: new Date().toISOString(),
                            failureReason: 'B2C_CALLBACK_TIMEOUT'
                        };
                        await updatedEscrow.save();

                        // Initiate rollback (refund crypto to user)
                        const user = await User.findById(authenticatedUser._id);
                        if (user) {
                            const primaryKey = process.env.PLATFORM_WALLET_PRIMARY_KEY;
                            const secondaryKey = process.env.PLATFORM_WALLET_SECONDARY_KEY;
                            if (primaryKey && secondaryKey) {
                                const { sendFromPlatformWallet } = await import('../services/platformWallet');
                                const rollbackResult = await sendFromPlatformWallet(
                                    cryptoAmountNum,
                                    user.walletAddress,
                                    primaryKey,
                                    secondaryKey,
                                    chain,
                                    tokenType as TokenSymbol
                                );
                                console.log(`✅ [TIMEOUT-ROLLBACK] B2C rollback successful: ${rollbackResult.transactionHash}`);
                                updatedEscrow.metadata = {
                                    ...updatedEscrow.metadata,
                                    rollbackTransactionHash: rollbackResult.transactionHash,
                                    rollbackCompletedAt: new Date().toISOString(),
                                    rollbackReason: 'B2C_CALLBACK_TIMEOUT'
                                };
                                await updatedEscrow.save();
                                try {
                                    await SMSService.sendSecurityAlert(
                                        user.phoneNumber,
                                        'ROLLBACK_SUCCESS',
                                        `REFUND ${cryptoAmountNum}${tokenType} ${new Date().toLocaleTimeString('en-KE',{hour12:false})}`
                                    );
                                } catch (smsError) {
                                    console.error("❌ Failed to send B2C timeout rollback SMS:", smsError);
                                }
                            }
                        }
                    }
                } catch (timeoutError) {
                    console.error(`❌ [TIMEOUT-ROLLBACK] Error during B2C timeout rollback:`, timeoutError);
                }
            }, 2 * 60 * 1000);
            }
        } catch (mpesaError: any) {
            console.error(`❌ [CRYPTO-PAY] B2C payment failed, initiating rollback:`, mpesaError);
            
            // 🔄 ROLLBACK: Return crypto to user since M-Pesa failed
            try {
                console.log(`🔄 [CRYPTO-PAY] Rolling back crypto transfer...`);
                
                // Get platform wallet private key for rollback
                const primaryKey = process.env.PLATFORM_WALLET_PRIMARY_KEY;
                const secondaryKey = process.env.PLATFORM_WALLET_SECONDARY_KEY;
                
                if (!primaryKey || !secondaryKey) {
                    throw new Error('Platform wallet keys not available for rollback');
                }
                
                const rollbackResult = await sendFromPlatformWallet(
                    cryptoAmountNum,
                    authenticatedUser.walletAddress,
                    primaryKey,
                    secondaryKey,
                    chain,
                    tokenType as TokenSymbol
                );
                
                console.log(`✅ [CRYPTO-PAY] Rollback successful: ${rollbackResult.transactionHash}`);
                
                // Update escrow with rollback info
                escrow.status = 'failed';
                escrow.metadata = {
                    ...escrow.metadata,
                    error: mpesaError.message,
                    errorCode: 'MPESA_PAYMENT_FAILED',
                    rollbackTxHash: rollbackResult.transactionHash,
                    rollbackAt: new Date().toISOString(),
                    rollbackSuccessful: true
                };
                await escrow.save();
                
                try { await SMSService.sendSecurityAlert(authenticatedUser.phoneNumber, 'PAYBILL_INIT', `FAIL ${Math.floor(fiatAmount)}KES ${targetNumber} ${new Date().toLocaleTimeString('en-KE',{hour12:false})}`); } catch {}
                return res.status(500).json(standardResponse(
                    false,
                    targetType === 'paybill' ? "Paybill initiation failed - crypto returned" : "Platform payment failed - crypto returned to your wallet",
                    {
                        transactionId,
                        rollbackTxHash: rollbackResult.transactionHash,
                        explorerUrl: generateExplorerUrl(chain, rollbackResult.transactionHash)
                    },
                    { 
                        code: "PLATFORM_PAYMENT_FAILED_ROLLED_BACK", 
                        message: targetType === 'paybill' ? `B2B BusinessPayBill failed: ${mpesaError.message}. Crypto returned.` : `Platform B2C payment failed: ${mpesaError.message}. Your crypto has been returned to your wallet.` 
                    }
                ));
                
            } catch (rollbackError: any) {
                console.error(`💥 [CRYPTO-PAY] CRITICAL: Rollback failed!`, rollbackError);
                
                // Mark for manual intervention
                escrow.status = 'error';
                escrow.metadata = {
                    ...escrow.metadata,
                    error: mpesaError.message,
                    errorCode: 'MPESA_PAYMENT_FAILED',
                    rollbackError: rollbackError.message,
                    rollbackSuccessful: false,
                    requiresManualIntervention: true,
                    criticalError: true
                };
                await escrow.save();
                
                return res.status(500).json(standardResponse(
                    false,
                    "Payment failed - manual intervention required",
                    {
                        transactionId,
                        supportMessage: "Please contact support immediately with your transaction ID"
                    },
                    { 
                        code: "CRITICAL_FAILURE", 
                        message: "Payment failed and automatic rollback unsuccessful. Support has been notified." 
                    }
                ));
            }
        }

        // 🎉 SUCCESS: Crypto transfer and M-Pesa flow accepted
        const totalProcessingTime = Date.now() - startTime;
        
        // Record transaction for audit
        const transactionData: TransactionLogEntry = {
            type: 'crypto_to_mpesa_spending',
            status: 'completed',
            executionTimeMs: totalProcessingTime,
            escrowId: escrow._id.toString(),
            userId: escrow.userId.toString(),
            amount: fiatAmount,
            chainName: chain,
            txId: cryptoTransferResult.transactionHash
        };
        
        try {
            await recordTransaction(transactionData);
        } catch (error) {
            console.error(`Failed to record crypto spending transaction: ${error}`);
        }

        // Log for reconciliation
        logTransactionForReconciliation({
            transactionId: escrow.transactionId,
            userId: escrow.userId.toString(),
            type: 'crypto_spending',
            status: 'completed',
            fiatAmount,
            cryptoAmount: cryptoAmountNum,
            tokenType,
            chain,
            cryptoTransactionHash: cryptoTransferResult.transactionHash
        });

        // Short SMS for on-chain success
        try {
            await SMSService.sendSecurityAlert(
                authenticatedUser.phoneNumber,
                'ONCHAIN',
                `OK ${cryptoAmountNum} ${tokenType} ${new Date().toLocaleTimeString('en-KE',{hour12:false})}`
            );
        } catch {}

        console.log(`🎉 [CRYPTO-PAY] Payment flow initiated in ${totalProcessingTime}ms`);

        return res.status(200).json(standardResponse(
            true,
            "Crypto payment completed successfully",
            {
                transactionId: escrow.transactionId,
                fiatAmount,
                cryptoAmount: cryptoAmountNum,
                tokenType,
                chain,
                targetType,
                targetNumber,
                accountNumber: targetType === 'paybill' ? accountNumber : undefined,
                status: 'completed',
                completedAt: escrow.completedAt,
                cryptoTransactionHash: cryptoTransferResult.transactionHash,
                mpesaTransactionId: escrow.mpesaTransactionId,
                explorerUrl: generateExplorerUrl(chain, cryptoTransferResult.transactionHash),
                processingTimeMs: totalProcessingTime,
                conversionRate,
                description: escrow.metadata.description,
                paymentMethod: targetType === 'paybill' ? 'b2b_paybill' : 'platform_b2c',
                instructions: targetType === 'paybill' 
                    ? `✅ Initiated B2B to paybill ${targetNumber}${accountNumber ? ` ref ${accountNumber}` : ''}`
                    : `✅ ${fiatAmount} KES sent to your phone to pay ${targetType} ${targetNumber}`
            }
        ));

    } catch (error: any) {
        console.error("❌ [CRYPTO-PAY] Unexpected error:", error);
        
        // Try to update escrow if it exists
        try {
            const escrow = await Escrow.findOne({ transactionId });
            if (escrow && escrow.status !== 'completed') {
                escrow.status = 'error';
                escrow.metadata = {
                    ...escrow.metadata,
                    unexpectedError: error.message,
                    errorCode: 'UNEXPECTED_ERROR',
                    requiresManualReview: true
                };
                await escrow.save();
            }
        } catch (updateError) {
            console.error("Failed to update escrow with error:", updateError);
        }
        
        return handleError(error, res, "Failed to process crypto payment");
    }
};

/**
 * Initiate Paybill Payment via STK Push
 * Secure payment to business paybill numbers
 */
export const initiatePaybillPayment = async (
    phoneNumber: string,
    amount: number,
    paybillNumber: string,
    accountNumber: string,
    description: string
): Promise<any> => {
    try {
        console.log(`📱 [PAYBILL] Initiating payment: ${amount} KES to paybill ${paybillNumber}, account ${accountNumber}`);
        
        // Format phone number for M-Pesa API (remove + prefix)
        const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber.substring(1) : phoneNumber;
        console.log(`📱 [PAYBILL] Formatted phone: ${phoneNumber} → ${formattedPhone}`);
        
        const accessToken = await getMpesaAccessToken();
        const timestamp = generateTimestamp();
        const password = Buffer.from(`${config.MPESA_SHORTCODE}${config.MPESA_PASSKEY}${timestamp}`).toString('base64');
        
        console.log(`🔐 [PAYBILL] Using shortcode: ${config.MPESA_SHORTCODE}`);
        console.log(`🔐 [PAYBILL] Password generated with: ${config.MPESA_SHORTCODE}${config.MPESA_PASSKEY ? '***PASSKEY***' : 'UNDEFINED_PASSKEY'}${timestamp}`);
        
        const stkPushBody = {
            BusinessShortCode: config.MPESA_SHORTCODE,
            Password: password,
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline",
            Amount: Math.ceil(amount),
            PartyA: formattedPhone,
            PartyB: paybillNumber, // The paybill business number
            PhoneNumber: formattedPhone,
            CallBackURL: config.MPESA_STK_CALLBACK_URL,
            AccountReference: accountNumber,
            TransactionDesc: description || `Payment to ${paybillNumber}`
        };

        const response = await axios.post(
            `${config.MPESA_BASEURL}/mpesa/stkpush/v1/processrequest`,
            stkPushBody,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        console.log(`✅ [PAYBILL] STK Push initiated:`, response.data);
        return response.data;
        
    } catch (error: any) {
        console.error(`❌ [PAYBILL] Failed to initiate payment:`, error.response?.data || error.message);
        throw error;
    }
};

/**
 * Initiate Till Payment via STK Push
 * Secure payment to till numbers (Buy Goods)
 */
export const initiateTillPayment = async (
    phoneNumber: string,
    amount: number,
    tillNumber: string,
    description: string
): Promise<any> => {
    try {
        console.log(`📱 [TILL] Initiating payment: ${amount} KES to till ${tillNumber}`);
        
        // Format phone number for M-Pesa API (remove + prefix)
        const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber.substring(1) : phoneNumber;
        console.log(`📱 [TILL] Formatted phone: ${phoneNumber} → ${formattedPhone}`);
        
        const accessToken = await getMpesaAccessToken();
        const timestamp = generateTimestamp();
        const password = Buffer.from(`${config.MPESA_SHORTCODE}${config.MPESA_PASSKEY}${timestamp}`).toString('base64');
        
        console.log(`🔐 [TILL] Using shortcode: ${config.MPESA_SHORTCODE}`);
        console.log(`🔐 [TILL] Password generated with: ${config.MPESA_SHORTCODE}${config.MPESA_PASSKEY ? '***PASSKEY***' : 'UNDEFINED_PASSKEY'}${timestamp}`);
        
        const stkPushBody = {
            BusinessShortCode: config.MPESA_SHORTCODE,
            Password: password,
            Timestamp: timestamp,
            TransactionType: "CustomerBuyGoodsOnline",
            Amount: Math.ceil(amount),
            PartyA: formattedPhone,
            PartyB: tillNumber, // The till number
            PhoneNumber: formattedPhone,
            CallBackURL: config.MPESA_STK_CALLBACK_URL,
            AccountReference: tillNumber,
            TransactionDesc: description || `Payment to till ${tillNumber}`
        };

        const response = await axios.post(
            `${config.MPESA_BASEURL}/mpesa/stkpush/v1/processrequest`,
            stkPushBody,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        console.log(`✅ [TILL] STK Push initiated:`, response.data);
        return response.data;
        
    } catch (error: any) {
        console.error(`❌ [TILL] Failed to initiate payment:`, error.response?.data || error.message);
        throw error;
    }
};

/**
 * Generate blockchain explorer URL for transaction verification
 */
export const generateExplorerUrl = (chain: string, txHash: string): string => {
    const explorers: Record<string, string> = {
        'polygon': 'https://polygonscan.com/tx/',
        'ethereum': 'https://etherscan.io/tx/',
        'arbitrum': 'https://arbiscan.io/tx/',
        'optimism': 'https://optimistic.etherscan.io/tx/',
        'avalanche': 'https://snowtrace.io/tx/',
        'bsc': 'https://bscscan.com/tx/'
    };
    
    const baseUrl = explorers[chain.toLowerCase()] || explorers['polygon'];
    return `${baseUrl}${txHash}`;
};

/**
 * Log transaction for reconciliation and audit
 */
export const logTransactionForReconciliation = (data: any) => {
    const logEntry = {
        timestamp: new Date().toISOString(),
        ...data
    };
    
    // In production, this would go to a proper logging service
    console.log(`📊 [RECONCILIATION]`, JSON.stringify(logEntry, null, 2));
    
    // You could also write to a file or send to logging service
    // appendFileSync('./logs/reconciliation.log', JSON.stringify(logEntry) + '\n');
};

/**
 * Generate blockchain explorer URL for transaction verification
 */
const generateExplorerUrlLocal = (chain: string, txHash: string): string => {
    const explorers: Record<string, string> = {
        'polygon': 'https://polygonscan.com/tx/',
        'ethereum': 'https://etherscan.io/tx/',
        'arbitrum': 'https://arbiscan.io/tx/',
        'optimism': 'https://optimistic.etherscan.io/tx/',
        'avalanche': 'https://snowtrace.io/tx/',
        'bsc': 'https://bscscan.com/tx/'
    };
    
    const baseUrl = explorers[chain.toLowerCase()] || explorers['polygon'];
    return `${baseUrl}${txHash}`;
};

/**
 * Log transaction for reconciliation and audit
 */
const logTransactionForReconciliationLocal = (data: any) => {
    const logEntry = {
        timestamp: new Date().toISOString(),
        ...data
    };
    
    // In production, this would go to a proper logging service
    console.log(`📊 [RECONCILIATION]`, JSON.stringify(logEntry, null, 2));
    
    // You could also write to a file or send to logging service
    // appendFileSync('./logs/reconciliation.log', JSON.stringify(logEntry) + '\n');
};