import { chains } from './chains';
import { tokenConfigs } from './tokens';
// src/config/env.ts
import dotenv from "dotenv"
import { defineChain } from "thirdweb"
import path from 'path'

// Load local environment variables during development only. Production secrets
// must come from the deployment environment and must never be read from uploads.
if (process.env.NODE_ENV !== 'production') {
    dotenv.config({ path: path.resolve(__dirname, '../../.env') });
}

export function validateEnvironment() {
    const required = ['JWT_SECRET', 'THIRDWEB_SECRET_KEY'];
    if (process.env.NODE_ENV === 'production') required.push('WALLET_KEY_ENCRYPTION_KEY');
    const prefix = process.env.NODE_ENV === 'production' ? 'PROD' : 'DEV';
    required.push(`${prefix}_MONGO_URL`);
    if (process.env.ENABLE_MPESA === 'true') {
        required.push('MPESA_CALLBACK_SHARED_TOKEN', 'MPESA_STK_CALLBACK_URL', 'MPESA_B2C_RESULT_URL', 'MPESA_B2C_TIMEOUT_URL', 'MPESA_B2B_RESULT_URL', 'MPESA_B2B_TIMEOUT_URL');
        required.push(...['CONSUMER_KEY', 'CONSUMER_SECRET', 'SHORTCODE', 'PASSKEY'].map(key => `MPESA_${prefix}_${key}`));
    }
    if (process.env.ENABLE_RECLAIM === 'true') required.push('RECLAIM_APP_ID', 'RECLAIM_APP_SECRET', 'RECLAIM_PROVIDER_IDS');
    if (process.env.ENABLE_SMS === 'true') required.push('AFRICAS_TALKING_API_KEY');
    const missing = required.filter(name => !process.env[name]);
    if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

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
        MPESA_BASEURL: 'https://sandbox.safaricom.co.ke',
        MPESA_STK_QUERY_URL: 'https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query',
        MPESA_B2C_URL: process.env.MPESA_B2C_URL || 'https://sandbox.safaricom.co.ke/mpesa/b2c/v1/paymentrequest',
        MPESA_REQUEST_TIMEOUT: 30000,
        // For production, use a stable webhook service like webhook.site or ngrok with fixed subdomain
        // To get a stable URL: ngrok http 8000 --subdomain=nexuspay-mpesa
        MPESA_WEBHOOK_URL: process.env.MPESA_WEBHOOK_URL,
        MPESA_STK_CALLBACK_URL: process.env.MPESA_STK_CALLBACK_URL,
        MPESA_B2C_RESULT_URL: process.env.MPESA_B2C_RESULT_URL,
        MPESA_B2C_TIMEOUT_URL: process.env.MPESA_B2C_TIMEOUT_URL,
        MPESA_B2B_RESULT_URL: process.env.MPESA_B2B_RESULT_URL,
        MPESA_B2B_TIMEOUT_URL: process.env.MPESA_B2B_TIMEOUT_URL,
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
            chainId: 5031,
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
            chainId: 1135,
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
        MPESA_STK_CALLBACK_URL: process.env.MPESA_STK_CALLBACK_URL,
        MPESA_B2C_RESULT_URL: process.env.MPESA_B2C_RESULT_URL,
        MPESA_B2C_TIMEOUT_URL: process.env.MPESA_B2C_TIMEOUT_URL,
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
            chainId: 5031,
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
            chainId: 1135,
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
        MPESA_WEBHOOK_URL: process.env.MPESA_WEBHOOK_URL,
        MPESA_STK_CALLBACK_URL: process.env.MPESA_STK_CALLBACK_URL,
        MPESA_B2C_RESULT_URL: process.env.MPESA_B2C_RESULT_URL,
        MPESA_B2C_TIMEOUT_URL: process.env.MPESA_B2C_TIMEOUT_URL,
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
            chainId: 5031,
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
            chainId: 1135,
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
    }
};

const selectedConfig = config[node_env];
if (!selectedConfig) throw new Error('Unsupported NODE_ENV');
for (const [name, chain] of Object.entries(chains)) {
  selectedConfig[name] = { chainId: chain.id, tokenAddress: tokenConfigs[name as keyof typeof tokenConfigs].USDC?.address };
}
export default selectedConfig;
