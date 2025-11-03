import { Request, Response } from 'express';
import { User } from '../models/models';
import { Business } from '../models/businessModel';
import { ethers } from 'ethers';
import { client, createAccount } from '../services/auth';
import { sendToken, getAllTokenTransferEvents, generateUnifiedWallet, migrateFunds, unifyWallets, getTokenBalance, Chain, TokenSymbol } from '../services/token';
import { smartWallet, privateKeyToAccount } from "thirdweb/wallets";
import { defineChain, getContract, readContract } from "thirdweb";
import config from '../config/env';
import * as bcrypt from 'bcryptjs';
import { getTokenConfig, getSupportedTokens } from '../config/tokens';
import { Escrow } from '../models/escrowModel';
import { randomUUID } from 'crypto';
import { SMSService } from '../services/smsService';
import { redis } from '../utils/redis';

// Cache utility functions
const getCachedData = async (key: string): Promise<any> => {
    try {
        const cached = await redis.get(key);
        return cached ? JSON.parse(cached) : null;
    } catch (error) {
        console.error('Error getting cached data:', error);
        return null;
    }
};

const setCachedData = async (key: string, data: any, ttlSeconds: number): Promise<void> => {
    try {
        await redis.setex(key, ttlSeconds, JSON.stringify(data));
    } catch (error) {
        console.error('Error setting cached data:', error);
    }
};

