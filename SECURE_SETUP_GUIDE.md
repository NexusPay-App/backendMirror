# 🔒 Secure NexusPay M-Pesa Setup Guide

## ⚡ Quick Fix for "Invalid SecurityCredential" Error

Your server is failing because M-Pesa B2C credentials are missing. Here's the secure fix:

### Step 1: Create Environment File

```bash
# Copy the template to create your environment file
cp env.example .env
```

### Step 2: Get Your M-Pesa Credentials

Visit [M-Pesa Daraja Portal](https://developer.safaricom.co.ke/) and get:

1. **Consumer Key** (from your app)
2. **Consumer Secret** (from your app)  
3. **Shortcode** (your business shortcode)
4. **Passkey** (from your app configuration)
5. **Security Credential** (generate using their tool):
   - Go to "Security Credential Generator"
   - Enter your initiator password
   - Copy the encrypted result

### Step 3: Fill Your .env File

Edit your `.env` file with your actual credentials:

```bash
# Open .env in your editor
nano .env

# Fill in these critical values:
MPESA_DEV_CONSUMER_KEY=your_actual_consumer_key
MPESA_DEV_CONSUMER_SECRET=your_actual_consumer_secret
MPESA_DEV_SHORTCODE=your_actual_shortcode
MPESA_DEV_PASSKEY=your_actual_passkey
MPESA_DEV_SECURITY_CREDENTIAL=your_actual_encrypted_credential

# Update webhook URL with your ngrok URL
MPESA_WEBHOOK_URL=https://your-actual-ngrok-url.ngrok-free.app
```

### Step 4: Start Server Securely

```bash
# Run the secure setup script
./quick-fix-mpesa.sh

# The script will:
# ✅ Validate your .env file exists
# ✅ Check all required variables are set
# ✅ Start the server with proper configuration
```

## 🛡️ Security Features

- **No credentials in code** - Everything loaded from `.env`
- **Environment validation** - Script checks for missing variables
- **Gitignore protection** - `.env` files never committed
- **Template-based setup** - No real credentials in examples

## 🚨 Critical Security Rules

1. **NEVER** commit `.env` files to git
2. **NEVER** share credentials in chat/email
3. **ALWAYS** use different credentials for production
4. **REGULARLY** rotate your credentials
5. **ALWAYS** use HTTPS for webhooks in production

## 🔧 Troubleshooting

### "No .env file found"
```bash
cp env.example .env
# Then edit .env with your credentials
```

### "Missing required environment variables"
- Check your `.env` file syntax
- Ensure no spaces around `=` signs
- Verify all required fields are filled

### "Invalid SecurityCredential" still appears
- Regenerate security credential from M-Pesa portal
- Ensure no extra spaces/newlines in credential
- Verify you're using the correct initiator password

### Environment not loading
```bash
# Test environment loading
export $(grep -v '^#' .env | xargs)
echo $MPESA_DEV_CONSUMER_KEY
```

## 📋 Required Variables Checklist

- [ ] `JWT_SECRET` - Secure random string (32+ chars)
- [ ] `MPESA_DEV_CONSUMER_KEY` - From M-Pesa portal
- [ ] `MPESA_DEV_CONSUMER_SECRET` - From M-Pesa portal
- [ ] `MPESA_DEV_SHORTCODE` - Your business shortcode
- [ ] `MPESA_DEV_PASSKEY` - From M-Pesa portal
- [ ] `MPESA_DEV_SECURITY_CREDENTIAL` - Generated encrypted credential
- [ ] `MPESA_WEBHOOK_URL` - Your ngrok URL

## 🎯 Next Steps After Fix

1. **Test crypto spending** - The security credential error should be gone
2. **Monitor server logs** - Check for successful B2C authentication
3. **Set up production** - Use production credentials when ready
4. **Enable monitoring** - Set up alerts for failed transactions

## 🆘 Need Help?

- **M-Pesa credentials**: Contact M-Pesa support
- **Security credential**: Use M-Pesa portal generator
- **Environment issues**: Check `.env` file syntax
- **Still stuck**: See detailed troubleshooting in `setup-mpesa-security.md`

---

**Remember**: Keep your credentials secure and never expose them in code or version control! 