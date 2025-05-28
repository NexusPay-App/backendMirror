#!/bin/bash

# Get the ngrok URL
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"[^"]*"' | grep -o 'https://[^"]*')

if [ -z "$NGROK_URL" ]; then
  echo "Error: Could not get ngrok URL. Make sure ngrok is running."
  exit 1
fi

echo "Using ngrok URL: $NGROK_URL"

# Update the .env file with the ngrok URL
sed -i.bak -E "s|MPESA_WEBHOOK_URL = \"[^\"]*\"|MPESA_WEBHOOK_URL = \"$NGROK_URL\"|g" .env
sed -i.bak -E "s|MPESA_STK_CALLBACK_URL=\"[^\"]*\"|MPESA_STK_CALLBACK_URL=\"$NGROK_URL/api/mpesa/stk-push/result\"|g" .env
sed -i.bak -E "s|MPESA_DEV_STK_CALLBACK_URL = \"[^\"]*\"|MPESA_DEV_STK_CALLBACK_URL = \"$NGROK_URL/api/mpesa/stk-push/result\"|g" .env
sed -i.bak -E "s|MPESA_B2C_RESULT_URL = \"[^\"]*\"|MPESA_B2C_RESULT_URL = \"$NGROK_URL/api/mpesa/b2c-callback\"|g" .env
sed -i.bak -E "s|MPESA_B2C_TIMEOUT_URL = \"[^\"]*\"|MPESA_B2C_TIMEOUT_URL = \"$NGROK_URL/api/mpesa/queue-timeout\"|g" .env

# If variables don't exist in the .env file, add them
if ! grep -q "MPESA_WEBHOOK_URL" .env; then
  echo "MPESA_WEBHOOK_URL=\"$NGROK_URL\"" >> .env
fi

if ! grep -q "MPESA_STK_CALLBACK_URL" .env; then
  echo "MPESA_STK_CALLBACK_URL=\"$NGROK_URL/api/mpesa/stk-push/result\"" >> .env
fi

if ! grep -q "MPESA_DEV_STK_CALLBACK_URL" .env; then
  echo "MPESA_DEV_STK_CALLBACK_URL=\"$NGROK_URL/api/mpesa/stk-push/result\"" >> .env
fi

if ! grep -q "MPESA_B2C_RESULT_URL" .env; then
  echo "MPESA_B2C_RESULT_URL=\"$NGROK_URL/api/mpesa/b2c-callback\"" >> .env
fi

if ! grep -q "MPESA_B2C_TIMEOUT_URL" .env; then
  echo "MPESA_B2C_TIMEOUT_URL=\"$NGROK_URL/api/mpesa/queue-timeout\"" >> .env
fi

# Remove backup file
rm -f .env.bak

echo "Updated .env file with ngrok URL: $NGROK_URL"
echo "Please restart your server for changes to take effect." 