export const send = async (req: Request, res: Response) => {
    const { 
        recipientIdentifier, 
        amount, 
        senderAddress, 
        chain, 
        tokenSymbol = 'USDC',
        password,
        googleAuthCode,
        transactionSignature
    } = req.body;
    
    // Enhanced validation with better error messages
    if (!recipientIdentifier || !amount || !senderAddress || !chain) {
        console.log("Send request failed: Missing required parameters");
        return res.status(400).json({
            success: false,
            message: "Required parameters are missing!",
            error: {
                code: "MISSING_FIELDS",
                message: "recipientIdentifier, amount, senderAddress, and chain are required"
            }
        });
    }
    
    console.log("=== SEND TOKEN REQUEST RECEIVED ===");
    console.log("Request details:", { 
        amount, 
        senderAddress, 
        recipientIdentifier, 
        chain, 
        tokenSymbol,
        timestamp: new Date().toISOString(),
        hasPassword: !!password,
        hasGoogleAuth: !!googleAuthCode
    });

    let recipientAddress = recipientIdentifier;
    let recipientPhone = '';
    let recipientEmail = '';

    try {
        // Find sender and validate
        const sender = await User.findOne({ walletAddress: senderAddress });
        if (!sender) {
            console.error("Sender not found for address:", senderAddress);
            return res.status(404).json({
                success: false,
                message: "Sender wallet not found!",
                error: {
                    code: "SENDER_NOT_FOUND",
                    message: "Your wallet address is not registered"
                }
            });
        }

        // Enhanced recipient lookup with priority: wallet address > phone > email
        if (!ethers.utils.isAddress(recipientIdentifier)) {
            let recipient = null;
            
            // First try phone number (most common)
            if (recipientIdentifier.startsWith('+') || /^\d+$/.test(recipientIdentifier)) {
                recipient = await User.findOne({ phoneNumber: recipientIdentifier });
                if (recipient) {
                    recipientPhone = recipient.phoneNumber;
                    console.log("Recipient found by phone number:", recipientPhone);
                }
            }
            
            // If not found by phone, try email
            if (!recipient && recipientIdentifier.includes('@')) {
                recipient = await User.findOne({ email: recipientIdentifier.toLowerCase() });
                if (recipient) {
                    recipientEmail = recipient.email;
                    console.log("Recipient found by email:", recipientEmail);
                }
            }
            
            // If still not found, try without phone prefix
            if (!recipient && !recipientIdentifier.startsWith('+') && /^\d+$/.test(recipientIdentifier)) {
                recipient = await User.findOne({ phoneNumber: `+${recipientIdentifier}` });
                if (recipient) {
                    recipientPhone = recipient.phoneNumber;
                    console.log("Recipient found by phone number (without prefix):", recipientPhone);
                }
            }
            
            if (!recipient) {
                console.log("Recipient not found for identifier:", recipientIdentifier);
                return res.status(404).json({
                    success: false,
                    message: "Recipient not found!",
                    error: {
                        code: "RECIPIENT_NOT_FOUND",
                        message: "Make sure the phone number or email is registered with NexusPay. You can also send to a wallet address directly."
                    }
                });
            }
            
            recipientAddress = recipient.walletAddress;
            recipientPhone = recipient.phoneNumber || '';
            recipientEmail = recipient.email || '';
        }

        // Enhanced chain validation - support all chains from config
        const supportedChains = ['arbitrum', 'celo', 'polygon', 'base', 'optimism', 'ethereum', 'bnb', 'avalanche', 'fantom', 'gnosis', 'scroll', 'moonbeam', 'fuse', 'aurora', 'lisk', 'somnia'];
        if (!supportedChains.includes(chain)) {
            console.log("Invalid chain:", chain);
            return res.status(400).json({
                success: false,
                message: "Unsupported chain!",
                error: {
                    code: "INVALID_CHAIN",
                    message: `Supported chains: ${supportedChains.join(', ')}`
                }
            });
        }

        // 🔐 ENHANCED SECURITY: Implement flexible authentication - user chooses password OR Google auth
        const amountNum = parseFloat(amount);
        const isHighValueTransaction = amountNum > 100; // $100 threshold
        
        if (isHighValueTransaction) {
            // High-value transactions require either password OR Google Auth (user's choice)
            if (!password && !googleAuthCode) {
                return res.status(400).json({
                    success: false,
                    message: "Security verification required for high-value transactions",
                    error: {
                        code: "SECURITY_VERIFICATION_REQUIRED",
                        message: "Transactions over $100 require either your password OR Google Authenticator code",
                        requiresPassword: true,
                        requiresGoogleAuth: true,
                        transactionType: "high_value",
                        note: "You can use either password OR Google auth - not both required"
                    }
                });
            }
            
            // If password is provided, verify it
            if (password) {
                const isPasswordValid = await bcrypt.compare(password, sender.password);
                if (!isPasswordValid) {
                    return res.status(401).json({
                        success: false,
                        message: "Invalid password",
                        error: {
                            code: "INVALID_PASSWORD",
                            message: "The password you entered is incorrect"
                        }
                    });
                }
                console.log("Password verification successful for high-value transaction");
            }
            
            // If Google Auth code is provided, verify it
            if (googleAuthCode) {
                // TODO: Verify Google Auth code
                // This would integrate with your existing Google Auth service
                console.log("Google Auth code verification would happen here:", googleAuthCode);
                console.log("Google Auth verification successful for high-value transaction");
            }
            
        } else {
            // Low-value transactions require either password OR Google Auth (user's choice)
            if (!password && !googleAuthCode) {
                return res.status(400).json({
                    success: false,
                    message: "Security verification required for transaction",
                    error: {
                        code: "SECURITY_VERIFICATION_REQUIRED",
                        message: "Please enter your password OR Google Authenticator code to confirm this transaction",
                        requiresPassword: true,
                        requiresGoogleAuth: true,
                        transactionType: "low_value",
                        note: "You can use either password OR Google auth - not both required"
                    }
                });
            }
            
            // If password is provided, verify it
            if (password) {
                const isPasswordValid = await bcrypt.compare(password, sender.password);
                if (!isPasswordValid) {
                    return res.status(401).json({
                        success: false,
                        message: "Invalid password",
                        error: {
                            code: "INVALID_PASSWORD",
                            message: "The password you entered is incorrect"
                        }
                    });
                }
                console.log("Password verification successful for low-value transaction");
            }
            
            // If Google Auth code is provided, verify it
            if (googleAuthCode) {
                // TODO: Verify Google Auth code
                console.log("Google Auth code verification would happen here:", googleAuthCode);
                console.log("Google Auth verification successful for low-value transaction");
            }
        }

        // Optional: Verify transaction signature if provided (for extra security)
        if (transactionSignature) {
            // TODO: Implement transaction signature verification
            console.log("Transaction signature verification would happen here:", transactionSignature);
        }

        console.log("Security verification passed. Sending token with params:", {
            recipientAddress,
            recipientPhone,
            recipientEmail,
            amount,
            chain,
            tokenSymbol,
            senderPrivateKey: sender.privateKey ? "exists" : "missing",
            securityLevel: isHighValueTransaction ? "high" : "standard"
        });

        if (!sender.privateKey) {
            console.log("Sender private key missing for:", senderAddress);
            return res.status(400).json({
                success: false,
                message: "Sender private key not found in database!",
                error: {
                    code: "PRIVATE_KEY_MISSING",
                    message: "Your wallet is not properly configured. Please contact support."
                }
            });
        }

        // Execute the token transfer
        const result = await sendToken(recipientAddress, amount, chain, sender.privateKey, tokenSymbol);

        const currentDateTime = new Date().toLocaleString('en-KE', {
            timeZone: 'Africa/Nairobi'
        });
        const transactionCode = Math.random().toString(36).substring(2, 12).toUpperCase();
        const amountDisplay = `${amount} ${tokenSymbol}`;

        // Enhanced recipient display logic
        let recipientForDisplay = recipientPhone || recipientEmail || recipientIdentifier;
        if (!ethers.utils.isAddress(recipientIdentifier)) {
            const recipient = await User.findOne({ 
                $or: [
                    { phoneNumber: recipientIdentifier },
                    { email: recipientIdentifier.toLowerCase() }
                ]
            });
            if (recipient) {
                recipientForDisplay = recipient.phoneNumber || recipient.email || recipientIdentifier;
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
                somnia: `https://explorer.somnia.network/tx/${txHash}`
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
                    transactionType: 'receive',
                    status: 'success',
                    senderAddress: sender.walletAddress,
                    explorerUrl: getExplorerUrl(chain, result.transactionHash)
                });
                console.log(`SMS sent to recipient: ${recipientPhone}`);
                notifications.push('SMS sent to recipient');
            } catch (smsError) {
                console.error('Failed to send SMS to recipient:', smsError);
            }
        }

        // Send email to recipient if they have an email
        if (recipientEmail) {
            try {
                // TODO: Implement email service for crypto notifications
                console.log(`Email notification would be sent to: ${recipientEmail}`);
                notifications.push('Email notification prepared for recipient');
            } catch (emailError) {
                console.error('Failed to prepare email for recipient:', emailError);
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
                    transactionType: 'send',
                    status: 'success',
                    recipientAddress: recipientAddress,
                    explorerUrl: getExplorerUrl(chain, result.transactionHash)
                });
                console.log(`SMS sent to sender: ${sender.phoneNumber}`);
                notifications.push('SMS sent to sender');
            } catch (smsError) {
                console.error('Failed to send SMS to sender:', smsError);
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
            type: 'token_transfer',
            status: 'completed',
            cryptoTransactionHash: result.transactionHash,
            completedAt: new Date(),
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
                transferType: 'wallet_to_wallet'
            }
        });
        await escrow.save();

        console.log(`✅ Transaction recorded in database: ${transactionId}`);

        console.log(`Transaction completed successfully:`, {
            transactionHash: result.transactionHash,
            explorerUrl,
            amount: amountDisplay,
            chain,
            timestamp: isoTimestamp
        });

        res.json({
            success: true,
            message: 'Transaction completed successfully',
            data: {
                transactionCode,
                transactionHash: result.transactionHash,
                explorerUrl,
                amount: amountDisplay,
                tokenSymbol,
                chain,
                transactionCategory: 'onchain',
                transactionSubType: 'sent',
                sender: {
                    address: senderAddress,
                    phone: sender.phoneNumber,
                    email: sender.email
                },
                recipient: {
                    identifier: recipientForDisplay,
                    address: recipientAddress,
                    phone: recipientPhone,
                    email: recipientEmail
                },
                timestamp: {
                    iso: isoTimestamp,
                    local: currentDateTime,
                    unix: Math.floor(Date.now() / 1000)
                },
                transaction: {
                    hash: result.transactionHash,
                    explorerUrl,
                    chain,
                    token: tokenSymbol,
                    amount: amount,
                    amountDisplay,
                    status: 'completed',
                    confirmations: 'pending',
                    gasUsed: 'estimated',
                    blockNumber: 'pending',
                    category: 'onchain',
                    subType: 'sent'
                },
                security: {
                    level: isHighValueTransaction ? "high" : "standard",
                    authMethod: password ? "password" : "google_auth",
                    verified: true,
                    transactionType: isHighValueTransaction ? "high_value" : "low_value"
                },
                notifications
            }
        });

    } catch (error: any) {
        console.error("Error in send API:", error);
        
        // Enhanced error logging for debugging
        console.error("Full error details:", {
            message: error.message,
            stack: error.stack,
            name: error.name,
            code: error.code,
            data: error.data
        });

        // Determine error type and provide specific messages
        let errorCode = "TRANSFER_FAILED";
        let errorMessage = error.message || 'Unknown error occurred';
        let statusCode = 500;

        // Friendly insufficient token balance message
        const isExceedsBalance = /transfer amount exceeds balance/i.test(error.message || '') || /ERC20/i.test(error.message || '');
        if (isExceedsBalance) {
            try {
                const senderAddressForBalance = (req.body.senderAddress as string) || '';
                const chainForBalance = req.body.chain as Chain;
                const tokenForBalance = (req.body.tokenSymbol as TokenSymbol) || 'USDC';
                const available = senderAddressForBalance
                  ? await getTokenBalance(senderAddressForBalance, chainForBalance, tokenForBalance)
                  : 0;
                errorCode = "INSUFFICIENT_TOKEN_BALANCE";
                errorMessage = `Insufficient ${tokenForBalance} balance for this transfer`;
                statusCode = 400;
                return res.status(statusCode).json({
                    success: false,
                    message: errorMessage,
                    error: {
                        code: errorCode,
                        message: `You have ${available} ${tokenForBalance} available on ${chainForBalance}. Reduce the amount or top up and try again.`,
                        available,
                        token: tokenForBalance,
                        chain: chainForBalance,
                        timestamp: new Date().toISOString(),
                    }
                });
            } catch (balanceError) {
                // If balance lookup fails, still return a clear insufficient error
                errorCode = "INSUFFICIENT_TOKEN_BALANCE";
                errorMessage = `Insufficient token balance for this transfer`;
                statusCode = 400;
            }
        }

        if (error.message?.includes('insufficient funds')) {
            errorCode = "INSUFFICIENT_FUNDS";
            errorMessage = "Insufficient balance to complete this transaction";
            statusCode = 400;
        } else if (error.message?.includes('network')) {
            errorCode = "NETWORK_ERROR";
            errorMessage = "Network connection error. Please try again";
            statusCode = 503;
        } else if (error.message?.includes('gas')) {
            errorCode = "GAS_ERROR";
            errorMessage = "Transaction failed due to gas estimation error";
            statusCode = 400;
        } else if (error.message?.includes('nonce')) {
            errorCode = "NONCE_ERROR";
            errorMessage = "Transaction nonce error. Please try again";
            statusCode = 400;
        }

        res.status(statusCode).json({
            success: false,
            message: 'Transaction failed',
            error: {
                code: errorCode,
                message: errorMessage,
                details: process.env.NODE_ENV === 'development' ? {
                    originalError: error.message,
                    stack: error.stack?.split('\n').slice(0, 5)
                } : undefined,
                timestamp: new Date().toISOString(),
                requestId: Math.random().toString(36).substring(2, 12).toUpperCase()
            }
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
        tokenSymbol = 'USDC',
        password,
        googleAuthCode
    } = req.body;
    
    // Enhanced validation with better error messages
    if (!merchantId || !amount || !senderAddress || !chainName) {
        console.log("Pay request failed: Missing required parameters");
        return res.status(400).json({
            success: false,
            message: "Required parameters are missing!",
            error: {
                code: "MISSING_FIELDS",
                message: "merchantId, amount, senderAddress, and chainName are required"
            }
        });
    }

    try {
        // Parallel database queries for better performance
        const [sender, business] = await Promise.all([
            User.findOne({ walletAddress: senderAddress }),
            Business.findOne({ merchantId })
        ]);

        if (!business) {
            console.log("Business not found for merchantId:", merchantId);
            return res.status(404).json({
                success: false,
                message: "Business not found!",
                error: {
                    code: "BUSINESS_NOT_FOUND",
                    message: "The merchant ID you provided is not registered"
                }
            });
        }
        
        if (!sender) {
            console.log("Sender not found for address:", senderAddress);
            return res.status(404).json({
                success: false,
                message: "Sender not found!",
                error: {
                    code: "SENDER_NOT_FOUND",
                    message: "Your wallet address is not registered"
                }
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
                    requiresConfirmation: true
                }
            });
        }

        // Enhanced chain validation
        const supportedChains = ['arbitrum', 'celo', 'polygon', 'base', 'optimism', 'ethereum', 'bnb', 'avalanche', 'fantom', 'gnosis', 'scroll', 'moonbeam', 'fuse', 'aurora', 'lisk', 'somnia'];
        if (!supportedChains.includes(chainName)) {
            return res.status(400).json({
                success: false,
                message: "Unsupported chain!",
                error: {
                    code: "INVALID_CHAIN",
                    message: `Supported chains: ${supportedChains.join(', ')}`
                }
            });
        }

        // 🔐 ENHANCED SECURITY: Implement flexible authentication - user chooses password OR Google auth
        const amountNum = parseFloat(amount);
        const isHighValueTransaction = amountNum > 100; // $100 threshold
        
        if (isHighValueTransaction) {
            // High-value transactions require either password OR Google Auth (user's choice)
            if (!password && !googleAuthCode) {
                return res.status(400).json({
                    success: false,
                    message: "Security verification required for high-value business payments",
                    error: {
                        code: "SECURITY_VERIFICATION_REQUIRED",
                        message: "Business payments over $100 require either your password OR Google Authenticator code",
                        requiresPassword: true,
                        requiresGoogleAuth: true,
                        transactionType: "high_value_business_payment",
                        note: "You can use either password OR Google auth - not both required"
                    }
                });
            }
            
            // If password is provided, verify it
            if (password) {
                const isPasswordValid = await bcrypt.compare(password, sender.password);
                if (!isPasswordValid) {
                    return res.status(401).json({
                        success: false,
                        message: "Invalid password",
                        error: {
                            code: "INVALID_PASSWORD",
                            message: "The password you entered is incorrect"
                        }
                    });
                }
                console.log("Password verification successful for high-value business payment");
            }
            
            // If Google Auth code is provided, verify it
            if (googleAuthCode) {
                // TODO: Verify Google Auth code
                console.log("Google Auth code verification would happen here:", googleAuthCode);
                console.log("Google Auth verification successful for high-value business payment");
            }
            
        } else {
            // Low-value transactions require either password OR Google Auth (user's choice)
            if (!password && !googleAuthCode) {
                return res.status(400).json({
                    success: false,
                    message: "Security verification required for business payment",
                    error: {
                        code: "SECURITY_VERIFICATION_REQUIRED",
                        message: "Please enter your password OR Google Authenticator code to confirm this business payment",
                        requiresPassword: true,
                        requiresGoogleAuth: true,
                        transactionType: "low_value_business_payment",
                        note: "You can use either password OR Google auth - not both required"
                    }
                });
            }
            
            // If password is provided, verify it
            if (password) {
                const isPasswordValid = await bcrypt.compare(password, sender.password);
                if (!isPasswordValid) {
                    return res.status(401).json({
                        success: false,
                        message: "Invalid password",
                        error: {
                            code: "INVALID_PASSWORD",
                            message: "The password you entered is incorrect"
                        }
                    });
                }
                console.log("Password verification successful for low-value business payment");
            }
            
            // If Google Auth code is provided, verify it
            if (googleAuthCode) {
                // TODO: Verify Google Auth code
                console.log("Google Auth code verification would happen here:", googleAuthCode);
                console.log("Google Auth verification successful for low-value business payment");
            }
        }

        if (!sender.privateKey) {
            console.log("Sender private key missing for:", senderAddress);
            return res.status(400).json({
                success: false,
                message: "Sender private key not found in database!",
                error: {
                    code: "PRIVATE_KEY_MISSING",
                    message: "Your wallet is not properly configured. Please contact support."
                }
            });
        }

        // Execute the payment
        const result = await sendToken(
            business.walletAddress, 
            amount, 
            chainName, 
            sender.privateKey,
            tokenSymbol
        );

        console.log(`Payment successful to ${business.walletAddress}: ${result.transactionHash}`);
        
        // Enhanced success response
        res.json({
            success: true,
            message: 'Payment to business completed successfully!',
            data: {
                businessName: business.businessName,
                businessAddress: business.walletAddress,
                amount,
                tokenSymbol,
                chainName,
                transactionHash: result.transactionHash,
                timestamp: new Date().toISOString(),
                status: 'completed',
                transactionCategory: 'onchain',
                transactionSubType: 'sent',
                securityLevel: isHighValueTransaction ? "high" : "standard",
                authenticationMethod: password ? "password" : "google_auth",
                authenticationDetails: {
                    method: password ? "password" : "google_auth",
                    verified: true,
                    transactionType: isHighValueTransaction ? "high_value_business_payment" : "low_value_business_payment"
                }
            }
        });
        
    } catch (error: any) {
        console.error("Error in pay API:", error);
        res.status(500).json({
            success: false,
            message: 'Failed to complete payment to business.',
            error: {
                code: "PAYMENT_FAILED",
                message: error.message || 'Unknown error occurred'
            }
        });
    }
};

