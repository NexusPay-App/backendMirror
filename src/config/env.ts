// import dotenv from "dotenv"
// import { defineChain } from "thirdweb"
// dotenv.config()

// let node_env = process.env.NODE_ENV || "development"

// let config: Record<string, any> = {
//     development: {
//         THIRDWEB_SECRET_KEY: process.env.THIRDWEB_SECRET_KEY as string,
//         AFRICAS_TALKING_API_KEY: process.env.AFRICAS_TALKING_API_KEY as string,
//         MONGO_URL: process.env.DEV_MONGO_URL as string,
//         MPESA_CONSUMER_KEY: process.env.MPESA_DEV_CONSUMER_KEY,
//         MPESA_CONSUMER_SECRET: process.env.MPESA_DEV_CONSUMER_SECRET,
//         MPESA_SHORTCODE: process.env.MPESA_DEV_SHORTCODE,
//         MPESA_B2C_SHORTCODE: process.env.MPESA_DEV_B2C_SHORTCODE,
//         MPESA_PASSKEY: process.env.MPESA_DEV_PASSKEY,
//         MPESA_BASEURL: `https://sandbox.safaricom.co.ke`,
//         MPESA_REQUEST_TIMEOUT: 5000,
//         MPESA_WEBHOOK_URL: "https://3506-41-90-178-59.ngrok-free.app",
//         celo: {
//             chainId: 42220,
//             tokenAddress: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e"
//         },
//         arbitrum: {
//             chainId: 42161,
//             tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
//         },
//         PLATFORM_WALLET_PRIVATE_KEY: process.env.DEV_PLATFORM_WALLET_PRIVATE_KEY,
//         PLATFORM_WALLET_ADDRESS: process.env.DEV_PLATFORM_WALLET_ADDRESS
//     },
//     production: {
//         THIRDWEB_SECRET_KEY: process.env.THIRDWEB_SECRET_KEY as string,
//         AFRICAS_TALKING_API_KEY: process.env.AFRICAS_TALKING_API_KEY as string,
//         MONGO_URL: process.env.PROD_MONGO_URL as string,
//         MPESA_CONSUMER_KEY: process.env.MPESA_PROD_CONSUMER_KEY,
//         MPESA_CONSUMER_SECRET: process.env.MPESA_PROD_CONSUMER_SECRET,
//         MPESA_SHORTCODE: process.env.MPESA_PROD_SHORTCODE,
//         MPESA_PASSKEY: process.env.MPESA_PROD_PASSKEY,
//         MPESA_STK_CALLBACK_URL: process.env.MPESA_PROD_STK_CALLBACK_URL,
//         MPESA_BASEURL: `https://api.safaricom.co.ke`,
//         MPESA_REQUEST_TIMEOUT: 5000,
//         MPESA_WEBHOOK_URL: "https://cbca-41-90-178-59.ngrok-free.app",
//         celo: {
//             chainId: 42220,
//             tokenAddress: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e"
//         },
//         arbitrum: {
//             chainId: 42161, //this
//             tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"
//             // ######### Look up ######
//         },
//         PLATFORM_WALLET_PRIVATE_KEY: process.env.PROD_PLATFORM_WALLET_PRIVATE_KEY
//     },
//     test: {
//         THIRDWEB_SECRET_KEY: process.env.THIRDWEB_SECRET_KEY as string,
//         AFRICAS_TALKING_API_KEY: process.env.AFRICAS_TALKING_API_KEY as string,
//         MONGO_URL: process.env.DEV_MONGO_URL as string,
//         MPESA_CONSUMER_KEY: process.env.MPESA_DEV_CONSUMER_KEY,
//         MPESA_CONSUMER_SECRET: process.env.MPESA_DEV_CONSUMER_SECRET,
//         MPESA_SHORTCODE: process.env.MPESA_DEV_SHORTCODE,
//         MPESA_PASSKEY: process.env.MPESA_DEV_PASSKEY,
//         MPESA_STK_CALLBACK_URL: process.env.MPESA_DEV_STK_CALLBACK_URL,
//         MPESA_BASEURL: `https://sandbox.safaricom.co.ke`,
//         MPESA_REQUEST_TIMEOUT: 5000,
//         MPESA_WEBHOOK_URL: "https://cbca-41-90-178-59.ngrok-free.app",
//         celo: {
//             chainId: 44787,
//             tokenAddress: "0x3572c9ce620f80032Ee3b101d75300186a0D7787"
//         },
//         arbitrum: {
//             chainId: 42161, //this
//             //tokenAddress: "0x4e2Bd3a78bd9F064B7551F078f0Dde4Edab86238",
//             tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
//         },
//         PLATFORM_WALLET_PRIVATE_KEY: process.env.DEV_PLATFORM_WALLET_PRIVATE_KEY
//     }
// }

