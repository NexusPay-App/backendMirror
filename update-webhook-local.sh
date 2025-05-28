#!/bin/bash

# Update .env file with localhost URLs
sed -i.bak -E "s|MPESA_WEBHOOK_URL = \"https://[^\"]*\"|MPESA_WEBHOOK_URL = \"http://localhost:8000\"|g" .env
sed -i.bak -E "s|MPESA_DEV_STK_CALLBACK_URL = \"https://[^\"]*\"|MPESA_DEV_STK_CALLBACK_URL = \"http://localhost:8000/api/mpesa/stk-callback\"|g" .env
sed -i.bak -E "s|MPESA_B2C_RESULT_URL = \"https://[^\"]*\"|MPESA_B2C_RESULT_URL = \"http://localhost:8000/api/mpesa/b2c-callback\"|g" .env
sed -i.bak -E "s|MPESA_B2C_TIMEOUT_URL = \"https://[^\"]*\"|MPESA_B2C_TIMEOUT_URL = \"http://localhost:8000/api/mpesa/queue-timeout\"|g" .env

# Also add MPESA_BASEURL and MPESA_STK_QUERY_URL if they don't exist
if ! grep -q "MPESA_BASEURL=" .env; then
  echo "MPESA_BASEURL=\"https://api.safaricom.co.ke\"" >> .env
fi

if ! grep -q "MPESA_STK_QUERY_URL=" .env; then
  echo "MPESA_STK_QUERY_URL=\"https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query\"" >> .env
fi

# Remove backup file
rm .env.bak

echo "Updated .env file with localhost webhook URLs"
echo "Please restart your server for changes to take effect." 