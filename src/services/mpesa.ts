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
    if (cachedAccessToken.accessToken && cachedAccessToken.expiry > Date.now()) {
        return cachedAccessToken.accessToken;
    }

    const auth = 'Basic ' + Buffer.from(config.MPESA_CONSUMER_KEY + ':' + config.MPESA_CONSUMER_SECRET).toString('base64');
    const { data } = await axios.get(`${config.MPESA_BASEURL}/oauth/v1/generate?grant_type=client_credentials`, {
        headers: {
            Authorization: auth,
        },
    });

    if (data && data.access_token && data.expires_in) {
        cachedAccessToken = { 
            accessToken: data.access_token, 
            expiry: Date.now() + data.expires_in * 1000 
        };
        return data.access_token;
    }
    throw new Error("Invalid token response format");
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
    const { data } = await client.post("/mpesa/stkpushquery/v1/query", queryData);
    return data;
};

export const initiateB2C = async (amount: number, receiver: number, remarks: string = "Withdrawal from NexusPay") => {
    try {
        const client = await mpesaClient();
        const uuid = randomUUID();
        const shortcode = config.MPESA_B2C_SHORTCODE;

        const stkData = {
            "OriginatorConversationID": uuid,
            "InitiatorName": "testapi",
            "SecurityCredential": config.MPESA_SECURITY_CREDENTIAL,
            "CommandID": "BusinessPayment",
            "Amount": amount,
            "PartyA": shortcode,
            "PartyB": receiver,
            "Remarks": remarks,
            "QueueTimeOutURL": `${config.MPESA_WEBHOOK_URL}/api/mpesa/queue`,
            "ResultURL": `${config.MPESA_WEBHOOK_URL}/api/mpesa/b2c/result`,
            "Occasion": "Payment",
        };

        const { data } = await client.post("/mpesa/b2c/v3/paymentrequest", stkData);
        return data;
    } catch (error) {
        console.error("Error in B2C transaction:", error);
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
            CallBackURL: `${config.MPESA_WEBHOOK_URL}/api/mpesa/paybill/result`,
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
            CallBackURL: `${config.MPESA_WEBHOOK_URL}/api/mpesa/till/result`,
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
    try {
        const client = await mpesaClient();
        const timeStamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
        const password = Buffer.from(`${config.MPESA_SHORTCODE}${config.MPESA_PASSKEY}${timeStamp}`).toString('base64');

        // Format phone number
        const formattedPhone = senderPhoneNumber.replace(/\D/g, '');
        if (formattedPhone.startsWith('0')) {
            senderPhoneNumber = '254' + formattedPhone.substring(1);
        } else if (!formattedPhone.startsWith('254')) {
            senderPhoneNumber = '254' + formattedPhone;
        }

        const stkData = {
            BusinessShortCode: businessShortCode,
            Password: password,
            Timestamp: timeStamp,
            TransactionType: transactionType,
            Amount: amount,
            PartyA: senderPhoneNumber,
            PartyB: config.MPESA_SHORTCODE,
            PhoneNumber: senderPhoneNumber,
            CallBackURL: `${config.MPESA_WEBHOOK_URL}/api/mpesa/stk-push/result`,
            AccountReference: accountRef,
            TransactionDesc: transactionDesc
        };

        console.log("STK Push request data:", stkData);

        const { data } = await client.post("/mpesa/stkpush/v1/processrequest", stkData);
        console.log("STK Push response:", data);

        if (!data || data.ResponseCode != "0") {
            throw new Error(data?.errorMessage || "Could not initiate STK push");
        }

        // Wait for 10 seconds before querying
        await delay(10000);
        
        // Query the transaction status
        const queryData = await mpesaExpressQuery(
            client, 
            stkData.BusinessShortCode, 
            password, 
            timeStamp, 
            data.CheckoutRequestID
        );
        
        console.log("Query response:", queryData);
        return queryData;
    } catch (error: any) {
        console.error("Error in STK Push:", error);
        throw error;
    }
};