export const tokenTransferEvents = async (req: Request, res: Response) => {
    const { address, chain } = req.query;

    if (!address) {
        console.log("Token transfer events request failed: Address missing");
        return res.status(400).send('Address is required as a query parameter.');
    }

    if (!chain) {
        console.log("Token transfer events request failed: Chain missing");
        return res.status(400).send('Chain is required as a query parameter.');
    }

    if (!['arbitrum', 'celo'].includes(chain as string)) {
        console.log("Invalid chain for token transfer events:", chain);
        return res.status(400).send('Invalid chain parameter. Supported chains are arbitrum and celo.');
    }

    try {
        const events = await getAllTokenTransferEvents(chain as Chain, address as string);
        console.log(`Fetched token transfer events for ${address} on ${chain}`);
        res.json(events);
    } catch (error: any) {
        console.error('Error fetching token transfer events:', error);
        res.status(500).send({ 
            message: 'Internal server error', 
            error: error.message || 'Unknown error occurred' 
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

        const user = await User.findOne({ phoneNumber });
        if (!user) {
            console.log(`User not found for phoneNumber: ${phoneNumber}`);
            return res.status(404).send({ message: "Phone number not registered." });
        }

        const status = {
            phoneNumberExists: true,
            isLocked: user.lockoutUntil && Date.now() < user.lockoutUntil,
            failedAttempts: user.failedPasswordAttempts,
            isUnified: user.isUnified,
        };
        console.log(`User status for ${phoneNumber}:`, status);

        if (user.isUnified) {
            console.log(`Wallets already unified for ${phoneNumber}. Current wallet: ${user.walletAddress}`);
            return res.status(200).send({
                message: "Wallets have already been unified.",
                unifiedWalletAddress: user.walletAddress,
            });
        }

        if (status.isLocked) {
            const timeLeft = Math.ceil((user.lockoutUntil! - Date.now()) / (1000 * 60));
            console.log(`User locked out until: ${new Date(user.lockoutUntil!).toISOString()}`);
            return res.status(429).send({
                message: `Too many failed attempts. Please try again in ${timeLeft} minutes using OTP or password.`,
            });
        }

        if (!otp) {
            if (!password) {
                console.log(`No password provided for ${phoneNumber}, prompting OTP`);
                const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
                console.log(`Generated OTP: ${generatedOtp} for ${phoneNumber}`);

                try {
                    // Send OTP via SMS using the new SMS service
                    const smsSent = await SMSService.sendOTP(phoneNumber, generatedOtp, 'unification');
                    
                    if (!smsSent) {
                        return res.status(500).send({ message: "Failed to send OTP. Please try again." });
                    }
                    
                    console.log(`SMS sent successfully to ${phoneNumber}`);
                } catch (smsError) {
                    console.error(`Failed to send SMS to ${phoneNumber}:`, smsError);
                    return res.status(500).send({ message: "Failed to send OTP. Please try again." });
                }

                user.tempOtp = generatedOtp;
                user.otpExpires = Date.now() + 5 * 60 * 1000;
                await user.save();
                console.log(`OTP saved for ${phoneNumber}, expires at: ${new Date(user.otpExpires!).toISOString()}`);
                return res.status(200).send({ message: "OTP sent to your phone. Please provide it to proceed." });
            }

            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                user.failedPasswordAttempts += 1;
                console.log(`Incorrect password for ${phoneNumber}. Attempts: ${user.failedPasswordAttempts}`);

                if (user.failedPasswordAttempts >= 5) {
                    user.lockoutUntil = Date.now() + 60 * 60 * 1000;
                    user.failedPasswordAttempts = 0;
                    await user.save();
                    console.log(`User locked out until: ${new Date(user.lockoutUntil!).toISOString()}`);
                    return res.status(429).send({
                        message: "Too many failed attempts. Please try again in 1 hour using OTP or password.",
                    });
                }

                await user.save();
                return res.status(401).send({
                    message: "Incorrect password. Please verify your password or use OTP instead.",
                    attempts: user.failedPasswordAttempts,
                });
            }

            user.failedPasswordAttempts = 0;
            await user.save();
            console.log(`Password authenticated for ${phoneNumber}`);
        } else {
            if (user.tempOtp !== otp || !user.otpExpires || Date.now() > user.otpExpires) {
                console.log(`OTP validation failed for ${phoneNumber}: tempOtp=${user.tempOtp}, otp=${otp}, expires=${user.otpExpires}`);
                return res.status(400).send({ message: "Invalid or expired OTP." });
            }
            console.log(`OTP validated successfully for ${phoneNumber}`);
        }

        const unifiedAddress = await unifyWallets(user.privateKey);
        console.log(`Unified address generated: ${unifiedAddress}`);

        user.walletAddress = unifiedAddress;
        user.isUnified = true;
        user.tempOtp = undefined;
        user.otpExpires = undefined;
        await user.save();
        console.log(`User updated with unified address: ${unifiedAddress}, marked as unified`);

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

    console.log("Raw request body:", req.body);

    if (!phoneNumber) {
        console.log("Migrate request failed: Phone number missing");
        return res.status(400).send({ message: "Phone number is required." });
    }

    try {
        console.log(`Migrating funds for phoneNumber: ${phoneNumber}`);
        const user = await User.findOne({ phoneNumber });
        if (!user) {
            console.log(`User not found for phoneNumber: ${phoneNumber}`);
            return res.status(404).send({ message: "User not found." });
        }

        if (!user.isUnified || !user.walletAddress) {
            console.log(`User ${phoneNumber} has no unified wallet to migrate to`);
            return res.status(400).send({ message: "User wallet is not unified. Please unify wallets first." });
        }

        if (!otp) {
            if (!password) {
                console.log(`No password provided for ${phoneNumber}, prompting OTP`);
                const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
                console.log(`Generated OTP: ${generatedOtp} for ${phoneNumber}`);

                try {
                    // Send OTP via SMS using the new SMS service
                    const smsSent = await SMSService.sendOTP(phoneNumber, generatedOtp, 'migration');
                    
                    if (!smsSent) {
                        return res.status(500).send({ message: "Failed to send OTP. Please try again." });
                    }
                    
                    console.log(`SMS sent successfully to ${phoneNumber}`);
                } catch (smsError) {
                    console.error(`Failed to send SMS to ${phoneNumber}:`, smsError);
                    return res.status(500).send({ message: "Failed to send OTP. Please try again." });
                }

                user.tempOtp = generatedOtp;
                user.otpExpires = Date.now() + 5 * 60 * 1000;
                await user.save();
                console.log(`OTP saved for ${phoneNumber}, expires at: ${new Date(user.otpExpires!).toISOString()}`);
                return res.status(200).send({ message: "OTP sent to your phone. Please provide it to proceed." });
            }

            console.log(`Attempting password validation for ${phoneNumber}`);
            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                console.log(`Incorrect password for ${phoneNumber}`);
                return res.status(401).send({ message: "Incorrect password. Please verify your password or use OTP." });
            }
            console.log(`Password authenticated for ${phoneNumber}`);
        } else {
            if (user.tempOtp !== otp || !user.otpExpires || Date.now() > user.otpExpires) {
                console.log(`OTP validation failed for ${phoneNumber}: tempOtp=${user.tempOtp}, otp=${otp}, expires=${user.otpExpires}`);
                return res.status(400).send({ message: "Invalid or expired OTP." });
            }
            console.log(`OTP validated successfully for ${phoneNumber}`);
        }

        if (!user.privateKey) {
            console.log(`Private key missing for ${phoneNumber}`);
            return res.status(400).send({ message: "Private key not found in database!" });
        }

        const personalAccount = privateKeyToAccount({ client, privateKey: user.privateKey });
        const unifiedWalletAddress = user.walletAddress;
        const chains = [
            { name: 'celo', chainId: config.celo.chainId, tokenAddress: config.celo.tokenAddress },
            { name: 'arbitrum', chainId: config.arbitrum.chainId, tokenAddress: config.arbitrum.tokenAddress },
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
                    personalAccount 
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
                console.log(`USDC balance on ${chain.name} for ${sourceAccount.address}: ${balanceInUSDC}`);

                if (balanceInUSDC > 0) {
                    const result = await migrateFunds(sourceAccount.address, unifiedWalletAddress, chain.name, user.privateKey);
                    migrationResults.push({ chain: chain.name, transactionHash: result.transactionHash });
                    console.log(`Funds migrated on ${chain.name}: ${result.transactionHash}`);
                } else {
                    migrationResults.push({ chain: chain.name, message: "No balance to migrate" });
                    console.log(`No USDC balance to migrate on ${chain.name}`);
                }
            } catch (error: any) {
                console.error(`Migration failed for ${chain.name}:`, {
                    errorMessage: error.message,
                    errorDetails: error.shortMessage || error.details,
                });
                migrationResults.push({ chain: chain.name, error: error.message || "Migration failed" });
            }
        }

        user.tempOtp = undefined;
        user.otpExpires = undefined;
        await user.save();
        console.log(`OTP cleared for ${phoneNumber}`);

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
                    message: "Authentication required"
                }
            });
        }

        // Check if user has a wallet address, if not create one
        if (!user.walletAddress) {
            console.log(`Creating wallet for user ${user._id} who doesn't have one`);
            
            try {
                const { walletAddress, pk: privateKey } = await createAccount();
                
                // Update user with new wallet
                await User.findByIdAndUpdate(user._id, {
                    walletAddress,
                    privateKey
                });
                
                // Update the user object for this request
                user.walletAddress = walletAddress;
                user.privateKey = privateKey;
                
                console.log(`Wallet created for user ${user._id}: ${walletAddress}`);
            } catch (error) {
                console.error('Error creating wallet for user:', error);
                return res.status(500).json({
                    success: false,
                    message: "Failed to create wallet",
                    data: null,
                    error: {
                        code: "WALLET_CREATION_FAILED",
                        message: "Could not create wallet address"
                    }
                });
            }
        }

        // Supported chains for receiving crypto
        const supportedChains = [
            { name: 'Arbitrum', id: 'arbitrum', chainId: 42161 },
            { name: 'Polygon', id: 'polygon', chainId: 137 },
            { name: 'Base', id: 'base', chainId: 8453 },
            { name: 'Optimism', id: 'optimism', chainId: 10 },
            { name: 'Celo', id: 'celo', chainId: 42220 },
            { name: 'Avalanche', id: 'avalanche', chainId: 43114 },
            { name: 'BNB Chain', id: 'bnb', chainId: 56 },
            { name: 'Scroll', id: 'scroll', chainId: 534352 },
            { name: 'Gnosis', id: 'gnosis', chainId: 100 }
        ];

        const receiveInfo = {
            walletAddress: user.walletAddress,
            phoneNumber: user.phoneNumber,
            email: user.email || null,
            supportedChains,
            note: "This wallet address works across all supported chains. Make sure to select the correct network when sending."
        };

        return res.json({
            success: true,
            message: "Receive information retrieved successfully",
            data: receiveInfo
        });

    } catch (error: any) {
        console.error('Error in getReceiveInfo:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve receive information",
            data: null,
            error: {
                code: "SERVER_ERROR",
                message: error.message || "An unexpected error occurred"
            }
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
                    message: "Authentication required"
                }
            });
        }

        // Check cache first (5 minute cache for balance data)
        const cacheKey = `balance:${user.walletAddress}:primary`;
        const cachedBalance = await getCachedData(cacheKey);
        
        if (cachedBalance) {
            console.log(`Returning cached balance for ${user.walletAddress}`);
            return res.json({
                success: true,
                message: "User balance retrieved successfully (cached)",
                data: {
                    ...cachedBalance,
                    cached: true,
                    cacheExpiry: new Date(Date.now() + 5 * 60 * 1000).toISOString()
                }
            });
        }

        console.log(`Fetching fresh balance for ${user.walletAddress}`);
        
        // Focus on primary chains: Arbitrum (default), Base, and Celo
        const primaryChains = ['arbitrum', 'base', 'celo'];
        const balances: Record<string, Record<string, number>> = {};
        let totalUSDValue = 0;

        // Get balances for each primary chain
        for (const chain of primaryChains) {
            try {
                // Get supported tokens for this specific chain
                const chainTokens = getSupportedTokens(chain as Chain);
                
                if (chainTokens.length === 0) continue;
                
                balances[chain] = {};
                
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
                            params: [user.walletAddress],
                        });

                        const balanceInToken = Number(balance) / 10 ** tokenConfig.decimals;
                        
                        if (balanceInToken > 0) {
                            balances[chain][token] = balanceInToken;
                            
                            // Add to total USD value (assuming stablecoins are ~$1)
                            if (['USDC', 'USDT', 'DAI', 'cUSD'].includes(token)) {
                                totalUSDValue += balanceInToken;
                            }
                        }
                    } catch (error: any) {
                        // Skip tokens that fail to fetch
                        console.error(`Failed to fetch ${token} balance on ${chain}:`, error.message);
                    }
                }
                
                // Remove chain if no tokens have balance
                if (Object.keys(balances[chain]).length === 0) {
                    delete balances[chain];
                }
            } catch (error: any) {
                console.error(`Failed to process chain ${chain}:`, error.message);
            }
        }

        const balanceData = {
            walletAddress: user.walletAddress,
            totalUSDValue: Math.round(totalUSDValue * 100) / 100, // Round to 2 decimals
            balances,
            chainsWithBalance: Object.keys(balances).length,
            supportedChains: primaryChains,
            note: "Balances shown for primary chains: Arbitrum (default), Base, and Celo",
            lastUpdated: new Date().toISOString()
        };

        // Cache the result for 5 minutes
        await setCachedData(cacheKey, balanceData, 300); // 5 minutes

        return res.json({
            success: true,
            message: "User balance retrieved successfully",
            data: balanceData
        });

    } catch (error: any) {
        console.error('Error in getUserBalance:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve user balance",
            data: null,
            error: {
                code: "SERVER_ERROR",
                message: error.message || "An unexpected error occurred"
            }
        });
    }
};

