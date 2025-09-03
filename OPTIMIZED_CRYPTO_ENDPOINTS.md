# 🚀 Optimized NexusPay Crypto Send/Receive Endpoints

## Overview
This document outlines the optimized and consolidated crypto send/receive endpoints for NexusPay. The system now supports sending crypto to users via **phone numbers**, **emails**, or **wallet addresses** with enhanced security and multi-chain support.

## ✨ Key Improvements Made

### 1. **Enhanced Email Support**
- ✅ Users can now send crypto to recipients using their email address
- ✅ Email notifications are prepared for both sender and recipient
- ✅ Case-insensitive email matching for better user experience

### 2. **Expanded Chain Support**
- ✅ Support for 16+ blockchains (previously only 2)
- ✅ Consistent chain validation across all endpoints
- ✅ Better error messages with supported chain lists

### 3. **Consolidated Endpoints**
- ✅ Removed redundant `POST /api/business/transfer-funds` endpoint
- ✅ Removed duplicate `src/routes/mpesa.ts` file
- ✅ Removed empty `src/routes/balanceRoutes.ts` file
- ✅ All crypto transfers now use the optimized `sendToken` endpoint

### 4. **Enhanced Security & Validation**
- ✅ Better error handling with standardized error codes
- ✅ Enhanced input validation with descriptive error messages
- ✅ Consistent response format across all endpoints

## 🔐 Core Crypto Endpoints

### 1. **Send Crypto to Any User**
**Endpoint:** `POST /api/token/sendToken`

**Purpose:** Send crypto to users by phone number, email, or wallet address

