// import config from "../config/env";
// import axios, { AxiosInstance } from "axios";
// import { delay } from "./utils";
// import { randomUUID } from "crypto";

// let cachedAccessToken: { accessToken: string, expiry: number } = { accessToken: '', expiry: 0 }

// const getAccessToken = async () => {
//     // Check if the token is still valid
//     if (cachedAccessToken.accessToken && cachedAccessToken.expiry > Date.now()) {
//         return cachedAccessToken.accessToken;
//     }

//     const auth = 'Basic ' + Buffer.from(config.MPESA_CONSUMER_KEY + ':' + config.MPESA_CONSUMER_SECRET).toString('base64');
//     const { data } = await axios.get(`${config.MPESA_BASEURL}/oauth/v1/generate?grant_type=client_credentials`, {
//         headers: {
//             Authorization: auth,
//         },
//     });

//     if (data && data.access_token && data.expires_in) {
//         cachedAccessToken = { accessToken: data.access_token, expiry: Date.now() + data.expires_in * 1000 }

//         return data.access_token
//     } else {
//         throw new Error("Invalid token response format")
//     }
// }


// const mpesaClient = async (): Promise<AxiosInstance> => {
//     const accessToken = await getAccessToken()

//     if (!accessToken) throw new Error("Could not get access token")

//     return axios.create({
//         baseURL: config.MPESA_BASEURL,
//         timeout: config.MPESA_REQUEST_TIMEOUT,
//         headers: {
//             'Authorization': 'Bearer ' + accessToken,
//             'Content-Type': 'application/json'
//         }
//     })
// }

// const mpesaExpressQuery = async (client: AxiosInstance, businessShortCode: string, password: string, timestamp: string, checkoutRequestId: string) => {
//     const queryData = {
//         BusinessShortCode: businessShortCode,
//         Password: password,
//         Timestamp: timestamp,
//         CheckoutRequestID: checkoutRequestId,
//     }
//     const { data } = await client.post("/mpesa/stkpushquery/v1/query", queryData)
//     return data
// }
// export const initiateB2C = async (amount: number, receiver: number) => {
//     try {
//         const client = await mpesaClient()
//         const uuid = randomUUID()
//         const shortcode = config.MPESA_B2C_SHORTCODE
//         const stkData = {
//             "OriginatorConversationID": uuid,
//             "InitiatorName": "testapi",
//             "SecurityCredential": "luh8p8um43OKCjXKFHvv4R05ldWS6YCiVMIFdMAnKQx0d4UzUkDx/raXZFfGPXyUcDIlOygNyrPMEmk5KrE6lbWGGo6NItU6P1n06SqlAEWQgnrD2p632DMt1HNO25h12YUjmWjkemvPI92jg50XGPXzx9QgVYguNl7dTYXNt0sWgPNhAyPjcQQnP+D/cFZ6rlRg+VkHRBpsE9lIWV0xeWxFGvxv3N33ZwlTrAOShS4oKyDR5lAmWD68DSOpmJVagCQ+oL0iodvGogtOEhT8HJTpv2Us5Sft0ggRY4Pzc1o+YH8h47hj603913Ojz5p0HGF+nTzk2EqXQ77Qgt4HuA==",
//             "CommandID": "BusinessPayment",
//             "Amount": amount,
//             "PartyA": shortcode,
//             "PartyB": receiver,
//             "Remarks": "remarks",
//             "QueueTimeOutURL": config.MPESA_WEBHOOK_URL + "/api/mpesa/queue",
//             "ResultURL": config.MPESA_WEBHOOK_URL + "/api/mpesa/b2c/result",
//             "Occasion": "occasion",
//         }
//         const { data } = await client.post("/mpesa/b2c/v3/paymentrequest", stkData)
//         return data
//     } catch (error) {
//         console.log("error b2c: ", error)

//     }

// }

// export const initiateSTKPush = async (senderPhoneNumber: string, businessShortCode: string, amount: number, accountRef: string, user: string, transactionType = 'CustomerPayBillOnline', transactionDesc = 'Lipa na mpesa online') => {
//     try {
//         const client = await mpesaClient()

