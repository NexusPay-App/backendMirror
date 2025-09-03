# 🚀 M-Pesa Webhook Setup Guide

## 🎯 **Problem Solved:**
- ❌ **Before:** Constantly changing ngrok URLs causing webhook failures
- ✅ **After:** Stable webhook URLs that work consistently

## 🛠️ **Solution 1: Ngrok with Fixed Subdomain (Recommended)**

### **Step 1: Install Ngrok Pro (Free tier available)**
```bash
# Download ngrok
curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list
sudo apt update && sudo apt install ngrok

# Or use Homebrew on Mac
brew install ngrok
```

### **Step 2: Authenticate with Ngrok**
```bash
ngrok config add-authtoken YOUR_AUTH_TOKEN
```

### **Step 3: Start Ngrok with Fixed Subdomain**
```bash
ngrok http 8000 --subdomain=nexuspay-mpesa
```

### **Step 4: Update Environment Variables**
```bash
# Add to your .env file
MPESA_WEBHOOK_URL=https://nexuspay-mpesa.ngrok.io
MPESA_DEV_STK_CALLBACK_URL=https://nexuspay-mpesa.ngrok.io/api/mpesa/stk-callback
MPESA_B2C_RESULT_URL=https://nexuspay-mpesa.ngrok.io/api/mpesa/b2c-callback
MPESA_B2C_TIMEOUT_URL=https://nexuspay-mpesa.ngrok.io/api/mpesa/queue-timeout
```

## 🌐 **Solution 2: Webhook.site (Alternative)**

### **Step 1: Get Webhook URL**
1. Go to [webhook.site](https://webhook.site)
2. Copy your unique webhook URL
3. Use it in your M-Pesa configuration

### **Step 2: Update Environment Variables**
```bash
MPESA_WEBHOOK_URL=https://webhook.site/YOUR_UNIQUE_ID
MPESA_DEV_STK_CALLBACK_URL=https://webhook.site/YOUR_UNIQUE_ID/api/mpesa/stk-callback
MPESA_B2C_RESULT_URL=https://webhook.site/YOUR_UNIQUE_ID/api/mpesa/b2c-callback
MPESA_B2C_TIMEOUT_URL=https://webhook.site/YOUR_UNIQUE_ID/api/mpesa/queue-timeout
```

## 🏗️ **Solution 3: Deploy to Cloud (Production)**

### **Option A: Vercel (Recommended)**
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy your backend
vercel --prod

# Get your production URL
# Update environment variables with production URL
```

### **Option B: Railway**
```bash
# Install Railway CLI
npm i -g @railway/cli

# Deploy your backend
railway up

# Get your production URL
# Update environment variables with production URL
```

## 🔧 **Quick Fix Script**

Run this script to update your webhook URLs:

```bash
# For ngrok with fixed subdomain
./update-webhook-stable.sh

# For webhook.site
./update-webhook-webhooksite.sh
```

## 📋 **Environment Variables to Update**

```bash
# Core webhook URL
MPESA_WEBHOOK_URL=https://your-stable-url.com

# STK Push callback
MPESA_DEV_STK_CALLBACK_URL=https://your-stable-url.com/api/mpesa/stk-callback

# B2C result callback
MPESA_B2C_RESULT_URL=https://your-stable-url.com/api/mpesa/b2c-callback

# B2C timeout callback
MPESA_B2C_TIMEOUT_URL=https://your-stable-url.com/api/mpesa/queue-timeout
```

## ✅ **Verification Steps**

1. **Test Webhook Endpoint:**
   ```bash
   curl -X POST https://your-stable-url.com/api/mpesa/stk-callback \
     -H "Content-Type: application/json" \
     -d '{"test": "webhook"}'
   ```

2. **Check M-Pesa Integration:**
   - Make a test transaction
   - Verify webhook is received
   - Confirm USDC is transferred

3. **Monitor Logs:**
   - Check backend console for webhook logs
   - Verify transaction status updates

## 🚨 **Troubleshooting**

### **Webhook Not Received:**
- Check if ngrok tunnel is running
- Verify webhook URLs in M-Pesa configuration
- Check firewall/network settings

### **Transaction Stuck:**
- Verify platform wallet has sufficient balance
- Check webhook endpoint is accessible
- Review transaction logs

### **USDC Not Transferred:**
- Confirm webhook was received
- Check escrow record status
- Verify platform wallet balance

## 📞 **Support**

If you continue having issues:
1. Check the backend logs
2. Verify webhook URLs are accessible
3. Test with a small amount first
4. Contact support with transaction ID

---

**Remember:** Always test with small amounts first to ensure the system is working correctly!
