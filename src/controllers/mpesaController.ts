import { NextFunction, Request, Response } from "express";
import { User } from '../models/models';
import { Business } from '../models/businessModel';
import { Escrow } from '../models/escrowModel';
import { initiateB2C, initiateSTKPush, initiatePaybillPayment, initiateTillPayment } from "../services/mpesa";
import config from "../config/env";
import { sendToken } from "../services/token";
import { getConversionRateWithCaching } from "../services/rates";
import { randomUUID } from "crypto";
import { standardResponse, handleError, generateSuccessCode } from "../services/utils";
import { 
    initializePlatformWallets, 
    sendTokenFromUser, 
    getWalletBalance, 
    collectTransactionFee,
    getPlatformWalletStatus as getWalletStatus,
    withdrawFeesToMainWallet as withdrawFees,
    queueTransaction
} from '../services/platformWallet';
import { TokenSymbol } from '../types/token';
import { Chain } from '../types/token';
import { getTokenConfig, getSupportedTokens } from '../config/tokens';
import { defineChain, getContract } from "thirdweb";
import { balanceOf } from "thirdweb/extensions/erc20";
import { client } from "../services/auth";
import { recordTransaction, TransactionType } from '../services/transactionLogger';
import { getRedisClient } from '../services/redis';
import { logTransactionForReconciliation } from '../services/reconciliation';
import { logger } from '../config/logger';

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
        const conversionRate = await getConversionRateWithCaching();
        
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

        const conversionRate = await getConversionRateWithCaching();
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
        const { amount, phone } = req.body;
        
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
            const userBalance = await getWalletBalance(authenticatedUser.walletAddress, 'celo');
            
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
        const conversionRate = await getConversionRateWithCaching();
        const fiatAmount = cryptoAmount * conversionRate;
        
        // Create transaction ID
        const transactionId = randomUUID();
        
        // Create escrow record
        const escrow = new Escrow({
            transactionId,
            userId: authenticatedUser._id,
            amount: fiatAmount,
            cryptoAmount,
            type: 'crypto_to_fiat',
            status: 'pending'
        });
        await escrow.save();
        
        try {
            // First, transfer tokens from user to platform wallet
            // Initialize platform wallets
            const platformWallets = await initializePlatformWallets();
            
            // Transfer tokens from user to platform wallet
            const tokenTransferResult = await sendTokenFromUser(
                platformWallets.main.address, 
                cryptoAmount,
                authenticatedUser.privateKey,
                'celo' // or use a parameter for chain selection
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
            await escrow.save();
            
            // Collect transaction fee
            await collectTransactionFee(
                cryptoAmount,
                authenticatedUser.privateKey,
                authenticatedUser.walletAddress,
                'celo'
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
                    estimatedCompletionTime: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes from now
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
        const conversionRate = await getConversionRateWithCaching();
        const fiatAmount = amountNum * conversionRate;

        // Create escrow record
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
            accountNumber
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
        const conversionRate = await getConversionRateWithCaching();
        const fiatAmount = amountNum * conversionRate;

        // Create escrow record
        const escrow = new Escrow({
            transactionId: randomUUID(),
            userId: authenticatedUser._id,
            amount: fiatAmount,
            cryptoAmount: amountNum,
            type: 'crypto_to_till',
            status: 'pending',
            tillNumber
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
            tillNumber
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
export const buyCrypto = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { cryptoAmount, phone, chain, tokenType } = req.body;
        
        // Enhanced debug logging with more transaction details
        console.log("✅ Buy Crypto Request:", {
            cryptoAmount,
            tokenType,
            chain,
            phone: phone.replace(/\d(?=\d{4})/g, "*"), // Mask most of the phone number for privacy
        });
        
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
        if (!cryptoAmount || !phone || !chain || !tokenType) {
            return res.status(400).json(standardResponse(
                false,
                "Missing required fields",
                null,
                { code: "MISSING_FIELDS", message: "Crypto amount, phone, chain, and token type are required" }
            ));
        }

        // Validate amount
        const cryptoAmountNum = parseFloat(cryptoAmount);
        if (isNaN(cryptoAmountNum) || cryptoAmountNum <= 0) {
            return res.status(400).json(standardResponse(
                false,
                "Invalid crypto amount",
                null,
                { code: "INVALID_AMOUNT", message: "Crypto amount must be a positive number" }
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

        // Step 2: Check if platform has sufficient balance
        const platformWallets = await initializePlatformWallets();
        let platformBalance;
        
        try {
            // Get current platform wallet balance for the requested token
            platformBalance = await getTokenBalanceOnChain(
                platformWallets.main.address, 
                chain, 
                tokenType as TokenSymbol
            );
            
            console.log(`Platform wallet balance check: ${platformBalance} ${tokenType} available on ${chain}`);
            
            // Validate if platform has enough balance to fulfill this request
            if (platformBalance < cryptoAmountNum) {
                console.log(`❌ Insufficient platform wallet balance: ${platformBalance} ${tokenType} < ${cryptoAmountNum} ${tokenType}`);
                
                // Get all supported tokens on this chain with their balances
                const supportedTokens = getSupportedTokens(chain as Chain);
                const alternativeOptions: Array<{token: string, maxAmount: number}> = [];
                
                // Check balances of other tokens on this chain
                for (const token of supportedTokens) {
                    if (token !== tokenType) {
                        try {
                            const balance = await getTokenBalanceOnChain(
                                platformWallets.main.address,
                                chain,
                                token as TokenSymbol
                            );
                            if (balance > 0) {
                                alternativeOptions.push({
                                    token,
                                    maxAmount: parseFloat(balance.toFixed(6))
                                });
                            }
                        } catch (err) {
                            console.error(`Error checking balance for ${token}:`, err);
                        }
                    }
                }
                
                // Check if same token is available on other chains
                const otherChainOptions: Array<{chain: string, maxAmount: number}> = [];
                const supportedChains = Object.keys(config).filter(c => 
                    c !== chain && 
                    config[c]?.chainId && 
                    getTokenConfig(c as Chain, tokenType as TokenSymbol)
                );
                
                for (const otherChain of supportedChains) {
                    try {
                        const balance = await getTokenBalanceOnChain(
                            platformWallets.main.address,
                            otherChain,
                            tokenType as TokenSymbol
                        );
                        if (balance > 0) {
                            otherChainOptions.push({
                                chain: otherChain,
                                maxAmount: parseFloat(balance.toFixed(6))
                            });
                        }
                    } catch (err) {
                        console.error(`Error checking balance for ${tokenType} on ${otherChain}:`, err);
                    }
                }
                
                return res.status(400).json(standardResponse(
                    false,
                    "Insufficient platform balance",
                    {
                        requestedAmount: cryptoAmountNum,
                        availableAmount: platformBalance,
                        token: tokenType,
                        chain: chain,
                        alternativeTokens: alternativeOptions,
                        alternativeChains: otherChainOptions,
                        maxPossibleAmount: platformBalance
                    },
                    { 
                        code: "INSUFFICIENT_PLATFORM_BALANCE", 
                        message: `Sorry, we can only process purchases up to ${platformBalance} ${tokenType} on ${chain} at this time.`
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
        
        // Get conversion rate based on token type
        const conversionRate = await getConversionRateWithCaching(tokenType);
        
        // Calculate MPESA amount based on crypto amount
        const mpesaAmount = Math.ceil(cryptoAmountNum * conversionRate);
        
        // Log the transaction details with dollar equivalent
        console.log(`✅ Transaction Details: ${cryptoAmountNum} ${tokenType} on ${chain} = ${mpesaAmount} KES (Rate: ${conversionRate} KES/${tokenType})`);
        
        // Create a unique transaction ID
        const transactionId = randomUUID();
        
        // Generate a unique success code for this transaction
        const successCode = generateSuccessCode();
        
        // Step 3: Create an escrow record with 'reserved' status to hold the crypto
        const escrow = new Escrow({
            transactionId,
            userId: authenticatedUser._id,
            amount: mpesaAmount,
            cryptoAmount: cryptoAmountNum,
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
        console.log(`💰 Reserved ${cryptoAmountNum} ${tokenType} on ${chain} for transaction ${transactionId}`);

        // Create a descriptive message for MPESA
        const mpesaDescription = `NexusPay: Buy ${cryptoAmountNum} ${tokenType} on ${chain}`;

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
                        successCode
                    }
                ));
            }
            
            // Get the main STK Push response (this always succeeds if we reach here)
            const stkResponse = mpesaResponse.stkResponse;
            const checkoutRequestId = mpesaResponse.checkoutRequestId;
            const queryResponse = mpesaResponse.queryResponse;
            const isProcessing = mpesaResponse.isProcessing === true;
            
            // Update escrow with MPESA transaction ID
            escrow.mpesaTransactionId = checkoutRequestId;
            await escrow.save();
            
            console.log(`✅ STK Push initiated successfully for ${cryptoAmountNum} ${tokenType} (${mpesaAmount} KES). Transaction ID: ${transactionId}`);
            
            // If query response exists and has non-zero result code, handle error
            if (queryResponse && typeof queryResponse === 'object' && 'ResultCode' in queryResponse && queryResponse.ResultCode !== "0") {
                // Check if it's a processing error rather than a definitive failure
                const errorCode = queryResponse.errorCode || (queryResponse as any).errorCode;
                const errorMessage = queryResponse.errorMessage || (queryResponse as any).errorMessage;
                
                if (errorCode === "500.001.1001" && 
                    errorMessage === "The transaction is being processed") {
                    
                    console.log(`⚠️ M-Pesa transaction is still processing. Transaction ID: ${transactionId}`);
                    
                    if (!escrow.metadata) {
                        escrow.metadata = {};
                    }
                    escrow.metadata.mpesaWarning = "STK Push query reported transaction is still processing";
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
                            successCode
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
                        successCode
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
    
    // Log the received webhook
        console.log("\n==================================================");
        console.log("📲 MPESA CALLBACK RECEIVED - DETAILED LOG");
        console.log("==================================================");
        console.log("REQUEST HEADERS:");
        console.log(JSON.stringify(req.headers, null, 2));
        console.log("\nREQUEST BODY:");
        console.log(JSON.stringify(req.body, null, 2));
        console.log("==================================================");
        
        // Process the callback asynchronously
        processSTKCallback(req.body).catch(err => {
            console.error("❌ Error processing STK callback:", err);
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
                    console.log(`🚀 [CB:${callbackId}] Processing direct buy crypto transfer for transaction: ${escrow.transactionId}`);
                    
                    // Retrieve user for wallet information
                    const user = await User.findById(escrow.userId);
                    if (!user) {
                        throw new Error(`User not found for transaction: ${escrow.transactionId}`);
                    }
                    
                    if (!user.walletAddress) {
                        throw new Error(`User wallet address not found for transaction: ${escrow.transactionId}`);
                    }
                    
                    // PERFORMANCE OPTIMIZATION: Use the queue for immediate response
                    // This improves response time and allows for parallel processing
                    const txId = await queueTransaction(
                        user.walletAddress,
                            cryptoAmount,
                            chain,
                        tokenType as TokenSymbol,
                        'high', // Priority level for faster processing
                        escrow._id.toString(), // Pass escrow ID to prevent duplicates
                        escrow.transactionId // Pass original transaction ID
                    );
                    
                    // Update escrow with queued transaction info
                    escrow.status = 'processing';
                        escrow.metadata = { 
                            ...escrow.metadata, 
                        mpesaPaymentReceived: true,
                        queuedTxId: txId,
                        processingStatus: 'queued',
                        queuedAt: new Date().toISOString(),
                        priority: 'high',
                        mpesaReceiptNumber // Store receipt for reference
                        };
                        await escrow.save();
                        
                    // Record transaction for audit
                    await recordTransaction({
                        type: 'mpesa_to_crypto',
                        txId,
                        status: 'processing',
                        executionTimeMs: Date.now() - new Date(escrow.createdAt).getTime(),
                        escrowId: escrow._id.toString(),
                            userId: escrow.userId.toString(),
                        amount: escrow.amount,
                        mpesaReceiptNumber
                    });
                    
                    // Log success
                    logger.info(`✅ [CB:${callbackId}] Transaction ${txId} queued for processing with HIGH priority`);
                    
                    // Log for reconciliation
                    logTransactionForReconciliation({
                        transactionId: escrow.transactionId,
                        userId: escrow.userId.toString(),
                        type: escrow.type,
                        status: 'processing',
                        fiatAmount: amount,
                        cryptoAmount,
                        tokenType,
                        chain,
                        mpesaReceiptNumber,
                        queuedTxId: txId
                    });
                } catch (error: any) {
                    console.error(`❌ [CB:${callbackId}] Error queueing crypto transfer for transaction ${escrow.transactionId}:`, error);
                    
                    // Update escrow with error details but keep M-Pesa receipt for reconciliation
                    escrow.status = 'error';
                    escrow.metadata = { 
                        ...escrow.metadata, 
                        error: error instanceof Error ? error.message : 'Unknown error processing crypto transfer',
                        errorCode: (error as any)?.code || 'CRYPTO_TRANSFER_ERROR',
                        mpesaPaymentReceived: true,
                        needsManualReview: true,
                        lastError: new Date().toISOString(),
                        mpesaReceiptNumber // Store receipt for reference
                    };
                    await escrow.save();
                    
                    // Add to retry queue for automatic recovery
                    await queueForRetry(escrow.transactionId);
                }
            } else if (escrow.status === 'processing') {
                console.log(`ℹ️ [CB:${callbackId}] Transaction ${escrow.transactionId} already in processing state`);
                // Update the receipt in case this is a new callback
                escrow.mpesaReceiptNumber = mpesaReceiptNumber;
                escrow.metadata = { ...escrow.metadata, mpesaReceiptNumber };
                await escrow.save();
            } else if (escrow.status === 'completed') {
                console.log(`ℹ️ [CB:${callbackId}] Transaction ${escrow.transactionId} already completed`);
                // Just update receipt for reconciliation if needed
                if (!escrow.mpesaReceiptNumber) {
                    escrow.mpesaReceiptNumber = mpesaReceiptNumber;
                    escrow.metadata = { ...escrow.metadata, mpesaReceiptNumber };
                    await escrow.save();
                }
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
                
                // Log for reconciliation
                logTransactionForReconciliation({
                    transactionId: escrow.transactionId,
                    userId: escrow.userId.toString(),
                    type: escrow.type,
                    status: escrow.status,
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
            
            // Log failed transaction for reconciliation
            logTransactionForReconciliation({
                transactionId: escrow.transactionId,
                userId: escrow.userId.toString(),
                type: escrow.type,
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
function generateExplorerUrl(chain: string, txHash: string): string {
    const explorers: {[key: string]: string} = {
        'celo': 'https://explorer.celo.org/mainnet/tx/',
        'polygon': 'https://polygonscan.com/tx/',
        'arbitrum': 'https://arbiscan.io/tx/',
        'base': 'https://basescan.org/tx/',
        'optimism': 'https://optimistic.etherscan.io/tx/',
        'ethereum': 'https://etherscan.io/tx/',
        'binance': 'https://bscscan.com/tx/',
        'bnb': 'https://bscscan.com/tx/',
        'avalanche': 'https://snowtrace.io/tx/',
        'fantom': 'https://ftmscan.com/tx/',
        'gnosis': 'https://gnosisscan.io/tx/',
        'scroll': 'https://scrollscan.com/tx/',
        'moonbeam': 'https://moonbeam.moonscan.io/tx/',
        'fuse': 'https://explorer.fuse.io/tx/',
        'aurora': 'https://explorer.aurora.dev/tx/'
    };
    
    const baseUrl = explorers[chain] || explorers['celo']; // Default to Celo if chain not found
    return `${baseUrl}${txHash}`;
}

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
        
        // Find the corresponding escrow transaction
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
            
            console.log(`✅ Successful B2C transaction for escrow: ${escrow.transactionId}`);
            
            // TODO: Send notification to user about successful withdrawal
        } else {
            // Transaction failed, handle reversal of crypto transfer
            escrow.status = 'failed';
            escrow.completedAt = new Date();
            await escrow.save();
            
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
                const platformBalance = await getWalletBalance(platformWallets.main.address, 'celo');
                
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
                    'celo'
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
        const tokenType = metadata.tokenType || 'USDC';
        const chain = metadata.chain || 'celo';
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
            type: escrow.type,
            status: escrow.status,
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
    const { directBuy, chain, tokenType, successCode } = escrow.metadata || {};
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
      
      // Update escrow with MPESA details
            escrow.mpesaReceiptNumber = mpesaReceiptNumber;
      escrow.status = directBuy ? 'reserved' : 'completed';
            await escrow.save();
      
      // Record transaction
      recordTransaction({
        type: 'mpesa_to_escrow', 
        status: 'completed',
        mpesaReceiptNumber,
        escrowId: escrow._id.toString(),
        userId: escrow.userId.toString(),
        amount: amount,
        tokenType,
        chainName: chain,
        metadata: {
          phoneNumber,
          transactionDate
        }
      }).catch(error => {
        logger.error(`Failed to record transaction: ${error.message}`);
      });
      
      // Determine if we should release crypto
      const shouldReleaseCrypto = directBuy === true;
            
            if (shouldReleaseCrypto) {
                try {
                    // Get the user
                    const user = await User.findById(escrow.userId);
                    
                    if (!user) {
            logger.error(`User not found for escrow transaction: ${escrow.transactionId}`);
                        escrow.status = 'error';
                        escrow.metadata = { 
                            ...escrow.metadata, 
                            error: !user ? 'User not found' : 'Wallet address not found',
                            errorCode: !user ? 'USER_NOT_FOUND' : 'WALLET_NOT_FOUND',
                            mpesaPaymentReceived: true
                        };
                        await escrow.save();
                        return;
                    }
                    
          if (!user.walletAddress) {
            logger.error(`User ${user._id} does not have a wallet address`);
            escrow.status = 'error';
            escrow.metadata = { 
              ...escrow.metadata, 
              error: 'Wallet address not found',
              errorCode: 'WALLET_NOT_FOUND',
              mpesaPaymentReceived: true
            };
            await escrow.save();
            return;
          }
          
          logger.info(`Initiating crypto transfer to user wallet:`);
          logger.info(`- User ID: ${user._id}`);
          logger.info(`- Wallet: ${user.walletAddress}`);
          logger.info(`- Amount: ${cryptoAmount} ${tokenType} on ${chain}`);
                    
          // Queue the crypto transfer for processing
          // This is more efficient than direct transfer in the callback
          const txId = await queueTransaction(
                        user.walletAddress,
                        cryptoAmount,
                        chain,
                        tokenType as TokenSymbol,
                        'high', // Priority level for faster processing
                        escrow._id.toString(), // Pass escrow ID to prevent duplicates
                        escrow.transactionId // Pass original transaction ID
                    );
                    
          // Update escrow with queued transaction
          escrow.status = 'pending';
          escrow.metadata = {
            ...escrow.metadata,
            queuedTxId: txId,
            mpesaPaymentReceived: true,
            mpesaReceiptNumber
          };
                    await escrow.save();
                    
          logger.info(`Crypto transfer queued with ID ${txId} for transaction ${transactionId}`);
          
          // Record the transfer for audit
          recordTransaction({
            type: 'escrow_to_user',
            status: 'pending',
            txId,
            escrowId: escrow._id.toString(),
            userId: user._id.toString(),
            toAddress: user.walletAddress,
            amount: cryptoAmount,
                        tokenType,
            chainName: chain
          }).catch(err => {
            logger.error(`Failed to record escrow_to_user transaction: ${err.message}`);
          });
        } catch (error: any) {
          logger.error(`Error initiating crypto transfer: ${error.message}`);
                    
          // Update escrow with error
                    escrow.status = 'error';
                    escrow.metadata = { 
                        ...escrow.metadata, 
            error: error.message,
            errorCode: 'CRYPTO_TRANSFER_FAILED',
                        mpesaPaymentReceived: true,
            mpesaReceiptNumber
                    };
                    await escrow.save();
                    
          // Record failed transaction for recovery
          recordTransaction({
            type: 'escrow_to_user',
            status: 'failed',
            escrowId: escrow._id.toString(),
                        userId: escrow.userId.toString(),
            amount: cryptoAmount,
                        tokenType,
            chainName: chain,
            error: error.message
          }).catch(err => {
            logger.error(`Failed to record failed transaction: ${err.message}`);
                    });
                }
            } else {
        logger.info(`Not a direct buy, skipping crypto transfer for ${transactionId}`);
            }
        } else {
      // Payment failed
      logger.warn(`Payment failed for transaction ${transactionId}: ${resultDesc}`);
      
      // Update escrow
            escrow.status = 'failed';
            escrow.metadata = { 
                ...escrow.metadata, 
        failureReason: resultDesc,
        failureCode: resultCode
            };
            await escrow.save();
            
      // Record transaction
      recordTransaction({
        type: 'mpesa_to_escrow',
                status: 'failed',
        escrowId: escrow._id.toString(),
        userId: escrow.userId.toString(),
        amount: escrow.amount,
        error: resultDesc
      }).catch(error => {
        logger.error(`Failed to record failed transaction: ${error.message}`);
            });
        }
    } catch (error: any) {
    logger.error(`Error processing STK callback: ${error.message}`);
    }
};

// Define function to check specific status values to avoid type comparison errors
function hasErrorOrFailedStatus(status: string): boolean {
    return status === 'error' || status === 'failed';
}

/**
 * Queue a failed transaction for automatic retry
 */
async function queueForRetry(transactionId: string): Promise<void> {
    try {
        // Log the retry attempt
        console.log(`🔄 Queueing transaction ${transactionId} for automatic retry`);
        
        // Find the transaction to retry
        const escrow = await Escrow.findOne({ transactionId });
        if (!escrow) {
            console.error(`❌ Transaction not found for retry: ${transactionId}`);
            return;
        }
        
        // Update retry count
        escrow.retryCount = (escrow.retryCount || 0) + 1;
        escrow.lastRetryAt = new Date();
        await escrow.save();
        
        console.log(`✅ Transaction ${transactionId} queued for retry (attempt ${escrow.retryCount})`);
        
        // Add to Redis queue for retry processing
        const redisClient = await getRedisClient();
        if (redisClient) {
            await redisClient.lPush('transaction:retry:queue', transactionId);
            console.log(`✅ Added ${transactionId} to Redis retry queue`);
        } else {
            console.warn(`⚠️ Redis client not available, transaction ${transactionId} will be retried by scheduled processor`);
        }
    } catch (error) {
        console.error(`❌ Error queueing transaction for retry: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}