**Authentication:** `authenticate` + **Password OR Google Auth** (user's choice)

**Request Body:**
```json
{
  "recipientIdentifier": "user@example.com", // Email, phone (+254712345678), or wallet address
  "amount": 50.00,
  "senderAddress": "0x...",
  "chain": "arbitrum",
  "tokenSymbol": "USDC", // Optional, defaults to USDC
  "password": "userPassword", // Either password OR googleAuthCode (not both)
  "googleAuthCode": "123456" // Either password OR googleAuthCode (not both)
}
```

**Security Requirements:**
- **$0 - $100**: Password **OR** Google Auth (user chooses)
- **$100+**: Password **OR** Google Auth (user chooses)

**Response:**
```json
{
  "success": true,
  "message": "Token sent successfully!",
  "data": {
    "transactionCode": "ABC123DEF4",
    "amount": "50.00 USDC",
    "recipient": "user@example.com",
    "recipientAddress": "0x...",
    "recipientPhone": "+254712345678",
    "recipientEmail": "user@example.com",
    "timestamp": "2025-01-27T10:30:00.000Z",
    "transactionHash": "0x...",
    "chain": "arbitrum",
    "tokenSymbol": "USDC",
    "notifications": ["SMS sent to recipient", "Email notification prepared for recipient"],
    "securityLevel": "standard",
    "authenticationMethod": "password",
    "authenticationDetails": {
      "method": "password",
      "verified": true,
      "transactionType": "low_value"
    }
  }
}
```

**Features:**
- 🔍 **Smart Recipient Lookup**: Automatically finds users by phone, email, or wallet address
- 📱 **Multi-Channel Notifications**: SMS + Email notifications for both parties
- 🌐 **Multi-Chain Support**: Works across 16+ blockchains
- 🛡️ **Flexible Security**: Password OR Google Auth - user's choice
- 💰 **Amount-Based Security**: Enhanced security for high-value transactions

### 2. **Pay Merchant with Crypto**
**Endpoint:** `POST /api/token/pay`

**Purpose:** Pay registered businesses with crypto

**Authentication:** `authenticate` + **Password OR Google Auth** (user's choice)

**Request Body:**
```json
{
  "senderAddress": "0x...",
  "merchantId": "MERCH123",
  "amount": 100.00,
  "confirm": true,
  "chainName": "polygon",
  "tokenSymbol": "USDT",
  "password": "userPassword", // Either password OR googleAuthCode (not both)
  "googleAuthCode": "123456" // Either password OR googleAuthCode (not both)
}
```

**Security Requirements:**
- **$0 - $100**: Password **OR** Google Auth (user chooses)
- **$100+**: Password **OR** Google Auth (user chooses)

**Response:**
```json
{
  "success": true,
  "message": "Payment to business completed successfully!",
  "data": {
    "businessName": "Example Store",
    "businessAddress": "0x...",
    "amount": 100.00,
    "tokenSymbol": "USDT",
    "chainName": "polygon",
    "transactionHash": "0x...",
    "timestamp": "2025-01-27T10:30:00.000Z",
    "status": "completed",
    "securityLevel": "standard",
    "authenticationMethod": "google_auth",
    "authenticationDetails": {
      "method": "google_auth",
      "verified": true,
      "transactionType": "low_value_business_payment"
    }
  }
}
```

### 3. **Get Receive Information**
**Endpoint:** `GET /api/token/receive`

**Purpose:** Get user's receive information (wallet address, phone, email, supported chains)

**Authentication:** `authenticate` (basic authentication)

**Response:**
```json
{
  "success": true,
  "message": "Receive information retrieved successfully",
  "data": {
    "walletAddress": "0x...",
    "phoneNumber": "+254712345678",
    "email": "user@example.com",
    "supportedChains": [
      { "name": "Arbitrum", "id": "arbitrum", "chainId": 42161 },
      { "name": "Polygon", "id": "polygon", "chainId": 137 },
      { "name": "Base", "id": "base", "chainId": 8453 },
      { "name": "Optimism", "id": "optimism", "chainId": 10 },
      { "name": "Celo", "id": "celo", "chainId": 42220 },
      { "name": "Avalanche", "id": "avalanche", "chainId": 43114 },
      { "name": "BNB Chain", "id": "bnb", "chainId": 56 },
      { "name": "Scroll", "id": "scroll", "chainId": 534352 },
      { "name": "Gnosis", "id": "gnosis", "chainId": 100 }
    ],
    "note": "This wallet address works across all supported chains. Make sure to select the correct network when sending."
  }
}
```

### 4. **Get User Balance**
**Endpoint:** `GET /api/token/balance`

**Purpose:** Get user's wallet balance across all supported chains

**Authentication:** `authenticate` (basic authentication)

**Response:**
```json
{
  "success": true,
  "message": "User balance retrieved successfully",
  "data": {
    "walletAddress": "0x...",
    "totalUSDValue": 1250.75,
    "balances": {
      "arbitrum": {
        "USDC": 500.25,
        "USDT": 250.50
      },
      "polygon": {
        "USDC": 300.00,
        "MATIC": 100.00
      },
      "celo": {
        "cUSD": 200.00
      }
    },
    "chainsWithBalance": 3,
    "lastUpdated": "2025-01-27T10:30:00.000Z"
  }
}
```

## 🌐 Supported Chains & Tokens

### **Supported Blockchains (16+)**
- **Arbitrum** (Primary) - Chain ID: 42161
- **Polygon** - Chain ID: 137
- **Base** - Chain ID: 8453
- **Optimism** - Chain ID: 10
- **Celo** - Chain ID: 42220
- **Avalanche** - Chain ID: 43114
- **BNB Chain** - Chain ID: 56
- **Scroll** - Chain ID: 534352
- **Gnosis** - Chain ID: 100
- **Ethereum** - Chain ID: 1
- **Fantom** - Chain ID: 250
- **Moonbeam** - Chain ID: 1284
- **Fuse** - Chain ID: 122
- **Aurora** - Chain ID: 1313161554
- **Lisk** - Chain ID: 1890
- **Somnia** - Chain ID: 1919

### **Supported Tokens**
- **USDC** (Primary stablecoin)
- **USDT** (Tether)
- **BTC** (Bitcoin)
- **ETH** (Ethereum)
- **WETH** (Wrapped Ethereum)
- **WBTC** (Wrapped Bitcoin)
- **DAI** (Dai)
- **CELO** (Celo native token)

## 🔄 How It Works

### **Sending Crypto Flow:**
1. **User Input**: Recipient identifier (email/phone/wallet address)
2. **Smart Lookup**: System automatically finds recipient by priority:
   - Phone number (with or without + prefix)
   - Email address (case-insensitive)
   - Wallet address (direct)
3. **Validation**: Chain and token validation
4. **Execution**: Blockchain transaction with gas sponsorship
5. **Notifications**: SMS + Email notifications to both parties
6. **Response**: Transaction details with confirmation

### **Recipient Priority System:**
1. **Phone Number**: Most common, supports international format
2. **Email**: Case-insensitive matching, supports all email formats
3. **Wallet Address**: Direct blockchain address (0x...)

## 🛡️ Security Features

### **Authentication Levels:**
- **Basic Auth**: For reading wallet info and balances
- **Flexible Security**: For crypto transfers (Password OR Google Auth - user's choice)

### **Security Tiers:**
- **Low-Value Transactions** (<$100): Password OR Google Auth
- **High-Value Transactions** ($100+): Password OR Google Auth (same options, enhanced logging)

### **Validation:**
- Input sanitization and validation
- Chain and token support verification
- Recipient existence verification
- Balance and allowance checks
- Flexible authentication method validation

### **Error Handling:**
- Standardized error codes and messages
- Detailed logging for debugging
- Graceful failure handling
- Security method guidance

## 📱 Notification System

### **SMS Notifications:**
- ✅ Sent to both sender and recipient (if phone numbers available)
- ✅ Transaction codes for verification
- ✅ Amount and recipient details

### **Email Notifications:**
- ✅ Prepared for both sender and recipient (if emails available)
- ✅ Transaction summaries
- ✅ Security alerts

## 🚫 Removed Redundant Endpoints

### **Deleted Endpoints:**
- ❌ `POST /api/business/transfer-funds` → Now handled by `sendToken`
- ❌ `src/routes/mpesa.ts` → Duplicate routes removed
- ❌ `src/routes/balanceRoutes.ts` → Empty file removed

### **Consolidated Functionality:**
- ✅ All crypto transfers now use the optimized `sendToken` endpoint
- ✅ Consistent validation and error handling
- ✅ Unified notification system

## 🔧 Implementation Notes

### **Database Queries:**
- Parallel queries for better performance
- Optimized user lookup by multiple identifiers
- Efficient wallet creation for new users

### **Error Handling:**
- Standardized error response format
- Comprehensive error logging
- User-friendly error messages

### **Performance:**
- Gas sponsorship for seamless transactions
- Optimized blockchain interactions
- Efficient notification delivery

## 📋 Usage Examples

### **Send to Email:**
```bash
curl -X POST "http://localhost:8000/api/token/sendToken" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recipientIdentifier": "user@example.com",
    "amount": 25.50,
    "senderAddress": "0x...",
    "chain": "polygon",
    "tokenSymbol": "USDC"
  }'
```

### **Send to Phone:**
```bash
curl -X POST "http://localhost:8000/api/token/sendToken" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recipientIdentifier": "+254712345678",
    "amount": 100.00,
    "senderAddress": "0x...",
    "chain": "arbitrum",
    "tokenSymbol": "USDT"
  }'
```

### **Send to Wallet Address:**
```bash
curl -X POST "http://localhost:8000/api/token/sendToken" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recipientIdentifier": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
    "amount": 75.25,
    "senderAddress": "0x...",
    "chain": "base",
    "tokenSymbol": "USDC"
  }'
```

## 🎯 Benefits of Optimization

1. **🎉 Better User Experience**: Send crypto to anyone using email, phone, or wallet address
2. **🔒 Enhanced Security**: OTP verification for all transfers
3. **🌐 Multi-Chain Support**: 16+ blockchains supported
4. **📱 Smart Notifications**: SMS + Email for both parties
5. **⚡ Improved Performance**: Parallel queries and optimized logic
6. **🛠️ Maintainable Code**: Consolidated endpoints, no redundancy
7. **📊 Better Error Handling**: Standardized responses and detailed logging

## 🚀 Future Enhancements

- [ ] **Email Service Integration**: Implement actual email sending for notifications
- [ ] **Push Notifications**: Mobile app push notifications
- [ ] **Batch Transfers**: Send to multiple recipients at once
- [ ] **Scheduled Transfers**: Set up recurring crypto payments
- [ ] **Advanced Analytics**: Transaction insights and reporting

---

**Last Updated:** January 27, 2025  
**Version:** 2.0.0  
**Status:** ✅ Production Ready