// export default config[node_env]


// src/config/env.ts
import dotenv from "dotenv"
import { defineChain } from "thirdweb"
import path from 'path'

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Ensure required environment variables are defined
const requiredEnvVars = [
    'JWT_SECRET',
    'THIRDWEB_SECRET_KEY',
    'AFRICAS_TALKING_API_KEY',
    'MPESA_DEV_CONSUMER_KEY',
    'MPESA_DEV_CONSUMER_SECRET',
    'MPESA_DEV_SHORTCODE',
    'MPESA_DEV_B2C_SHORTCODE',
    'MPESA_DEV_PASSKEY',
    'MPESA_PROD_CONSUMER_KEY',
    'MPESA_PROD_CONSUMER_SECRET',
    'MPESA_PROD_SHORTCODE',
    'MPESA_PROD_PASSKEY',
    'DEV_PLATFORM_WALLET_PRIVATE_KEY',
    'DEV_PLATFORM_WALLET_ADDRESS'
];

// Check if we're in production mode to enforce production credentials
if (process.env.NODE_ENV === 'production') {
    const prodRequiredVars = [
        'MPESA_PROD_CONSUMER_KEY',
        'MPESA_PROD_CONSUMER_SECRET',
        'MPESA_PROD_SHORTCODE',
        'MPESA_PROD_PASSKEY',
    ];
    
    prodRequiredVars.forEach(varName => {
        if (!process.env[varName]) {
            console.error(`${varName} is not defined in environment variables but required for production`);
            process.exit(1);
        }
    });
}

requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
        console.error(`${varName} is not defined in environment variables`);
        process.exit(1);
    }
});

let node_env = process.env.NODE_ENV || "development"

