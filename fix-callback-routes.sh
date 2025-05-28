#!/bin/bash

# Fix the route inconsistency
echo "Fixing M-Pesa callback URL route inconsistency..."

# Update the MPESA_STK_CALLBACK_URL to point to /api/mpesa/stk-callback
sed -i.bak -E "s|MPESA_STK_CALLBACK_URL=\"[^\"]*\"|MPESA_STK_CALLBACK_URL=\"https://2797-105-163-158-157.ngrok-free.app/api/mpesa/stk-callback\"|g" .env

# Update MPESA_DEV_STK_CALLBACK_URL to match the route
sed -i.bak -E "s|MPESA_DEV_STK_CALLBACK_URL = \"[^\"]*\"|MPESA_DEV_STK_CALLBACK_URL = \"https://2797-105-163-158-157.ngrok-free.app/api/mpesa/stk-callback\"|g" .env

# Remove backup files
rm -f .env.bak

# Print status
echo "✅ Updated callback URLs in .env file"
echo "Restart the server for changes to take effect" 