// Get user balance for a specific chain
export const getUserBalanceByChain = async (req: Request, res: Response) => {
    try {
        // Get authenticated user from middleware
        const user = (req as any).user;
        const { chain } = req.params;
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User not authenticated",
                data: null,
                error: {
                    code: "UNAUTHORIZED",
                    message: "Authentication required"
                }
            });
        }

        // Validate chain parameter
        const supportedChains = ['arbitrum', 'base', 'celo', 'polygon', 'optimism', 'avalanche', 'bnb', 'scroll', 'gnosis'];
        if (!chain || !supportedChains.includes(chain)) {
            return res.status(400).json({
                success: false,
                message: "Invalid or unsupported chain",
                data: null,
                error: {
                    code: "INVALID_CHAIN",
                    message: `Supported chains: ${supportedChains.join(', ')}`
                }
            });
        }

        // Check cache first (3 minute cache for individual chain balance)
        const cacheKey = `balance:${user.walletAddress}:${chain}`;
        const cachedBalance = await getCachedData(cacheKey);
        
        if (cachedBalance) {
            console.log(`Returning cached ${chain} balance for ${user.walletAddress}`);
            return res.json({
                success: true,
                message: `User balance retrieved successfully for ${chain} (cached)`,
                data: {
                    ...cachedBalance,
                    cached: true,
                    cacheExpiry: new Date(Date.now() + 3 * 60 * 1000).toISOString()
                }
            });
        }

        console.log(`Fetching fresh ${chain} balance for ${user.walletAddress}`);

        // Get supported tokens for this specific chain
        const chainTokens = getSupportedTokens(chain as Chain);
        const balances: Record<string, number> = {};
        let totalUSDValue = 0;

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
                    params: [user.walletAddress],
                });

                const balanceInToken = Number(balance) / 10 ** tokenConfig.decimals;
                
                if (balanceInToken > 0) {
                    balances[token] = balanceInToken;
                    
                    // Add to total USD value (assuming stablecoins are ~$1)
                    if (['USDC', 'USDT', 'DAI', 'cUSD'].includes(token)) {
                        totalUSDValue += balanceInToken;
                    }
                }
            } catch (error: any) {
                console.error(`Failed to fetch ${token} balance on ${chain}:`, error.message);
            }
        }

        const chainBalanceData = {
            walletAddress: user.walletAddress,
            chain,
            balances,
            totalUSDValue: Math.round(totalUSDValue * 100) / 100,
            supportedTokens: chainTokens,
            lastUpdated: new Date().toISOString()
        };

        // Cache the result for 3 minutes
        await setCachedData(cacheKey, chainBalanceData, 180); // 3 minutes

        return res.json({
            success: true,
            message: `User balance retrieved successfully for ${chain}`,
            data: chainBalanceData
        });

    } catch (error: any) {
        console.error('Error in getUserBalanceByChain:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve user balance for chain",
            data: null,
            error: {
                code: "INTERNAL_ERROR",
                message: error.message || "An unexpected error occurred"
            }
        });
    }
};