let config: Record<string, any> = {
    development: {
        JWT_SECRET: process.env.JWT_SECRET,
        THIRDWEB_SECRET_KEY: process.env.THIRDWEB_SECRET_KEY,
        AFRICAS_TALKING_API_KEY: process.env.AFRICAS_TALKING_API_KEY,
        MONGO_URL: process.env.DEV_MONGO_URL,
        MPESA_CONSUMER_KEY: process.env.MPESA_DEV_CONSUMER_KEY,
        MPESA_CONSUMER_SECRET: process.env.MPESA_DEV_CONSUMER_SECRET,
        MPESA_SHORTCODE: process.env.MPESA_DEV_SHORTCODE,
        MPESA_B2C_SHORTCODE: process.env.MPESA_DEV_B2C_SHORTCODE,
        MPESA_PASSKEY: process.env.MPESA_DEV_PASSKEY,
        MPESA_BASEURL: 'https://api.safaricom.co.ke',
        MPESA_STK_QUERY_URL: 'https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query',
        MPESA_B2C_URL: process.env.MPESA_B2C_URL || 'https://api.safaricom.co.ke/mpesa/b2c/v1/paymentrequest',
        MPESA_REQUEST_TIMEOUT: 30000,
        // For production, use a stable webhook service like webhook.site or ngrok with fixed subdomain
        // To get a stable URL: ngrok http 8000 --subdomain=nexuspay-mpesa
        MPESA_WEBHOOK_URL: process.env.MPESA_WEBHOOK_URL || "https://nexuspay-mpesa.ngrok.io",
        MPESA_STK_CALLBACK_URL: (process.env.MPESA_WEBHOOK_URL ? `${process.env.MPESA_WEBHOOK_URL}/api/mpesa/stk-callback` : (process.env.MPESA_STK_CALLBACK_URL || "https://your-vercel-app.vercel.app/api/stk-callback")),
        MPESA_B2C_RESULT_URL: (process.env.MPESA_WEBHOOK_URL ? `${process.env.MPESA_WEBHOOK_URL}/api/mpesa/b2c-callback` : (process.env.MPESA_B2C_RESULT_URL || "https://your-vercel-app.vercel.app/api/b2c-callback")),
        MPESA_B2C_TIMEOUT_URL: (process.env.MPESA_WEBHOOK_URL ? `${process.env.MPESA_WEBHOOK_URL}/api/mpesa/queue-timeout` : (process.env.MPESA_B2C_TIMEOUT_URL || "https://your-vercel-app.vercel.app/api/queue-timeout")),
        MPESA_B2B_RESULT_URL: process.env.MPESA_B2B_RESULT_URL || "https://nexuspay-mpesa.ngrok.io/api/mpesa/b2b-callback",
        MPESA_B2B_TIMEOUT_URL: process.env.MPESA_B2B_TIMEOUT_URL || "https://nexuspay-mpesa.ngrok.io/api/mpesa/queue-timeout",
        MPESA_INITIATOR_NAME: process.env.MPESA_DEV_INITIATOR_NAME,
        MPESA_SECURITY_CREDENTIAL: process.env.MPESA_DEV_SECURITY_CREDENTIAL,
        // Chain Explorer API Keys
        OPTIMISM_API_KEY: process.env.OPTIMISM_API_KEY,
        POLYGON_API_KEY: process.env.POLYGON_API_KEY,
        BASE_API_KEY: process.env.BASE_API_KEY,
        AVALANCHE_API_KEY: process.env.AVALANCHE_API_KEY,
        BNB_API_KEY: process.env.BNB_API_KEY,
        SCROLL_API_KEY: process.env.SCROLL_API_KEY,
        GNOSIS_API_KEY: process.env.GNOSIS_API_KEY,
        FANTOM_API_KEY: process.env.FANTOM_API_KEY,
        MOONBEAM_API_KEY: process.env.MOONBEAM_API_KEY,
        FUSE_API_KEY: process.env.FUSE_API_KEY,
        AURORA_API_KEY: process.env.AURORA_API_KEY,
        SOMNIA_API_KEY: process.env.SOMNIA_API_KEY,
        // Chain Configurations
        celo: {
            chainId: 42220,
            tokenAddress: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e"
        },
        arbitrum: {
            chainId: 42161,
            tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        },
        optimism: {
            chainId: 10,
            tokenAddress: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85"
        },
        polygon: {
            chainId: 137,
            tokenAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"
        },
        base: {
            chainId: 8453,
            tokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
        },
        avalanche: {
            chainId: 43114,
            tokenAddress: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E"
        },
        bnb: {
            chainId: 56,
            tokenAddress: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"
        },
        scroll: {
            chainId: 534352,
            tokenAddress: "0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4"
        },
        gnosis: {
            chainId: 100,
            tokenAddress: "0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83"
        },
        fantom: {
            chainId: 250,
            tokenAddress: "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75"
        },
        somnia: {
            chainId: 2332,
            tokenAddress: "0x1C7312Cb60b40cF586e796FEdD60Cf243286c9E9"
        },
        moonbeam: {
            chainId: 1284,
            tokenAddress: "0x818ec0A7Fe18Ff94269904fCED6AE3DaE6d6dC0b"
        },
        fuse: {
            chainId: 122,
            tokenAddress: "0x620fd5fa44BE6af63715Ef4E65DDFA0387aD13F5"
        },
        aurora: {
            chainId: 1313161554,
            tokenAddress: "0xB12BFcA5A55806AaF64E99521918A4bf0fC40802"
        },
        lisk: {
            chainId: 201,
            tokenAddress: "0x4e05F8C19EaA61520a94850dC41EAc3c39927696"
        },
        PLATFORM_WALLET_PRIVATE_KEY: process.env.DEV_PLATFORM_WALLET_PRIVATE_KEY,
        PLATFORM_WALLET_ADDRESS: process.env.DEV_PLATFORM_WALLET_ADDRESS,
        SMART_WALLET_FACTORY_ADDRESS: process.env.SMART_WALLET_FACTORY_ADDRESS,
        // Blockchain Explorer API Keys (for transaction verification and data fetching)
        ARBITRUM_EXPLORER_API_KEY: process.env.ARBITRUM_API_KEY, // For Arbiscan.io API
        POLYGON_EXPLORER_API_KEY: process.env.POLYGON_API_KEY, // For Polygonscan.com API
        OPTIMISM_EXPLORER_API_KEY: process.env.OPTIMISM_API_KEY, // For Optimistic.etherscan.io API
        BASE_EXPLORER_API_KEY: process.env.BASE_API_KEY, // For Basescan.org API
        CELO_EXPLORER_API_KEY: process.env.CELO_API_KEY, // For Celoscan.io API
        FUSE_EXPLORER_API_KEY: process.env.FUSE_API_KEY, // For Explorer.fuse.io API
        // Email Configuration
        EMAIL_USER: process.env.EMAIL_USER,
        EMAIL_APP_PASSWORD: process.env.EMAIL_APP_PASSWORD,
        REDIS_URL: process.env.REDIS_URL,
        // Additional API Keys for secure operation
        COINMARKETCAP_API_KEY: process.env.COINMARKETCAP_API_KEY,
        ALCHEMY_API_KEY: process.env.ALCHEMY_API_KEY,
        // Google OAuth Configuration
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
        // ENS Configuration
        ENS_PARENT_DOMAIN: process.env.ENS_PARENT_DOMAIN || 'nexuspay.eth',
        ENS_REGISTRY_ADDRESS: process.env.ENS_REGISTRY_ADDRESS || '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
        ENS_NAME_WRAPPER_ADDRESS: process.env.ENS_NAME_WRAPPER_ADDRESS || '0x0635513f179D50A207757E05759CbD106d7dFcE8',
        ENS_RESOLVER_ADDRESS: process.env.ENS_RESOLVER_ADDRESS || '0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63',
        ENS_SUBDOMAIN_REGISTRAR_ADDRESS: process.env.ENS_SUBDOMAIN_REGISTRAR_ADDRESS,
        ETHEREUM_RPC_URL: process.env.ETHEREUM_RPC_URL,
    },
    production: {
        JWT_SECRET: process.env.JWT_SECRET,
        THIRDWEB_SECRET_KEY: process.env.THIRDWEB_SECRET_KEY,
        AFRICAS_TALKING_API_KEY: process.env.AFRICAS_TALKING_API_KEY,
        MONGO_URL: process.env.PROD_MONGO_URL,
        MPESA_CONSUMER_KEY: process.env.MPESA_PROD_CONSUMER_KEY,
        MPESA_CONSUMER_SECRET: process.env.MPESA_PROD_CONSUMER_SECRET,
        MPESA_SHORTCODE: process.env.MPESA_PROD_SHORTCODE,
        MPESA_B2C_SHORTCODE: process.env.MPESA_PROD_B2C_SHORTCODE,
        MPESA_PASSKEY: process.env.MPESA_PROD_PASSKEY,
        MPESA_BASEURL: 'https://api.safaricom.co.ke',
        MPESA_STK_QUERY_URL: 'https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query',
        MPESA_B2C_URL: process.env.MPESA_B2C_URL || 'https://api.safaricom.co.ke/mpesa/b2c/v1/paymentrequest',
        MPESA_REQUEST_TIMEOUT: 30000,
        // For local testing without callbacks, use localhost
        // For testing with real callbacks, use ngrok and ensure the tunnel is running
        // To start ngrok: ngrok http 8000
        MPESA_WEBHOOK_URL: process.env.MPESA_WEBHOOK_URL,
        MPESA_STK_CALLBACK_URL: (process.env.MPESA_WEBHOOK_URL ? `${process.env.MPESA_WEBHOOK_URL}/api/mpesa/stk-callback` : process.env.MPESA_DEV_STK_CALLBACK_URL),
        MPESA_B2C_RESULT_URL: (process.env.MPESA_WEBHOOK_URL ? `${process.env.MPESA_WEBHOOK_URL}/api/mpesa/b2c-callback` : process.env.MPESA_B2C_RESULT_URL),
        MPESA_B2C_TIMEOUT_URL: (process.env.MPESA_WEBHOOK_URL ? `${process.env.MPESA_WEBHOOK_URL}/api/mpesa/queue-timeout` : process.env.MPESA_B2C_TIMEOUT_URL),
        MPESA_B2B_RESULT_URL: process.env.MPESA_B2B_RESULT_URL,
        MPESA_B2B_TIMEOUT_URL: process.env.MPESA_B2B_TIMEOUT_URL,
        MPESA_INITIATOR_NAME: process.env.MPESA_PROD_INITIATOR_NAME,
        MPESA_SECURITY_CREDENTIAL: process.env.MPESA_PROD_SECURITY_CREDENTIAL,
        // Chain Explorer API Keys
        OPTIMISM_API_KEY: process.env.OPTIMISM_API_KEY,
        POLYGON_API_KEY: process.env.POLYGON_API_KEY,
        BASE_API_KEY: process.env.BASE_API_KEY,
        AVALANCHE_API_KEY: process.env.AVALANCHE_API_KEY,
        BNB_API_KEY: process.env.BNB_API_KEY,
        SCROLL_API_KEY: process.env.SCROLL_API_KEY,
        GNOSIS_API_KEY: process.env.GNOSIS_API_KEY,
        FANTOM_API_KEY: process.env.FANTOM_API_KEY,
        MOONBEAM_API_KEY: process.env.MOONBEAM_API_KEY,
        FUSE_API_KEY: process.env.FUSE_API_KEY,
        AURORA_API_KEY: process.env.AURORA_API_KEY,
        SOMNIA_API_KEY: process.env.SOMNIA_API_KEY,
        // Chain Configurations
        celo: {
            chainId: 42220,
            tokenAddress: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e"
        },
        arbitrum: {
            chainId: 42161,
            tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"
        },
        optimism: {
            chainId: 10,
            tokenAddress: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85"
        },
        polygon: {
            chainId: 137,
            tokenAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"
        },
        base: {
            chainId: 8453,
            tokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
        },
        avalanche: {
            chainId: 43114,
            tokenAddress: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E"
        },
        bnb: {
            chainId: 56,
            tokenAddress: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"
        },
        scroll: {
            chainId: 534352,
            tokenAddress: "0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4"
        },
        gnosis: {
            chainId: 100,
            tokenAddress: "0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83"
        },
        fantom: {
            chainId: 250,
            tokenAddress: "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75"
        },
        somnia: {
            chainId: 2332,
            tokenAddress: "0x1C7312Cb60b40cF586e796FEdD60Cf243286c9E9"
        },
        moonbeam: {
            chainId: 1284,
            tokenAddress: "0x818ec0A7Fe18Ff94269904fCED6AE3DaE6d6dC0b"
        },
        fuse: {
            chainId: 122,
            tokenAddress: "0x620fd5fa44BE6af63715Ef4E65DDFA0387aD13F5"
        },
        aurora: {
            chainId: 1313161554,
            tokenAddress: "0xB12BFcA5A55806AaF64E99521918A4bf0fC40802"
        },
        lisk: {
            chainId: 201,
            tokenAddress: "0x4e05F8C19EaA61520a94850dC41EAc3c39927696"
        },
        PLATFORM_WALLET_PRIVATE_KEY: process.env.PROD_PLATFORM_WALLET_PRIVATE_KEY,
        PLATFORM_WALLET_ADDRESS: process.env.PROD_PLATFORM_WALLET_ADDRESS,
        SMART_WALLET_FACTORY_ADDRESS: process.env.SMART_WALLET_FACTORY_ADDRESS,
        // Blockchain Explorer API Keys (for transaction verification and data fetching)
        ARBITRUM_EXPLORER_API_KEY: process.env.ARBITRUM_API_KEY, // For Arbiscan.io API
        POLYGON_EXPLORER_API_KEY: process.env.POLYGON_API_KEY, // For Polygonscan.com API
        OPTIMISM_EXPLORER_API_KEY: process.env.OPTIMISM_API_KEY, // For Optimistic.etherscan.io API
        BASE_EXPLORER_API_KEY: process.env.BASE_API_KEY, // For Basescan.org API
        CELO_EXPLORER_API_KEY: process.env.CELO_API_KEY, // For Celoscan.io API
        FUSE_EXPLORER_API_KEY: process.env.FUSE_API_KEY, // For Explorer.fuse.io API
        // Email Configuration
        EMAIL_USER: process.env.EMAIL_USER,
        EMAIL_APP_PASSWORD: process.env.EMAIL_APP_PASSWORD,
        REDIS_URL: process.env.REDIS_URL,
        // Additional API Keys for secure operation
        COINMARKETCAP_API_KEY: process.env.COINMARKETCAP_API_KEY,
        ALCHEMY_API_KEY: process.env.ALCHEMY_API_KEY,
        // Google OAuth Configuration
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
        // ENS Configuration
        ENS_PARENT_DOMAIN: process.env.ENS_PARENT_DOMAIN || 'nexuspay.eth',
        ENS_REGISTRY_ADDRESS: process.env.ENS_REGISTRY_ADDRESS || '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
        ENS_NAME_WRAPPER_ADDRESS: process.env.ENS_NAME_WRAPPER_ADDRESS || '0x0635513f179D50A207757E05759CbD106d7dFcE8',
        ENS_RESOLVER_ADDRESS: process.env.ENS_RESOLVER_ADDRESS || '0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63',
        ENS_SUBDOMAIN_REGISTRAR_ADDRESS: process.env.ENS_SUBDOMAIN_REGISTRAR_ADDRESS,
        ETHEREUM_RPC_URL: process.env.ETHEREUM_RPC_URL,
    },
    test: {
        JWT_SECRET: process.env.JWT_SECRET,
        THIRDWEB_SECRET_KEY: process.env.THIRDWEB_SECRET_KEY,
        AFRICAS_TALKING_API_KEY: process.env.AFRICAS_TALKING_API_KEY,
        MONGO_URL: process.env.DEV_MONGO_URL,
        MPESA_CONSUMER_KEY: process.env.MPESA_DEV_CONSUMER_KEY,
        MPESA_CONSUMER_SECRET: process.env.MPESA_DEV_CONSUMER_SECRET,
        MPESA_SHORTCODE: process.env.MPESA_DEV_SHORTCODE,
        MPESA_PASSKEY: process.env.MPESA_DEV_PASSKEY,
        MPESA_BASEURL: 'https://sandbox.safaricom.co.ke',
        MPESA_STK_QUERY_URL: 'https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query',
        MPESA_B2C_URL: process.env.MPESA_B2C_URL || 'https://sandbox.safaricom.co.ke/mpesa/b2c/v1/paymentrequest',
        MPESA_REQUEST_TIMEOUT: 30000,
        // For production, use a stable webhook service like webhook.site or ngrok with fixed subdomain
        // To get a stable URL: ngrok http 8000 --subdomain=nexuspay-mpesa
        MPESA_WEBHOOK_URL: process.env.MPESA_WEBHOOK_URL || "https://nexuspay-mpesa.ngrok.io",
        MPESA_STK_CALLBACK_URL: (process.env.MPESA_WEBHOOK_URL ? `${process.env.MPESA_WEBHOOK_URL}/api/mpesa/stk-callback` : (process.env.MPESA_STK_CALLBACK_URL || "https://nexuspay-mpesa.ngrok.io/api/mpesa/stk-callback")),
        MPESA_B2C_RESULT_URL: (process.env.MPESA_WEBHOOK_URL ? `${process.env.MPESA_WEBHOOK_URL}/api/mpesa/b2c-callback` : (process.env.MPESA_B2C_RESULT_URL || "https://nexuspay-mpesa.ngrok.io/api/mpesa/b2c-callback")),
        MPESA_B2C_TIMEOUT_URL: (process.env.MPESA_WEBHOOK_URL ? `${process.env.MPESA_WEBHOOK_URL}/api/mpesa/queue-timeout` : (process.env.MPESA_B2C_TIMEOUT_URL || "https://nexuspay-mpesa.ngrok.io/api/mpesa/queue-timeout")),
        celo: {
            chainId: 44787,
            tokenAddress: "0x3572c9ce620f80032Ee3b101d75300186a0D7787"
        },
        arbitrum: {
            chainId: 42161,
            tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        },
        optimism: {
            chainId: 10,
            tokenAddress: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85"
        },
        polygon: {
            chainId: 137,
            tokenAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"
        },
        base: {
            chainId: 8453,
            tokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
        },
        avalanche: {
            chainId: 43114,
            tokenAddress: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E"
        },
        bnb: {
            chainId: 56,
            tokenAddress: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"
        },
        scroll: {
            chainId: 534352,
            tokenAddress: "0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4"
        },
        gnosis: {
            chainId: 100,
            tokenAddress: "0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83"
        },
        fantom: {
            chainId: 250,
            tokenAddress: "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75"
        },
        somnia: {
            chainId: 2332,
            tokenAddress: "0x1C7312Cb60b40cF586e796FEdD60Cf243286c9E9"
        },
        moonbeam: {
            chainId: 1284,
            tokenAddress: "0x818ec0A7Fe18Ff94269904fCED6AE3DaE6d6dC0b"
        },
        fuse: {
            chainId: 122,
            tokenAddress: "0x620fd5fa44BE6af63715Ef4E65DDFA0387aD13F5"
        },
        aurora: {
            chainId: 1313161554,
            tokenAddress: "0xB12BFcA5A55806AaF64E99521918A4bf0fC40802"
        },
        lisk: {
            chainId: 201,
            tokenAddress: "0x4e05F8C19EaA61520a94850dC41EAc3c39927696"
        },
        PLATFORM_WALLET_PRIVATE_KEY: process.env.DEV_PLATFORM_WALLET_PRIVATE_KEY,
        PLATFORM_WALLET_ADDRESS: process.env.DEV_PLATFORM_WALLET_ADDRESS,
        SMART_WALLET_FACTORY_ADDRESS: process.env.SMART_WALLET_FACTORY_ADDRESS,
        // Blockchain Explorer API Keys (for transaction verification and data fetching)
        ARBITRUM_EXPLORER_API_KEY: process.env.ARBITRUM_API_KEY, // For Arbiscan.io API
        POLYGON_EXPLORER_API_KEY: process.env.POLYGON_API_KEY, // For Polygonscan.com API
        OPTIMISM_EXPLORER_API_KEY: process.env.OPTIMISM_API_KEY, // For Optimistic.etherscan.io API
        BASE_EXPLORER_API_KEY: process.env.BASE_API_KEY, // For Basescan.org API
        CELO_EXPLORER_API_KEY: process.env.CELO_API_KEY, // For Celoscan.io API
        FUSE_EXPLORER_API_KEY: process.env.FUSE_API_KEY, // For Explorer.fuse.io API
        // Email Configuration
        EMAIL_USER: process.env.EMAIL_USER,
        EMAIL_APP_PASSWORD: process.env.EMAIL_APP_PASSWORD,
        REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
        // Additional API Keys for secure operation
        COINMARKETCAP_API_KEY: process.env.COINMARKETCAP_API_KEY,
        ALCHEMY_API_KEY: process.env.ALCHEMY_API_KEY,
        // Google OAuth Configuration
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
        // ENS Configuration
        ENS_PARENT_DOMAIN: process.env.ENS_PARENT_DOMAIN || 'nexuspay.eth',
        ENS_REGISTRY_ADDRESS: process.env.ENS_REGISTRY_ADDRESS || '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
        ENS_NAME_WRAPPER_ADDRESS: process.env.ENS_NAME_WRAPPER_ADDRESS || '0x0635513f179D50A207757E05759CbD106d7dFcE8',
        ENS_RESOLVER_ADDRESS: process.env.ENS_RESOLVER_ADDRESS || '0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63',
        ENS_SUBDOMAIN_REGISTRAR_ADDRESS: process.env.ENS_SUBDOMAIN_REGISTRAR_ADDRESS,
        ETHEREUM_RPC_URL: process.env.ETHEREUM_RPC_URL,
    }
};

export default config[node_env];