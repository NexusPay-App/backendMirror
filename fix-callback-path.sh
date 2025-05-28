#!/bin/bash

# Get the ngrok URL
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"[^"]*"' | grep -o 'https://[^"]*')

if [ -z "$NGROK_URL" ]; then
  echo "Error: Could not get ngrok URL. Make sure ngrok is running."
  exit 1
fi

echo "Using ngrok URL: $NGROK_URL"

# Update the .env file with the correct callback path
sed -i.bak -E "s|MPESA_STK_CALLBACK_URL=\"[^\"]*\"|MPESA_STK_CALLBACK_URL=\"$NGROK_URL/api/mpesa/stk-callback\"|g" .env

# Remove backup file
rm -f .env.bak

echo "Updated MPESA_STK_CALLBACK_URL in .env file to match the path defined in routes: $NGROK_URL/api/mpesa/stk-callback"
echo "Please restart your server for changes to take effect." 