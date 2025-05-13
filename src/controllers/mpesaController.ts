// import { NextFunction, Request, Response, Router } from "express";
// import { User } from '../models/models';
// import { initiateB2C, initiateSTKPush } from "../services/mpesa";
// import config from "../config/env"
// import { getConversionRateWithCaching, sendToken } from "../services/token";

// const router = Router();

// export const mpesaDeposit = async (req: Request, res: Response, next: NextFunction) => {
//     try {
//         const { amount, phone, userId } = req.body
//         const user = req.user

//         console.log("phone: ", phone)

//         // initiate deposit
//         const queryData = await initiateSTKPush(phone, config.MPESA_SHORTCODE!, amount, "deposit", userId)
//         if (!queryData || queryData.ResultCode != "0") {
//             return res.status(400).json({ message: "MPESA transaction unsuccessful" })
//         }

//         let conversionRate = await getConversionRateWithCaching();
//         let convertedAmount = parseFloat(amount) / conversionRate
//         await sendToken(user.walletAddress, convertedAmount, "celo", config.PLATFORM_WALLET_PRIVATE_KEY)
//         return res.json({ message: "swap conducted successfully" })
//     } catch (error) {
//         next(error)
//     }
// }

// export const mpesaWithdraw = async (req: Request, res: Response, next: NextFunction) => {
//     try {
//         const user = await User.findOne({ phoneNumber: req.user.phoneNumber });
//         if (user == null) {
//             return res.status(400).json({ "message": "user null" })
//         }
//         const amount = req.body.amount
//         const receiver = 254708374149

//         let conversionRate = await getConversionRateWithCaching();
//         let convertedAmount = parseFloat(amount) / conversionRate

//         console.log("user: ", req.user)

//         await sendToken(config.PLATFORM_WALLET_ADDRESS, convertedAmount, "celo", user.privateKey)

//         const serviceAcceptedObj = await initiateB2C(amount, receiver)

//         res.json(serviceAcceptedObj)
//     } catch (error) {
//         next(error)
//     }
// }

// //This webhook is called when mpesastk push result is failed only
// export const mpesaSTKPushWebhook = (req: Request, res: Response) => {
//     console.log("-----------------Received MPESA Webhook--------------------")
//     // format and dump the request payload recieved from safaricom in the terminal
//     console.log(req.body);
//     console.log('-----------------------');
//     // const amount = req.body["stkCallback"]["CallbackMetadata"]["Item"][0]["Value"]
//     // console.log("amount paid: ", amount)

//     let message = {
//         "ResponseCode": "00000000",
//         "ResponseDesc": "success"
//     };

//     // respond to safaricom servers with a success message
//     res.json(message);
// }

// //This webhook is called when b2c request result is both successful and failed
// export const mpesaB2CWebhook = (req: Request, res: Response) => {
//     console.log("---------------Safaricom result----------------")
//     console.log(req.body)
//     console.log("-----------------------------------------")

//     const resultParameter: Array<any> = req.body.Result.ResultParameters.ResultParameter

//     console.log("result: ", resultParameter)

//     const amountSent = resultParameter[0].Value

//     console.log("amount sent: ", amountSent)

//     return res.json(req.body)
// }

// export const mpesaQueueWebhook = (req: Request, res: Response) => {
//     console.log("---------------Queue timeout-------------")
//     console.log(req.body)
//     console.log("-----------------------------------------")

//     let message = {
//         "Timeout": true
//     }
//     res.json(message)
// }

// export { router as DepositRouter }

