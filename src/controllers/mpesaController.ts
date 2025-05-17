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
    sendTokenToUser
} from '../services/platformWallet';
import { TokenSymbol } from '../types/token';
import { Chain } from '../types/token';
import { getTokenConfig, getSupportedTokens } from '../config/tokens';
import { defineChain, getContract } from "thirdweb";
import { balanceOf } from "thirdweb/extensions/erc20";
import { client } from "../services/auth";

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
            const queryData = await initiateSTKPush(
                formattedPhone, 
                config.MPESA_SHORTCODE!, 
                amountNum, 
                "NexusPay Deposit", 
                authenticatedUser._id.toString()
            );
            
            if (!queryData || queryData.ResultCode !== "0") {
                escrow.status = 'failed';
                escrow.completedAt = new Date();
                await escrow.save();
                
                return res.status(400).json(standardResponse(
                    false,
                    "MPESA transaction unsuccessful",
                    null,
                    { 
                        code: "STK_PUSH_FAILED", 
                        message: queryData?.errorMessage || "Failed to initiate MPESA transaction"
                    }
                ));
            }

            // Update escrow with MPESA transaction ID
            escrow.mpesaTransactionId = queryData.CheckoutRequestID;
            await escrow.save();

            return res.json(standardResponse(
                true,
                "Transaction initiated successfully",
                {
                    transactionId: escrow.transactionId,
                    amount: amountNum,
                    expectedCryptoAmount: parseFloat(cryptoAmount.toFixed(6)),
                    status: 'pending',
                    checkoutRequestId: queryData.CheckoutRequestID,
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
            const queryData = await initiateSTKPush(
                formattedPhone, 
                config.MPESA_SHORTCODE!, 
                mpesaAmount, 
                mpesaDescription, 
                authenticatedUser._id.toString()
            );
            
            // Handle potential M-Pesa API errors
            if (!queryData) {
                console.warn(`⚠️ M-Pesa STK Push returned no data. Transaction ID: ${transactionId}`);
                
                if (!escrow.metadata) {
                    escrow.metadata = {};
                }
                escrow.metadata.mpesaWarning = "STK Push query returned no data";
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
            
            // Even if ResultCode is not 0, the transaction might still be processing
            if (queryData.ResultCode !== "0") {
                // Check if it's a processing error rather than a definitive failure
                if (queryData.errorCode === "500.001.1001" && queryData.errorMessage === "The transaction is being processed") {
                    console.log(`⚠️ M-Pesa transaction is still processing. Transaction ID: ${transactionId}`);
                    
                    escrow.mpesaTransactionId = queryData.CheckoutRequestID;
                    if (!escrow.metadata) {
                        escrow.metadata = {};
                    }
                    escrow.metadata.mpesaWarning = "STK Push reported transaction is still processing";
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
                            checkoutRequestId: queryData.CheckoutRequestID,
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
                await escrow.save();
                
                return res.status(400).json(standardResponse(
                    false,
                    "MPESA transaction unsuccessful",
                    null,
                    { 
                        code: "STK_PUSH_FAILED", 
                        message: queryData?.errorMessage || "Failed to initiate MPESA transaction"
                    }
                ));
            }

            // Update escrow with MPESA transaction ID
            escrow.mpesaTransactionId = queryData.CheckoutRequestID;
            await escrow.save();
            
            console.log(`✅ STK Push initiated successfully for ${cryptoAmountNum} ${tokenType} (${mpesaAmount} KES). Transaction ID: ${transactionId}`);

            return res.json(standardResponse(
                true,
                "Crypto purchase initiated successfully",
                {
                    transactionId: escrow.transactionId,
                    mpesaAmount,
                    cryptoAmount: parseFloat(cryptoAmountNum.toFixed(6)),
                    tokenType,
                    chain,
                    status: 'reserved', // Return reserved status
                    checkoutRequestId: queryData.CheckoutRequestID,
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
            
            // For other errors, mark as failed
            escrow.status = 'failed';
            escrow.completedAt = new Date();
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
    try {
        console.log("📲 Received MPESA STK Push callback:", JSON.stringify(req.body, null, 2));
        
        // Acknowledge the webhook immediately to avoid timeout
        const acknowledgement = {
            "ResponseCode": "00000000",
            "ResponseDesc": "success"
        };
        
        // Process the callback asynchronously
        processSTKCallback(req.body).catch(err => {
            console.error("❌ Error processing STK callback:", err);
        });
        
        // Respond to safaricom servers with a success message
        res.json(acknowledgement);
    } catch (error) {
        console.error("❌ Error in STK Push webhook:", error);
        
        // Still acknowledge receipt even on error to prevent retries
        res.json({
            "ResponseCode": "00000000",
            "ResponseDesc": "success"
        });
    }
};

/**
 * Process the STK Push callback data
 */
async function processSTKCallback(callbackData: any) {
    try {
        const stkCallback = callbackData.Body?.stkCallback;
        
        if (!stkCallback) {
            console.error("❌ Invalid STK callback format - missing Body.stkCallback");
            return;
        }
        
        const checkoutRequestID = stkCallback.CheckoutRequestID;
        const resultCode = parseInt(stkCallback.ResultCode, 10);
        
        // Find the corresponding escrow transaction
        const escrow = await Escrow.findOne({ mpesaTransactionId: checkoutRequestID });
        
        if (!escrow) {
            console.error(`❌ No escrow found for CheckoutRequestID: ${checkoutRequestID}`);
            return;
        }
        
        // Extract metadata for enhanced logging
        const metadata = escrow.metadata || {};
        const tokenType = metadata.tokenType || 'USDC';
        const chain = metadata.chain || 'celo';
        const cryptoAmount = typeof escrow.cryptoAmount === 'string' ? parseFloat(escrow.cryptoAmount) : escrow.cryptoAmount;
        const isDirectBuy = metadata.directBuy === true;
        
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
            
            // Step 5: Process crypto transfer only if escrow status is 'reserved'
            // This ensures we're following the new flow where crypto is validated and held before payment
            if (escrow.status === 'reserved' && isDirectBuy) {
                try {
                    // Get user wallet address
                    const user = await User.findById(escrow.userId);
                    if (!user || !user.walletAddress) {
                        console.error(`❌ User or wallet address not found for user ID ${escrow.userId}`);
                        escrow.status = 'error';
                        escrow.metadata = { ...escrow.metadata, error: 'User wallet not found' };
                        await escrow.save();
                        return;
                    }
                    
                    // Transfer token to user wallet
                    // This completes the final step after payment is confirmed
                    const txResult = await sendTokenToUser(
                        user.walletAddress,
                        cryptoAmount,
                        chain,
                        tokenType as TokenSymbol
                    );
                    
                    // Log transaction details
                    console.log(`\n🔄 TOKEN TRANSFER COMPLETED:`);
                    console.log(`- User: ${user.phoneNumber || user._id}`);
                    console.log(`- Wallet: ${user.walletAddress}`);
                    console.log(`- Amount: ${cryptoAmount} ${tokenType}`);
                    console.log(`- Chain: ${chain}`);
                    console.log(`- Transaction Hash: ${txResult.transactionHash}`);
                    console.log(`- Explorer URL: ${generateExplorerUrl(chain, txResult.transactionHash)}`);
                    
                    // Update escrow record with completion details
                    escrow.status = 'completed';
                    escrow.completedAt = new Date();
                    escrow.cryptoTransactionHash = txResult.transactionHash;
                    escrow.mpesaReceiptNumber = mpesaReceiptNumber;
                    escrow.metadata = { 
                        ...escrow.metadata,
                        txUrl: generateExplorerUrl(chain, txResult.transactionHash)
                    };
                    
                    await escrow.save();
                    
                    // Log for reconciliation
                    logTransactionForReconciliation({
                        transactionId: escrow.transactionId,
                        userId: escrow.userId.toString(),
                        type: 'fiat_to_crypto',
                        fiatAmount: amount,
                        cryptoAmount,
                        tokenType,
                        chain,
                        mpesaReceiptNumber,
                        blockchain_tx: txResult.transactionHash,
                        status: 'completed',
                        timestamp: new Date().toISOString()
                    });
                } catch (error: any) {
                    console.error(`❌ Error processing token transfer after successful payment:`, error);
                    
                    // Update escrow with error status
                    escrow.status = 'error';
                    escrow.metadata = { 
                        ...escrow.metadata, 
                        error: error.message || 'Unknown error during token transfer',
                        mpesaReceiptNumber 
                    };
                    await escrow.save();
                    
                    // Log failed transaction for reconciliation
                    logTransactionForReconciliation({
                        transactionId: escrow.transactionId,
                        userId: escrow.userId.toString(),
                        type: 'fiat_to_crypto',
                        fiatAmount: amount,
                        cryptoAmount,
                        tokenType,
                        chain,
                        mpesaReceiptNumber,
                        status: 'error',
                        error: error.message || 'Unknown error',
                        timestamp: new Date().toISOString()
                    });
                }
            } else if (!isDirectBuy) {
                // For regular deposit (not direct buy), just update the escrow
                escrow.status = 'completed';
                escrow.completedAt = new Date();
                escrow.mpesaReceiptNumber = mpesaReceiptNumber;
                await escrow.save();
                
                // Log for reconciliation
                logTransactionForReconciliation({
                    transactionId: escrow.transactionId,
                    userId: escrow.userId.toString(),
                    type: 'fiat_deposit',
                    fiatAmount: amount,
                    mpesaReceiptNumber,
                    status: 'completed',
                    timestamp: new Date().toISOString()
                });
            } else {
                console.warn(`⚠️ Escrow ${escrow.transactionId} has unexpected status: ${escrow.status}`);
                // Update with MPESA info but keep current status
                escrow.mpesaReceiptNumber = mpesaReceiptNumber;
                await escrow.save();
            }
        } else {
            // Payment failed
            console.error(`❌ M-PESA PAYMENT FAILED - Transaction ID: ${escrow.transactionId}, Code: ${resultCode}`);
            
            // Get the result description if available
            const resultDesc = stkCallback.ResultDesc || 'Unknown error';
            
            // Update escrow with failure details
            escrow.status = 'failed';
            escrow.completedAt = new Date();
            escrow.metadata = { ...escrow.metadata, error: resultDesc, errorCode: resultCode };
            await escrow.save();
            
            // Log failed transaction for reconciliation
            logTransactionForReconciliation({
                transactionId: escrow.transactionId,
                userId: escrow.userId.toString(),
                type: 'fiat_to_crypto',
                cryptoAmount,
                tokenType,
                chain,
                status: 'failed',
                error: resultDesc,
                errorCode: resultCode,
                timestamp: new Date().toISOString()
            });
        }
    } catch (error: any) {
        console.error("❌ Error processing STK callback:", error);
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

/**
 * Helper function to log transaction details for reconciliation
 */
function logTransactionForReconciliation(data: any): void {
    // This function would ideally write to a dedicated log file or database
    // For now, we'll just log to console in a structured format
    console.log('\n📝 TRANSACTION RECORD FOR RECONCILIATION 📝');
    console.log(JSON.stringify(data, null, 2));
    
    // In a production system, you might want to:
    // 1. Send this data to a monitoring system
    // 2. Store in a dedicated transaction log database
    // 3. Trigger alerts if needed
    // 4. Queue for email/notification to admins
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
    try {
        const callbackData = req.body.Body.stkCallback;
        
        // Log the raw callback data for debugging
        console.log("STK Callback received:", JSON.stringify(callbackData, null, 2));
        
        // Extract key data from callback
        const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc } = callbackData;
        
        // Always send a 200 response to MPESA to acknowledge receipt
        res.status(200).json({ success: true });
        
        // Find the escrow record for this MPESA transaction
        const escrow = await Escrow.findOne({ mpesaTransactionId: CheckoutRequestID });
        
        if (!escrow) {
            console.error(`Escrow record not found for CheckoutRequestID: ${CheckoutRequestID}`);
            return;
        }
        
        // Extract metadata for enhanced logging
        const metadata = escrow.metadata || {};
        const tokenType = metadata.tokenType || 'USDC';
        const chain = metadata.chain || 'celo';
        const cryptoAmount = typeof escrow.cryptoAmount === 'string' ? parseFloat(escrow.cryptoAmount) : escrow.cryptoAmount;
        
        // Process the callback based on result code
        if (ResultCode === 0) {
            // Success - extract payment details from callback item
            const callbackItems = callbackData.CallbackMetadata?.Item || [];
            const amount = callbackItems.find((item: any) => item.Name === "Amount")?.Value;
            const mpesaReceiptNumber = callbackItems.find((item: any) => item.Name === "MpesaReceiptNumber")?.Value;
            const phoneNumber = callbackItems.find((item: any) => item.Name === "PhoneNumber")?.Value;
            
            // Enhanced success logging
            console.log(`✅ Successful M-Pesa payment received:`);
            console.log(`- Transaction: ${escrow.transactionId}`);
            console.log(`- M-Pesa Receipt: ${mpesaReceiptNumber}`);
            console.log(`- Amount: ${amount} KES`);
            console.log(`- Crypto: ${cryptoAmount} ${tokenType} on ${chain} (≈ $${cryptoAmount} USD)`);
            console.log(`- Phone: ${phoneNumber}`);
            
            // Update the escrow record
            escrow.status = 'completed';
            escrow.completedAt = new Date();
            await escrow.save();
            
            // Attempt to transfer the crypto to the user
            try {
                // Get the user
                const user = await User.findById(escrow.userId);
                
                if (!user) {
                    console.error(`User not found for escrow transaction: ${escrow.transactionId}`);
                    return;
                }
                
                // Get wallet address
                const walletAddress = user.walletAddress;
                
                if (!walletAddress) {
                    console.error(`User ${user._id} does not have a wallet address`);
                    return;
                }
                
                // Transfer the crypto from platform wallet to user wallet
                const transferResult = await sendTokenToUser(
                    walletAddress,
                    escrow.cryptoAmount,
                    chain,
                    tokenType as TokenSymbol
                );
                
                // Update escrow with crypto transaction hash
                escrow.cryptoTransactionHash = transferResult.transactionHash;
                await escrow.save();
                
                console.log(`✅ Crypto transfer successful: ${transferResult.transactionHash}`);
                console.log(`- From: Platform wallet to ${walletAddress.substring(0, 8)}...`);
                console.log(`- Amount: ${cryptoAmount} ${tokenType} (≈ $${cryptoAmount} USD)`);
                
                // Mark the transaction as completed
                escrow.status = 'completed';
                await escrow.save();
            } catch (transferError) {
                console.error(`❌ Error transferring crypto to user:`, transferError);
                
                // The payment was received, but crypto transfer failed
                // This requires manual resolution - we should notify admins
                escrow.status = 'failed';
                await escrow.save();
            }
        } else {
            // Transaction failed on MPESA side
            console.error(`❌ STK Push transaction failed for ${escrow.transactionId}:`);
            console.error(`- Result Code: ${ResultCode}`);
            console.error(`- Description: ${ResultDesc}`);
            console.error(`- Transaction: ${cryptoAmount} ${tokenType} (≈ $${cryptoAmount} USD)`);
            
            // Update escrow status
            escrow.status = 'failed';
            escrow.completedAt = new Date();
            await escrow.save();
        }
    } catch (error) {
        console.error("❌ Error processing STK Push callback:", error);
    }
};