//         const timeStamp = (new Date()).toISOString().replace(/[^0-9]/g, '').slice(0, -3)
//         const password = Buffer.from(`${config.MPESA_SHORTCODE}${config.MPESA_PASSKEY}${timeStamp}`).toString('base64')

//         const stkData = {
//             BusinessShortCode: businessShortCode,
//             Password: password,
//             Timestamp: timeStamp,
//             TransactionType: transactionType,
//             Amount: amount,
//             PartyA: senderPhoneNumber,
//             PartyB: config.MPESA_SHORTCODE,
//             PhoneNumber: senderPhoneNumber,
//             CallBackURL: `${config.MPESA_WEBHOOK_URL}/api/mpesa/stk-push/result`,
//             AccountReference: accountRef,
//             TransactionDesc: transactionDesc
//         }
//         console.log("short code: ", stkData.BusinessShortCode)

//         const { data } = await client.post("/mpesa/stkpush/v1/processrequest", stkData)
//         console.log("data: ", data)

//         if (!data || data.ResponseCode != "0") {
//             throw new Error("Could not initiate stk push")
//         }

//         await delay(10000)
//         let queryData = await mpesaExpressQuery(client, stkData.BusinessShortCode, password, timeStamp, data.CheckoutRequestID)
//         console.log("query data: ", queryData)
//         return queryData
//     } catch (error: any) {
//         console.log("Error initiating stk push ", error)
//     }
// }


// src/services/mpesa.ts
import config from "../config/env";
import axios, { AxiosInstance } from "axios";
import { delay } from "./utils";
import { randomUUID } from "crypto";

let cachedAccessToken: { accessToken: string, expiry: number } = { accessToken: '', expiry: 0 };

