# URGENT: Fix M-Pesa Security Credential Error

## Problem
Your server is failing with error: **"Bad Request - Invalid SecurityCredential" (400.002.02)**

This happens because the `MPESA_SECURITY_CREDENTIAL` environment variable is missing.

## Quick Fix (Secure Method)

**Step 1: Stop your current server** (Ctrl+C)

**Step 2: Create environment file**
```bash
# Create .env file with your M-Pesa credentials
touch .env
```

**Step 3: Add your credentials to .env file**
```bash
# Add these lines to your .env file (replace with your actual values):

JWT_SECRET=your_secure_jwt_secret_here
THIRDWEB_SECRET_KEY=your_thirdweb_secret_key
AFRICAS_TALKING_API_KEY=your_africas_talking_api_key

# M-Pesa Credentials (from M-Pesa Daraja Portal)
MPESA_DEV_CONSUMER_KEY=your_consumer_key
MPESA_DEV_CONSUMER_SECRET=your_consumer_secret
MPESA_DEV_SHORTCODE=your_shortcode
MPESA_DEV_PASSKEY=your_passkey

# CRITICAL: Missing B2C credentials causing the error
MPESA_DEV_INITIATOR_NAME=testapi
MPESA_DEV_SECURITY_CREDENTIAL=your_encrypted_security_credential

# Webhook URLs (update with your ngrok URL)
MPESA_WEBHOOK_URL=https://your-ngrok-url.ngrok-free.app
MPESA_B2C_URL=https://api.safaricom.co.ke/mpesa/b2c/v1/paymentrequest
MPESA_B2C_RESULT_URL=https://your-ngrok-url.ngrok-free.app/api/mpesa/b2c-callback
MPESA_B2C_TIMEOUT_URL=https://your-ngrok-url.ngrok-free.app/api/mpesa/queue-timeout

# Database
DEV_MONGO_URL=your_mongodb_connection_string

# Platform Wallet
DEV_PLATFORM_WALLET_PRIVATE_KEY=your_platform_wallet_private_key
DEV_PLATFORM_WALLET_ADDRESS=your_platform_wallet_address
```

**Step 4: Run the secure setup script**
```bash
./quick-fix-mpesa.sh
```

## What This Fixes

- ✅ Securely loads your M-Pesa credentials from `.env` file
- ✅ Validates all required environment variables
- ✅ No credentials exposed in scripts or version control
- ✅ Fixes the "Invalid SecurityCredential" error
- ✅ Uses secure environment variable management

## Get Your M-Pesa Credentials

If you don't have your M-Pesa credentials:

1. **Visit**: [M-Pesa Daraja Portal](https://developer.safaricom.co.ke/)
2. **Login** to your developer account
3. **Get these values**:
   - Consumer Key
   - Consumer Secret
   - Shortcode
   - Passkey
4. **Generate Security Credential**:
   - Go to "Security Credential Generator"
   - Enter your initiator password
   - Copy the generated encrypted credential

## Security Notes

- ✅ **Never commit `.env` to git** - add it to `.gitignore`
- ✅ **Use actual credentials** from M-Pesa portal
- ✅ **Different credentials** for development vs production
- ✅ **Secure credential storage** in production

## Test After Fix

Once the server starts successfully:
1. The "Invalid SecurityCredential" error should be gone
2. Your crypto spending test should proceed to the next step
3. Check server logs for successful B2C credential validation

## Need Help?

- **Can't get security credential?** Contact M-Pesa support
- **Script fails validation?** Check your `.env` file syntax
- **Still getting errors?** See `setup-mpesa-security.md` for detailed troubleshooting

## Permanent Solution

For a permanent fix, see: `