#!/bin/bash

# Add the M-Pesa STK Query URL to the .env file if it doesn't exist
if ! grep -q "MPESA_STK_QUERY_URL" .env; then
  echo -e "\n# Add M-Pesa STK Query URLs" >> .env
  echo "MPESA_STK_QUERY_URL=\"https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query\"" >> .env
  echo "# Base URL for M-Pesa API" >> .env
  echo "MPESA_BASEURL=\"https://api.safaricom.co.ke\"" >> .env
  echo "Added M-Pesa STK Query URL to .env file"
else
  echo "M-Pesa STK Query URL already exists in .env file"
fi

# Update the M-Pesa config in src/config/env.ts if needed
if grep -q "MPESA_STK_QUERY_URL" src/config/env.ts; then
  echo "MPESA_STK_QUERY_URL already exists in src/config/env.ts"
else
  echo "You may need to add MPESA_STK_QUERY_URL to src/config/env.ts manually"
  echo "Add the following line in both development and production sections:"
  echo "MPESA_STK_QUERY_URL: 'https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query',"
fi

echo -e "\nPlease restart your server for changes to take effect." 