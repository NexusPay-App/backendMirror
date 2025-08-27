# 🚀 NexusPay Crypto API Endpoints - Frontend Integration

## Base URL
```
http://localhost:8000/api
```

## 🔐 Authentication
All endpoints require JWT token in header:
```
Authorization: Bearer YOUR_JWT_TOKEN
```

---

## 💰 Send Crypto

### `POST /token/sendToken`

**Purpose:** Send crypto to any user by email, phone, or wallet address

**Request:**
```json
{
  "recipientIdentifier": "user@example.com",
  "amount": 50.00,
  "senderAddress": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
  "chain": "arbitrum",
  "tokenSymbol": "USDC",
  "password": "userPassword"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Token sent successfully!",
  "data": {
    "transactionCode": "ABC123DEF4",
    "amount": "50.00 USDC",
    "recipient": "user@example.com",
    "transactionHash": "0x...",
    "authenticationMethod": "password"
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Security verification required for transaction",
  "error": {
    "code": "SECURITY_VERIFICATION_REQUIRED",
    "message": "Please enter your password OR Google Authenticator code"
  }
}
```

---

## 🏪 Pay Business

### `POST /token/pay`

**Purpose:** Pay registered businesses with crypto

**Request:**
```json
{
  "senderAddress": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
  "merchantId": "MERCH123",
  "amount": 100.00,
  "confirm": true,
  "chainName": "polygon",
  "tokenSymbol": "USDT",
  "googleAuthCode": "123456"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Payment to business completed successfully!",
  "data": {
    "businessName": "Example Store",
    "transactionHash": "0x...",
    "authenticationMethod": "google_auth"
  }
}
```

---

## 📥 Get Receive Info

### `GET /token/receive`

**Purpose:** Get user's receive information

**Response:**
```json
{
  "success": true,
  "data": {
    "walletAddress": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
    "phoneNumber": "+254712345678",
    "email": "user@example.com",
    "supportedChains": [
      { "name": "Arbitrum", "id": "arbitrum", "chainId": 42161 },
      { "name": "Polygon", "id": "polygon", "chainId": 137 }
    ]
  }
}
```

---

## 💳 Get Balance

### `GET /token/balance`

**Purpose:** Get user's wallet balance across all chains

**Response:**
```json
{
  "success": true,
  "data": {
    "walletAddress": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
    "totalUSDValue": 1250.75,
    "balances": {
      "arbitrum": { "USDC": 500.25, "USDT": 250.50 },
      "polygon": { "USDC": 300.00, "MATIC": 100.00 }
    }
  }
}
```

---

## 🔄 Get Transaction History

### `GET /transactions/history`

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10, max: 100)
- `status` (optional): pending, completed, failed
- `type` (optional): token_transfer, crypto_to_paybill, etc.
- `chain` (optional): arbitrum, polygon, base, etc.

**Response:**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "txn_123",
        "type": "token_transfer",
        "amount": "50.00 USDC",
        "status": "completed",
        "timestamp": "2025-01-27T10:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 25
    }
  }
}
```

---

## 🛡️ Security Requirements

### **For All Crypto Transactions:**
- **Password OR Google Auth** (user chooses one, not both)
- **Amount Threshold**: $100+ gets enhanced logging

### **Security Input Examples:**
```json
// Option 1: Password
{
  "password": "userPassword"
}

// Option 2: Google Auth
{
  "googleAuthCode": "123456"
}
```

---

## 📱 Frontend Implementation Tips

### **1. Security Method Selection**
```jsx
const [securityMethod, setSecurityMethod] = useState('password');

// In form submission
const payload = {
  ...formData,
  ...(securityMethod === 'password' 
    ? { password } 
    : { googleAuthCode }
  )
};
```

### **2. Error Handling**
```jsx
if (error.code === 'SECURITY_VERIFICATION_REQUIRED') {
  // Show security method selection
  setShowSecurityModal(true);
}
```

### **3. Chain Selection**
```jsx
const supportedChains = [
  { id: 'arbitrum', name: 'Arbitrum' },
  { id: 'polygon', name: 'Polygon' },
  { id: 'base', name: 'Base' },
  { id: 'celo', name: 'Celo' }
];
```

---

## 🚨 Common Error Codes

| Code | Message | Action |
|------|---------|---------|
| `SECURITY_VERIFICATION_REQUIRED` | Need password or Google auth | Show security input |
| `INVALID_PASSWORD` | Wrong password | Clear password field |
| `RECIPIENT_NOT_FOUND` | User not found | Check recipient input |
| `INVALID_CHAIN` | Unsupported blockchain | Show supported chains |
| `INSUFFICIENT_BALANCE` | Not enough funds | Show balance info |

---

## ✅ Testing Checklist

- [ ] Send crypto with password
- [ ] Send crypto with Google auth
- [ ] Pay business with both methods
- [ ] Handle security errors
- [ ] Validate recipient lookup
- [ ] Check balance display
- [ ] Test transaction history

---

**Last Updated:** January 27, 2025  
**Status:** ✅ Ready for Frontend Integration
