#!/bin/bash

# Update the M-Pesa STK callback URL specifically
sed -i.bak -E "s|MPESA_STK_CALLBACK_URL = \"[^\"]*\"|MPESA_STK_CALLBACK_URL = \"http://localhost:8000/api/mpesa/stk-push/result\"|g" .env

# If the variable doesn't exist in the .env file, add it
if ! grep -q "MPESA_STK_CALLBACK_URL" .env; then
  echo "MPESA_STK_CALLBACK_URL=\"http://localhost:8000/api/mpesa/stk-push/result\"" >> .env
fi

# Remove backup file
rm -f .env.bak

echo "Updated MPESA_STK_CALLBACK_URL in .env file to match the path expected in code"
echo "This should fix the 'Invalid CallBackURL' error"
echo "Please restart your server for changes to take effect." 