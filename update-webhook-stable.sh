#!/bin/bash

# 🚀 M-Pesa Webhook URL Update Script
# This script updates your webhook URLs to use a stable ngrok subdomain

echo "🚀 Updating M-Pesa Webhook URLs to stable ngrok subdomain..."

# Default stable URL (you can change this)
STABLE_URL="https://nexuspay-mpesa.ngrok.io"

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Please create one first."
    exit 1
fi

# Backup .env file
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
echo "✅ Backed up .env file"

# Update webhook URLs
echo "📝 Updating webhook URLs to: $STABLE_URL"

# Update MPESA_WEBHOOK_URL
if grep -q "MPESA_WEBHOOK_URL" .env; then
    sed -i.bak "s|MPESA_WEBHOOK_URL=.*|MPESA_WEBHOOK_URL=$STABLE_URL|g" .env
    echo "✅ Updated MPESA_WEBHOOK_URL"
else
    echo "MPESA_WEBHOOK_URL=$STABLE_URL" >> .env
    echo "✅ Added MPESA_WEBHOOK_URL"
fi

# Update MPESA_DEV_STK_CALLBACK_URL
if grep -q "MPESA_DEV_STK_CALLBACK_URL" .env; then
    sed -i.bak "s|MPESA_DEV_STK_CALLBACK_URL=.*|MPESA_DEV_STK_CALLBACK_URL=$STABLE_URL/api/mpesa/stk-callback|g" .env
    echo "✅ Updated MPESA_DEV_STK_CALLBACK_URL"
else
    echo "MPESA_DEV_STK_CALLBACK_URL=$STABLE_URL/api/mpesa/stk-callback" >> .env
    echo "✅ Added MPESA_DEV_STK_CALLBACK_URL"
fi

# Update MPESA_B2C_RESULT_URL
if grep -q "MPESA_B2C_RESULT_URL" .env; then
    sed -i.bak "s|MPESA_B2C_RESULT_URL=.*|MPESA_B2C_RESULT_URL=$STABLE_URL/api/mpesa/b2c-callback|g" .env
    echo "✅ Updated MPESA_B2C_RESULT_URL"
else
    echo "MPESA_B2C_RESULT_URL=$STABLE_URL/api/mpesa/b2c-callback" >> .env
    echo "✅ Added MPESA_B2C_RESULT_URL"
fi

# Update MPESA_B2C_TIMEOUT_URL
if grep -q "MPESA_B2C_TIMEOUT_URL" .env; then
    sed -i.bak "s|MPESA_B2C_TIMEOUT_URL=.*|MPESA_B2C_TIMEOUT_URL=$STABLE_URL/api/mpesa/queue-timeout|g" .env
    echo "✅ Updated MPESA_B2C_TIMEOUT_URL"
else
    echo "MPESA_B2C_TIMEOUT_URL=$STABLE_URL/api/mpesa/queue-timeout" >> .env
    echo "✅ Added MPESA_B2C_TIMEOUT_URL"
fi

# Clean up backup files
rm -f .env.bak

echo ""
echo "🎉 Webhook URLs updated successfully!"
echo ""
echo "📋 Updated URLs:"
echo "   MPESA_WEBHOOK_URL: $STABLE_URL"
echo "   STK Callback: $STABLE_URL/api/mpesa/stk-callback"
echo "   B2C Result: $STABLE_URL/api/mpesa/b2c-callback"
echo "   B2C Timeout: $STABLE_URL/api/mpesa/queue-timeout"
echo ""
echo "🔧 Next steps:"
echo "   1. Start ngrok with: ngrok http 8000 --subdomain=nexuspay-mpesa"
echo "   2. Restart your backend server"
echo "   3. Test the webhook endpoints"
echo ""
echo "⚠️  Note: Make sure ngrok is running with the subdomain 'nexuspay-mpesa'"
echo "   If you want a different subdomain, edit this script and run it again."