// src/controllers/mpesaController.ts
// src/controllers/mpesaController.ts
// src/controllers/mpesaController.ts
// src/controllers/mpesaController.ts
import { NextFunction, Request, Response } from "express";
import { User } from '../models/models';
import { Business } from '../models/businessModel';
import { Escrow } from '../models/escrowModel';
import { initiateB2C, initiateSTKPush, initiatePaybillPayment, initiateTillPayment } from "../services/mpesa";
import config from "../config/env";
import { getConversionRateWithCaching, sendToken } from "../services/token";
import { randomUUID } from "crypto";
import { standardResponse, handleError } from "../services/utils";

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
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '254' + formattedPhone.substring(1);
        } else if (!formattedPhone.startsWith('254')) {
            formattedPhone = '254' + formattedPhone;
        }

        // Calculate crypto amount
        const conversionRate = await getConversionRateWithCaching();
        const cryptoAmount = amountNum / conversionRate;

        // Create escrow record
        const transactionId = randomUUID();
        const escrow = new Escrow({
            transactionId,
            userId: authenticatedUser._id,
            amount: amountNum,
            cryptoAmount: cryptoAmount.toFixed(6), // Fix precision
            type: 'fiat_to_crypto',
            status: 'pending'
        });
        await escrow.save();

        console.log(`✅ Created escrow record: ${transactionId}`);

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
            
            console.error("❌ MPESA API Error:", mpesaError);
            
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
        const cryptoAmount = parseFloat(amount);
        if (isNaN(cryptoAmount) || cryptoAmount <= 0) {
            return res.status(400).json(standardResponse(
                false,
                "Invalid amount",
                null,
                { code: "INVALID_AMOUNT", message: "Amount must be a positive number" }
            ));
        }

        // Format the phone number
        let formattedPhone = phone.replace(/\D/g, '');
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '254' + formattedPhone.substring(1);
        } else if (!formattedPhone.startsWith('254')) {
            formattedPhone = '254' + formattedPhone;
        }
        
        // Extract numeric part only
        const phoneNumber = parseInt(formattedPhone, 10);
        if (isNaN(phoneNumber)) {
            return res.status(400).json(standardResponse(
                false,
                "Invalid phone number",
                null,
                { code: "INVALID_PHONE", message: "Phone number must be a valid numeric value" }
            ));
        }

        // Verify user has sufficient balance (to be implemented)
        // TODO: Implement balance check

        // Calculate fiat amount
        const conversionRate = await getConversionRateWithCaching();
        const fiatAmount = Math.floor(cryptoAmount * conversionRate); // Floor to ensure we don't exceed the crypto amount

        // Create escrow record
        const transactionId = randomUUID();
        const escrow = new Escrow({
            transactionId,
            userId: authenticatedUser._id,
            amount: fiatAmount,
            cryptoAmount: cryptoAmount.toFixed(6), // Fix precision
            type: 'crypto_to_fiat',
            status: 'pending'
        });
        await escrow.save();

        console.log(`✅ Created withdrawal escrow record: ${transactionId}`);

        try {
            // First, transfer tokens from user to platform wallet
            // TODO: Implement token transfer from user to platform
            
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
        
        // If the transaction was successful (ResultCode === 0)
        if (resultCode === 0) {
            // Extract transaction details
            let amount = 0;
            let mpesaReceiptNumber = '';
            let transactionDate = '';
            let phoneNumber = '';
            
            const callbackMetadata = stkCallback.CallbackMetadata;
            if (callbackMetadata && callbackMetadata.Item) {
                callbackMetadata.Item.forEach((item: any) => {
                    if (item.Name === 'Amount') amount = item.Value;
                    if (item.Name === 'MpesaReceiptNumber') mpesaReceiptNumber = item.Value;
                    if (item.Name === 'TransactionDate') transactionDate = item.Value;
                    if (item.Name === 'PhoneNumber') phoneNumber = item.Value;
                });
            }
            
            console.log(`✅ Successful MPESA transaction: ${mpesaReceiptNumber} for ${amount}`);
            
            // Update escrow record
            escrow.status = 'completed';
            escrow.completedAt = new Date();
            await escrow.save();
            
            // Get the user
            const user = await User.findById(escrow.userId);
            if (!user) {
                console.error(`❌ User not found for escrow: ${escrow.transactionId}`);
                return;
            }
            
            // Transfer tokens to user's wallet
            try {
                // Ensure the platform has enough USDC to send
                const cryptoAmount = typeof escrow.cryptoAmount === 'string' 
                    ? parseFloat(escrow.cryptoAmount) 
                    : escrow.cryptoAmount;
                    
                const txResult = await sendToken(
                    user.walletAddress,
                    cryptoAmount,
                    "celo", // or arbitrum based on your configuration
                    config.PLATFORM_WALLET_PRIVATE_KEY
                );
                
                console.log(`✅ Token transfer complete: ${txResult?.transactionHash}`);
                
                // Update escrow with blockchain transaction hash
                escrow.cryptoTransactionHash = txResult?.transactionHash;
                await escrow.save();
                
                // TODO: Send notification to user about successful deposit
            } catch (tokenError) {
                console.error("❌ Failed to send tokens to user:", tokenError);
                // The escrow is still marked as completed since the MPESA transaction succeeded
                // A manual reconciliation would be needed
            }
        } else {
            // Transaction failed
            console.log(`❌ Failed MPESA transaction for ${checkoutRequestID}, ResultCode: ${resultCode}`);
            
            // Update escrow status
            escrow.status = 'failed';
            escrow.completedAt = new Date();
            await escrow.save();
            
            // TODO: Send notification to user about failed transaction
        }
    } catch (error) {
        console.error("❌ Error processing STK callback data:", error);
    }
}

export const mpesaB2CWebhook = async (req: Request, res: Response) => {
    try {
        const { Result } = req.body;
        const { ConversationID, ResultCode, ResultParameters } = Result;

        console.log("B2C webhook received:", req.body);

        const escrow = await Escrow.findOne({ mpesaTransactionId: ConversationID });
        if (!escrow) {
            return res.status(404).json({ message: "Transaction not found" });
        }

        if (ResultCode === 0) {
            escrow.status = 'completed';
            escrow.completedAt = new Date();
            await escrow.save();
        } else {
            escrow.status = 'failed';
            await escrow.save();
        }

        res.json(req.body);
    } catch (error) {
        console.error("B2C webhook error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

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
        
        // Prepare response based on transaction type and status
        const response = {
            transactionId: escrow.transactionId,
            type: escrow.type,
            status: escrow.status,
            amount: escrow.amount,
            cryptoAmount: typeof escrow.cryptoAmount === 'string' ? parseFloat(escrow.cryptoAmount) : escrow.cryptoAmount,
            createdAt: escrow.createdAt,
            completedAt: escrow.completedAt
        };
        
        // Add additional information based on transaction type
        if (escrow.cryptoTransactionHash) {
            Object.assign(response, { cryptoTransactionHash: escrow.cryptoTransactionHash });
        }
        
        if (escrow.mpesaTransactionId) {
            Object.assign(response, { mpesaTransactionId: escrow.mpesaTransactionId });
        }
        
        // If transaction is pending, add estimated completion time
        if (escrow.status === 'pending') {
            const estimatedCompletionTime = new Date(escrow.createdAt.getTime() + 5 * 60 * 1000); // 5 minutes from creation
            Object.assign(response, { estimatedCompletionTime });
        }
        
        return res.json(standardResponse(
            true,
            "Transaction details retrieved successfully",
            response
        ));
    } catch (error) {
        console.error("❌ Error getting transaction status:", error);
        return handleError(error, res, "Failed to retrieve transaction status");
    }
};