const getAccessToken = async () => {
    try {
        // Only use cached token if it still has at least 5 minutes of validity
        if (cachedAccessToken.accessToken && cachedAccessToken.expiry > Date.now() + 300000) {
            console.log(`Using cached M-Pesa access token, valid until: ${new Date(cachedAccessToken.expiry).toISOString()}`);
            return cachedAccessToken.accessToken;
        }

        console.log(`Requesting new M-Pesa access token from: ${config.MPESA_BASEURL}`);
        
        // Create basic auth
        const auth = 'Basic ' + Buffer.from(config.MPESA_CONSUMER_KEY + ':' + config.MPESA_CONSUMER_SECRET).toString('base64');
        
        // Log partial credentials (safely) for debugging
        console.log(`Using consumer key: ${config.MPESA_CONSUMER_KEY ? '*****' + config.MPESA_CONSUMER_KEY.substr(-4) : 'undefined'}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        
        // Make the token request with extensive error handling
        try {
            const response = await axios.get(
                `${config.MPESA_BASEURL}/oauth/v1/generate?grant_type=client_credentials`,
                {
                    headers: {
                        'Authorization': auth,
                        'Cache-Control': 'no-cache'
                    },
                    timeout: 15000 // longer timeout for better reliability
                }
            );
            
            if (response.data && response.data.access_token && response.data.expires_in) {
                console.log('✅ Successfully obtained new M-Pesa access token');
                cachedAccessToken = { 
                    accessToken: response.data.access_token, 
                    expiry: Date.now() + (response.data.expires_in * 1000) - 300000 // 5 minute buffer
                };
                return cachedAccessToken.accessToken;
            } else {
                console.error('❌ Invalid M-Pesa token response format:', response.data);
                throw new Error("Invalid token response format");
            }
        } catch (requestError: any) {
            // Log detailed error information
            console.error('🚨 M-Pesa token request failed');
            if (requestError.response) {
                console.error(`Status: ${requestError.response.status}`);
                console.error(`Data:`, requestError.response.data);
            } else if (requestError.request) {
                console.error('No response received from M-Pesa API');
            } else {
                console.error(`Error: ${requestError.message}`);
            }
            
            // If the error is related to credentials
            if (requestError.response?.data?.errorCode === '404.001.03') {
                console.error('❌ CRITICAL: Invalid M-Pesa credentials');
                console.error('Please check that your MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET are correct');
            }
            
            throw requestError;
        }
    } catch (error: any) {
        console.error('Failed to get M-Pesa access token:', error.message);
        throw new Error(`M-Pesa authentication failed: ${error.message}`);
    }
};

const mpesaClient = async (): Promise<AxiosInstance> => {
    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error("Could not get access token");

    return axios.create({
        baseURL: config.MPESA_BASEURL,
        timeout: config.MPESA_REQUEST_TIMEOUT,
        headers: {
            'Authorization': 'Bearer ' + accessToken,
            'Content-Type': 'application/json'
        }
    });
};

const mpesaExpressQuery = async (
    client: AxiosInstance, 
    businessShortCode: string, 
    password: string, 
    timestamp: string, 
    checkoutRequestId: string
) => {
    const queryData = {
        BusinessShortCode: businessShortCode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
    };
    
    try {
        // Get a fresh token just to be safe
        const accessToken = await getAccessToken();
        
        // Use direct axios call with explicit headers
        const response = await axios({
            method: 'post',
            url: config.MPESA_STK_QUERY_URL,
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                'Content-Type': 'application/json'
            },
            data: queryData,
            timeout: config.MPESA_REQUEST_TIMEOUT
        });
        
        return response.data;
    } catch (error) {
        console.error('Error in STK query:', error);
        throw error;
    }
};

export const initiateB2C = async (amount: number, receiver: number, remarks: string = "Withdrawal from NexusPay") => {
    try {
        console.log(`🚀 [B2C] Initiating B2C payment: ${amount} KES to ${receiver}`);
        console.log(`- Environment: ${process.env.NODE_ENV}`);
        console.log(`- B2C URL: ${config.MPESA_B2C_URL}`);
        
        // Check if security credential is available
        if (!config.MPESA_SECURITY_CREDENTIAL) {
            console.error('❌ [B2C] MPESA_SECURITY_CREDENTIAL is not configured');
            console.error('❌ [B2C] This is required for B2C transactions');
            console.error('❌ [B2C] Please add MPESA_DEV_SECURITY_CREDENTIAL to your environment variables');
            throw new Error('Security credential not configured for B2C transactions');
        }
        
        // Check if initiator name is available
        if (!config.MPESA_INITIATOR_NAME) {
            console.error('❌ [B2C] MPESA_INITIATOR_NAME is not configured');
            console.error('❌ [B2C] Using default: testapi');
        }
        
        // Get fresh access token
        const accessToken = await getAccessToken();
        const uuid = randomUUID();
        
        // Use the same shortcode as STK Push (as per M-Pesa support guidance)
        const shortcode = config.MPESA_SHORTCODE;
        
        console.log(`- Using shortcode: ${shortcode}`);
        console.log(`- Receiver: ${receiver}`);
        console.log(`- Amount: ${amount}`);
        console.log(`- Security Credential available: ${config.MPESA_SECURITY_CREDENTIAL ? 'Yes' : 'No'}`);
        console.log(`- Initiator Name: ${config.MPESA_INITIATOR_NAME || 'testapi'}`);

        const b2cData = {
            "OriginatorConversationID": uuid,
            "InitiatorName": config.MPESA_INITIATOR_NAME || "testapi",
            "SecurityCredential": config.MPESA_SECURITY_CREDENTIAL,
            "CommandID": "BusinessPayment",
            "Amount": Math.floor(amount), // Ensure amount is an integer
            "PartyA": shortcode,
            "PartyB": receiver,
            "Remarks": remarks,
            "QueueTimeOutURL": config.MPESA_B2C_TIMEOUT_URL,
            "ResultURL": config.MPESA_B2C_RESULT_URL,
            "Occasion": "Payment",
        };

        console.log(`📤 B2C request payload:`, { 
            ...b2cData, 
            SecurityCredential: config.MPESA_SECURITY_CREDENTIAL ? 'PROVIDED' : 'MISSING',
            PartyB: receiver.toString().substring(0, 6) + '****' // Mask part of the phone number
        });

        // Use direct axios call to the correct B2C endpoint
        const response = await axios({
            method: 'post',
            url: config.MPESA_B2C_URL,
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                'Content-Type': 'application/json'
            },
            data: b2cData,
            timeout: config.MPESA_REQUEST_TIMEOUT
        });

        console.log(`✅ [B2C] Payment initiated successfully:`, response.data);
        return response.data;

    } catch (error: any) {
        console.error(`❌ Error in B2C transaction:`, error);
        
        if (error.response?.data) {
            console.error(`❌ B2C Error details:`, {
                message: error.message,
                response: error.response.data,
                status: error.response.status
            });
        }
        
        throw error;
    }
};

export const initiatePaybillPayment = async (
    phone: string,
    amount: number,
    paybillNumber: string,
    accountNumber: string,
    remarks: string = "Payment to Paybill"
) => {
    try {
        const client = await mpesaClient();
        const timeStamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
        const password = Buffer.from(`${paybillNumber}${config.MPESA_PASSKEY}${timeStamp}`).toString('base64');

        // Format phone number
        let formattedPhone = phone.replace(/\D/g, '');
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '254' + formattedPhone.substring(1);
        } else if (!formattedPhone.startsWith('254')) {
            formattedPhone = '254' + formattedPhone;
        }

        const stkData = {
            BusinessShortCode: paybillNumber,
            Password: password,
            Timestamp: timeStamp,
            TransactionType: "CustomerPayBillOnline",
            Amount: amount,
            PartyA: formattedPhone,
            PartyB: paybillNumber,
            PhoneNumber: formattedPhone,
            CallBackURL: `${config.MPESA_WEBHOOK_URL}/api/mpesa/callback`,
            AccountReference: accountNumber,
            TransactionDesc: remarks
        };

        const { data } = await client.post("/mpesa/stkpush/v1/processrequest", stkData);
        return data;
    } catch (error) {
        console.error("Error in Paybill payment:", error);
        throw error;
    }
};


export const initiateTillPayment = async (
    phone: string,
    amount: number,
    tillNumber: string,
    remarks: string = "Payment to Till"
) => {
    try {
        const client = await mpesaClient();
        const timeStamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
        const password = Buffer.from(`${tillNumber}${config.MPESA_PASSKEY}${timeStamp}`).toString('base64');

        // Format phone number
        let formattedPhone = phone.replace(/\D/g, '');
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '254' + formattedPhone.substring(1);
        } else if (!formattedPhone.startsWith('254')) {
            formattedPhone = '254' + formattedPhone;
        }

        const stkData = {
            BusinessShortCode: tillNumber,
            Password: password,
            Timestamp: timeStamp,
            TransactionType: "CustomerBuyGoodsOnline",
            Amount: amount,
            PartyA: formattedPhone,
            PartyB: tillNumber,
            PhoneNumber: formattedPhone,
            CallBackURL: `${config.MPESA_WEBHOOK_URL}/api/mpesa/callback`,
            AccountReference: "NEXUSPAY",
            TransactionDesc: remarks
        };

        const { data } = await client.post("/mpesa/stkpush/v1/processrequest", stkData);
        return data;
    } catch (error) {
        console.error("Error in Till payment:", error);
        throw error;
    }
};

export const initiateSTKPush = async (
    senderPhoneNumber: string, 
    businessShortCode: string, 
    amount: number, 
    accountRef: string, 
    user: string, 
    transactionType = 'CustomerPayBillOnline', 
    transactionDesc = 'Lipa na mpesa online'
) => {
    let attempts = 0;
    const maxAttempts = 3;
    let lastError: any = null;
    
    // Format phone number correctly - ensure no spaces or special characters
    let formattedPhone = senderPhoneNumber.replace(/\D/g, '');
    if (formattedPhone.startsWith('0')) {
        formattedPhone = '254' + formattedPhone.substring(1);
    } else if (!formattedPhone.startsWith('254')) {
        formattedPhone = '254' + formattedPhone;
    }
    
    console.log(`🔄 Initiating M-Pesa STK Push for ${formattedPhone} with amount ${amount}`);
    console.log(`- Environment: ${process.env.NODE_ENV}`);
    console.log(`- Base URL: ${config.MPESA_BASEURL}`);
    console.log(`- Business Short Code: ${businessShortCode}`);
    
    while (attempts < maxAttempts) {
        try {
            attempts++;
            
            // Generate timestamp and password for each attempt
            const timeStamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
            const password = Buffer.from(`${businessShortCode}${config.MPESA_PASSKEY}${timeStamp}`).toString('base64');
            
            // Request payload
            const stkData = {
                BusinessShortCode: businessShortCode,
                Password: password,
                Timestamp: timeStamp,
                TransactionType: transactionType,
                Amount: Math.floor(amount), // Ensure amount is an integer
                PartyA: formattedPhone,
                PartyB: businessShortCode,
                PhoneNumber: formattedPhone,
                CallBackURL: config.MPESA_STK_CALLBACK_URL,
                AccountReference: accountRef,
                TransactionDesc: transactionDesc
            };

            console.log(`📤 STK Push attempt ${attempts}/${maxAttempts}:`, { 
                phone: formattedPhone.substring(0, 6) + '****', // Mask part of the phone number
                amount,
                callback: config.MPESA_STK_CALLBACK_URL 
            });

            // Get fresh token for each attempt
            const freshToken = await getAccessToken();
            
            console.log(`🔑 Using token: ${freshToken ? (freshToken.substring(0, 10) + '...') : 'null'}`);
            
            // Use direct axios call for better control and debugging
            const response = await axios({
                method: 'post',
                url: `${config.MPESA_BASEURL}/mpesa/stkpush/v1/processrequest`,
                headers: {
                    'Authorization': 'Bearer ' + freshToken,
                    'Content-Type': 'application/json'
                },
                data: stkData,
                timeout: config.MPESA_REQUEST_TIMEOUT
            });

            const data = response.data;
            console.log("✅ STK Push response:", data);

            if (!data || data.ResponseCode !== "0") {
                console.error("❌ STK Push failed with response:", data);
                throw new Error(data?.errorMessage || "Could not initiate STK push");
            }

            // Wait before querying for better reliability
            const waitTime = 15000; // 15 seconds wait time
            console.log(`⏳ Waiting ${waitTime/1000} seconds before querying transaction status...`);
            await delay(waitTime);
            
            // Create client for query
            const client = await mpesaClient();
            
            // Query the transaction status
            let queryData;
            try {
                console.log(`🔍 Querying transaction status for CheckoutRequestID: ${data.CheckoutRequestID}`);
                queryData = await mpesaExpressQuery(
                    client, 
                    stkData.BusinessShortCode, 
                    password, 
                    timeStamp, 
                    data.CheckoutRequestID
                );
                console.log("📋 Query response:", queryData);
            } catch (queryError: any) {
                // If query fails but STK push succeeded, we can still return success
                // The callback will handle the completion
                console.warn("⚠️ STK query failed, but STK push succeeded. Proceeding with transaction:", queryError.message);
                console.log("This is normal in production where query may fail with 'The transaction is being processed'");
                
                // Return the STK push data without query data
                return { 
                    stkResponse: data, 
                    queryResponse: null,
                    checkoutRequestId: data.CheckoutRequestID,
                    isProcessing: true
                };
            }
            
            // Return all data for processing
            return { 
                stkResponse: data, 
                queryResponse: queryData,
                checkoutRequestId: data.CheckoutRequestID,
                isProcessing: false
            };
        } catch (error: any) {
            lastError = error;
            console.error(`❌ Error in STK Push attempt ${attempts}/${maxAttempts}:`, error.message);
            
            // Log detailed response information if available
            if (error.response) {
                console.error(`Status: ${error.response.status}`);
                console.error(`Error data:`, error.response.data);
                
                // Handle auth errors specifically
                if (error.response.status === 404 && 
                    error.response.data?.errorCode === '404.001.03') {
                    console.error('❌ Authentication error: Invalid access token');
                    // Force token refresh on next attempt
                    cachedAccessToken = { accessToken: '', expiry: 0 };
                }
            }
            
            if (attempts >= maxAttempts) {
                console.error("❌ All STK Push attempts failed");
                break;
            }
            
            // Wait between retries
            const retryWait = attempts * 3000; // 3 seconds * attempt number
            console.log(`⏳ Retrying in ${retryWait/1000} seconds...`);
            await delay(retryWait);
        }
    }
    
    // If we've exhausted all attempts, throw the last error
    throw lastError || new Error("Failed to initiate STK push after multiple attempts");
};