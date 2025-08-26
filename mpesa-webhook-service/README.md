# 🚀 NexusPay M-Pesa Webhook Service

A lightweight Vercel-based webhook service that forwards M-Pesa callbacks to your main backend.

## 🎯 **What This Service Does:**

- **Receives** M-Pesa webhooks (STK Push, B2C, Queue Timeout)
- **Forwards** them to your main backend
- **Provides** stable, production-ready webhook URLs
- **Handles** errors and retries gracefully

## 🏗️ **Architecture:**

```
M-Pesa → Vercel Webhook Service → Your Backend
```

## 📁 **File Structure:**

```
mpesa-webhook-service/
├── api/
│   ├── webhook.js          # Main webhook handler
│   ├── stk-callback.js     # STK Push callbacks
│   ├── b2c-callback.js     # B2C callbacks
│   └── queue-timeout.js    # Queue timeout callbacks
├── package.json
├── vercel.json
└── README.md
```

## 🚀 **Deployment Steps:**

### **Step 1: Install Dependencies**
```bash
cd mpesa-webhook-service
npm install
```

### **Step 2: Install Vercel CLI**
```bash
npm i -g vercel
```

### **Step 3: Login to Vercel**
```bash
vercel login
```

### **Step 4: Deploy to Vercel**
```bash
vercel --prod
```

### **Step 5: Set Environment Variables**
```bash
vercel env add BACKEND_URL
# Enter your backend URL: https://your-backend.com
```

## 🔧 **Configuration:**

### **Environment Variables:**
- `BACKEND_URL`: Your main backend URL (e.g., `https://your-backend.com`)

### **Webhook Endpoints:**
- **STK Callback**: `https://your-vercel-app.vercel.app/api/stk-callback`
- **B2C Callback**: `https://your-vercel-app.vercel.app/api/b2c-callback`
- **Queue Timeout**: `https://your-vercel-app.vercel.app/api/queue-timeout`

## 📝 **Update Your .env File:**

Replace ngrok URLs with Vercel URLs:

```bash
MPESA_WEBHOOK_URL=https://your-vercel-app.vercel.app
MPESA_DEV_STK_CALLBACK_URL=https://your-vercel-app.vercel.app/api/stk-callback
MPESA_B2C_RESULT_URL=https://your-vercel-app.vercel.app/api/b2c-callback
MPESA_B2C_TIMEOUT_URL=https://your-vercel-app.vercel.app/api/queue-timeout
```

## ✅ **Benefits:**

1. **🌐 Always Online**: 99.9% uptime guarantee
2. **🚀 Global CDN**: Fast response times worldwide
3. **🔒 Secure**: HTTPS by default
4. **📊 Monitoring**: Built-in analytics and logs
5. **🔄 Auto-scaling**: Handles traffic spikes automatically
6. **💰 Free Tier**: Generous free tier available

## 🧪 **Testing:**

### **Test STK Callback:**
```bash
curl -X POST https://your-vercel-app.vercel.app/api/stk-callback \
  -H "Content-Type: application/json" \
  -d '{"test": "stk-callback"}'
```

### **Test B2C Callback:**
```bash
curl -X POST https://your-vercel-app.vercel.app/api/b2c-callback \
  -H "Content-Type: application/json" \
  -d '{"test": "b2c-callback"}'
```

## 🔍 **Monitoring:**

- **Vercel Dashboard**: Real-time logs and performance
- **Function Logs**: Individual webhook execution logs
- **Analytics**: Request volume and response times

## 🚨 **Important Notes:**

1. **Backend Must Be Accessible**: Your main backend must be reachable from the internet
2. **Environment Variables**: Set `BACKEND_URL` in Vercel dashboard
3. **Timeout**: Webhooks have 25-second timeout
4. **Retries**: Failed webhooks are logged but not automatically retried

## 🆘 **Troubleshooting:**

### **Webhook Not Reaching Backend:**
- Check `BACKEND_URL` environment variable
- Verify backend is accessible from internet
- Check Vercel function logs

### **Timeout Errors:**
- Ensure backend responds within 25 seconds
- Check backend performance
- Consider optimizing backend response time

---

**🎉 Your M-Pesa webhooks will now work reliably in production!**
