#!/bin/bash

echo "🔧 M-Pesa Environment Setup Script"
echo "=================================="

# Check if .env file exists
if [ -f ".env" ]; then
    echo "✅ Found existing .env file"
    echo "Loading environment variables from .env file..."
    export $(grep -v '^#' .env | xargs)
else
    echo "❌ No .env file found!"
    echo ""
    echo "Please create a .env file with your M-Pesa credentials."
    echo "Use the template below:"
    echo ""
    echo "# Copy this template to .env and fill in your actual values"
    echo "# ========================================================="
    echo "JWT_SECRET=your_jwt_secret_here"
    echo "THIRDWEB_SECRET_KEY=your_thirdweb_secret_key"
    echo "AFRICAS_TALKING_API_KEY=your_africas_talking_api_key"
    echo ""
    echo "# M-Pesa Credentials (get these from M-Pesa Daraja Portal)"
    echo "MPESA_DEV_CONSUMER_KEY=your_consumer_key"
    echo "MPESA_DEV_CONSUMER_SECRET=your_consumer_secret"
    echo "MPESA_DEV_SHORTCODE=your_shortcode"
    echo "MPESA_DEV_PASSKEY=your_passkey"
    echo ""
    echo "# Required for B2C (the missing credentials causing the error)"
    echo "MPESA_DEV_INITIATOR_NAME=testapi"
    echo "MPESA_DEV_SECURITY_CREDENTIAL=your_encrypted_security_credential"
    echo ""
    echo "# Webhook URLs (update with your ngrok URL)"
    echo "MPESA_WEBHOOK_URL=https://your-ngrok-url.ngrok-free.app"
    echo "MPESA_B2C_URL=https://api.safaricom.co.ke/mpesa/b2c/v1/paymentrequest"
    echo "MPESA_B2C_RESULT_URL=https://your-ngrok-url.ngrok-free.app/api/mpesa/b2c-callback"
    echo "MPESA_B2C_TIMEOUT_URL=https://your-ngrok-url.ngrok-free.app/api/mpesa/queue-timeout"
    echo ""
    echo "# Database"
    echo "DEV_MONGO_URL=your_mongodb_connection_string"
    echo ""
    echo "# Platform Wallet"
    echo "DEV_PLATFORM_WALLET_PRIVATE_KEY=your_platform_private_key"
    echo "DEV_PLATFORM_WALLET_ADDRESS=your_platform_wallet_address"
    echo ""
    echo "After creating .env file, run this script again."
    exit 1
fi

# Validate required environment variables
echo "🔍 Validating required environment variables..."

missing_vars=()

# Check critical M-Pesa variables
[ -z "$MPESA_DEV_CONSUMER_KEY" ] && missing_vars+=("MPESA_DEV_CONSUMER_KEY")
[ -z "$MPESA_DEV_CONSUMER_SECRET" ] && missing_vars+=("MPESA_DEV_CONSUMER_SECRET")
[ -z "$MPESA_DEV_SHORTCODE" ] && missing_vars+=("MPESA_DEV_SHORTCODE")
[ -z "$MPESA_DEV_PASSKEY" ] && missing_vars+=("MPESA_DEV_PASSKEY")
[ -z "$MPESA_DEV_SECURITY_CREDENTIAL" ] && missing_vars+=("MPESA_DEV_SECURITY_CREDENTIAL")
[ -z "$JWT_SECRET" ] && missing_vars+=("JWT_SECRET")

if [ ${#missing_vars[@]} -ne 0 ]; then
    echo "❌ Missing required environment variables:"
    printf ' - %s\n' "${missing_vars[@]}"
    echo ""
    echo "Please add these to your .env file and try again."
    exit 1
fi

echo "✅ All required environment variables are set!"
echo ""
echo "🚀 Starting NexusPay server..."
echo ""

# Start the server
npm run dev 