# NexusPay API Documentation

This document provides comprehensive documentation for the NexusPay API, intended for frontend developers to integrate with the backend services.

## Base URL

```
https://api.nexuspay.app/api
```

## Authentication

All authenticated endpoints require a valid JWT token in the Authorization header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Error Responses

All endpoints return standardized error responses:

```json
{
  "success": false,
  "message": "Human-readable error message",
  "error": {
    "code": "ERROR_CODE",
    "details": "Additional error details"
  },
  "timestamp": "2023-05-15T14:23:45Z"
}
```

## API Endpoints

### Authentication

#### Register User

```
POST /auth/register
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "phoneNumber": "+254712345678",
  "password": "SecurePassword123",
  "verifyWith": "email" // Options: "email", "phone", "both"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Registration initiated. Please verify your email.",
  "data": {
    "registrationId": "abc123",
    "verificationMethod": "email",
    "email": "user@example.com"
  }
}
```

#### Verify Email

```
POST /auth/register/verify/email
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Email verified successfully!",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "walletAddress": "0xD4732b04f997D0229a755c797Bf1e4Ce6DcC65B7",
    "email": "user@example.com",
    "phoneNumber": "+254712345678"
  }
}
```

#### Verify Phone

```
POST /auth/register/verify/phone
```

**Request Body:**
```json
{
  "phoneNumber": "+254712345678",
  "otp": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Phone number verified successfully!",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "walletAddress": "0xD4732b04f997D0229a755c797Bf1e4Ce6DcC65B7",
    "email": "user@example.com",
    "phoneNumber": "+254712345678"
  }
}
```

#### Login

```
POST /auth/login
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Please verify your login with the code sent to your email.",
  "data": {
    "email": "user@example.com"
  }
}
```

#### Verify Login

```
POST /auth/login/verify
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful!",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "walletAddress": "0xD4732b04f997D0229a755c797Bf1e4Ce6DcC65B7",
    "email": "user@example.com",
    "phoneNumber": "+254712345678"
  }
}
```

#### Request Password Reset

```
POST /auth/password-reset/request
```

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password reset instructions sent to your email.",
  "data": {
    "email": "user@example.com"
  }
}
```

#### Reset Password

```
POST /auth/password-reset
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "otp": "123456",
  "newPassword": "NewSecurePassword123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password reset successful. You can now login with your new password."
}
```

### Crypto Transactions

#### Send Token

```
POST /token/sendToken
```

**Request Body:**
```json
{
  "recipientIdentifier": "+254712345678", // Can be phone number or wallet address
  "amount": "10.5",
  "senderAddress": "0xD4732b04f997D0229a755c797Bf1e4Ce6DcC65B7",
  "chain": "arbitrum" // Options: "arbitrum", "celo", etc.
}
```

**Response:**
```json
{
  "success": true,
  "message": "Token sent successfully!",
  "data": {
    "transactionId": "tx123",
    "transactionCode": "ABC123XYZ",
    "amount": "10.5 USDC",
    "recipient": "+254712345678",
    "timestamp": "2023-05-15T14:23:45Z"
  }
}
```

#### Pay Merchant

```
POST /token/pay
```

**Request Body:**
```json
{
  "senderAddress": "0xD4732b04f997D0229a755c797Bf1e4Ce6DcC65B7",
  "businessUniqueCode": "NEXUS001",
  "amount": "50.75",
  "confirm": true,
  "chainName": "arbitrum"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment successful!",
  "data": {
    "transactionId": "tx456",
    "transactionCode": "DEF456UVW",
    "amount": "50.75 USDC",
    "businessName": "Coffee Shop",
    "timestamp": "2023-05-15T14:23:45Z"
  }
}
```

#### Get Token Transfer Events

```
GET /token/tokenTransferEvents?address=0xD4732b04f997D0229a755c797Bf1e4Ce6DcC65B7&chain=arbitrum
```

**Response:**
```json
{
  "success": true,
  "data": {
    "events": [
      {
        "txHash": "0x123...",
        "from": "0xabc...",
        "to": "0xdef...",
        "amount": "10.5",
        "token": "USDC",
        "timestamp": "2023-05-15T14:23:45Z",
        "status": "confirmed",
        "blockNumber": 12345678
      }
    ]
  }
}
```

### MPESA Integration

#### Buy Crypto with MPESA (Deposit)

```
POST /mpesa/deposit
```

**Request Body:**
```json
{
  "amount": "1000",
  "phone": "+254712345678"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Transaction initiated",
  "data": {
    "transactionId": "mpesa123",
    "status": "pending",
    "checkoutRequestId": "ws_CO_12345"
  }
}
```

#### Buy Crypto (Automatic Flow)

```
POST /mpesa/buy-crypto
```

**Description:** Initiates crypto purchase with automatic M-Pesa payment. Specify crypto amount, and the system calculates required M-Pesa payment based on current conversion rates.

**Request Body:**
```json
{
  "cryptoAmount": "0.5",
  "phone": "+254712345678",
  "chain": "arbitrum",
  "tokenType": "USDC"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Crypto purchase initiated successfully",
  "data": {
    "transactionId": "1247393a-a504-4131-ad7f-23d943dc6851",
    "mpesaAmount": 65,
    "cryptoAmount": 0.5,
    "tokenType": "USDC",
    "chain": "arbitrum",
    "status": "reserved",
    "checkoutRequestId": "ws_CO_03062025021903025759280875",
    "createdAt": "2025-06-02T23:19:02.568Z",
    "estimatedCompletionTime": "2025-06-02T23:21:18.320Z",
    "successCode": "NP-5ATVA-XR"
  }
}
```

#### Submit M-Pesa Receipt (Manual Completion)

```
POST /mpesa/submit-receipt
```

**Description:** Manually complete a crypto purchase by submitting M-Pesa receipt details. This is used when automatic webhook processing fails or for manual intervention scenarios.

**Request Body:**
```json
{
  "transactionId": "1247393a-a504-4131-ad7f-23d943dc6851",
  "mpesaReceiptNumber": "TF34AMNCAC",
  "amount": 65
}
```

**Response:**
```json
{
  "success": true,
  "message": "M-Pesa receipt verified and crypto transferred successfully",
  "data": {
    "transactionId": "1247393a-a504-4131-ad7f-23d943dc6851",
    "mpesaReceiptNumber": "TF34AMNCAC",
    "cryptoAmount": 0.5,
    "tokenType": "USDC",
    "chain": "arbitrum",
    "recipient": "0x31c41BCa835C0d3c597cbBaFf2e8dBF973645fb4",
    "cryptoTransactionHash": "0x4f0368b28d0068ea11fda270eb8c79d263ac9872cbfc7b96f98fd4df621680d4",
    "explorerUrl": "https://arbiscan.io/tx/0x4f0368b28d0068ea11fda270eb8c79d263ac9872cbfc7b96f98fd4df621680d4",
    "status": "completed",
    "completedAt": "2025-06-02T23:25:06.056Z",
    "platformBalance": "5.43 USDC",
    "note": "Your M-Pesa receipt has been verified and crypto has been transferred to your wallet successfully!"
  }
}
```

**Use Cases:**
- When automatic M-Pesa webhooks fail in development/testing environments
- Manual intervention for failed automatic processing
- Customer support scenarios where manual verification is required

**Error Responses:**
- `400 Bad Request`: Invalid transaction ID, duplicate receipt, or mismatched amount
- `404 Not Found`: Transaction not found or not eligible for manual completion
- `409 Conflict`: Transaction already completed or receipt already used

#### Withdraw to MPESA

```
POST /mpesa/withdraw
```

**Request Body:**
```json
{
  "amount": "500",
  "phone": "+254712345678"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Withdrawal initiated",
  "data": {
    "transactionId": "mpesa456",
    "status": "pending",
    "estimatedCompletionTime": "2023-05-15T14:28:45Z"
  }
}
```

#### Pay to Paybill

```
POST /mpesa/paybill
```

**Request Body:**
```json
{
  "amount": "1200",
  "businessNumber": "123456",
  "accountNumber": "ACC001"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment initiated",
  "data": {
    "transactionId": "mpesa789",
    "status": "pending"
  }
}
```

#### Pay to Till

```
POST /mpesa/till
```

**Request Body:**
```json
{
  "amount": "850",
  "tillNumber": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment initiated",
  "data": {
    "transactionId": "mpesa012",
    "status": "pending"
  }
}
```

#### Get Transaction Status

```
GET /mpesa/transaction/mpesa123
```

**Response:**
```json
{
  "success": true,
  "data": {
    "transactionId": "mpesa123",
    "type": "deposit",
    "amount": "1000",
    "status": "completed",
    "cryptoAmount": "9.85",
    "timestamp": "2023-05-15T14:23:45Z",
    "completedAt": "2023-05-15T14:24:30Z"
  }
}
```

### Business Account

#### Request Business Upgrade

```
POST /business/request-upgrade
```

**Request Body:**
```json
{
  "businessName": "Coffee Shop",
  "ownerName": "John Doe",
  "location": "Nairobi, Kenya",
  "businessType": "retail",
  "phoneNumber": "+254712345678"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Business upgrade initiated. Please verify with the OTP sent to your phone.",
  "data": {
    "businessId": "bus123",
    "status": "pending"
  }
}
```

#### Complete Business Upgrade

```
POST /business/complete-upgrade
```

**Request Body:**
```json
{
  "businessId": "bus123",
  "otp": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Business account successfully created",
  "data": {
    "businessId": "bus123",
    "businessName": "Coffee Shop",
    "merchantId": "NEXUS001",
    "walletAddress": "0x9876b04f997D0229a755c797Bf1e4Ce6DcC1234"
  }
}
```

#### Transfer Funds to Personal

```
POST /business/transfer-funds
```

**Request Body:**
```json
{
  "businessId": "bus123",
  "amount": "1000",
  "walletAddress": "0xD4732b04f997D0229a755c797Bf1e4Ce6DcC65B7"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Funds transferred successfully",
  "data": {
    "transactionId": "transfer123",
    "amount": "1000",
    "timestamp": "2023-05-15T14:23:45Z"
  }
}
```

## WebSocket Updates

Connect to the WebSocket server for real-time updates:

```
wss://api.nexuspay.app/ws
```

### Authentication

Send authentication message after connection:

```json
{
  "type": "auth",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Message Types

#### Transaction Update

```json
{
  "type": "transaction_update",
  "data": {
    "transactionId": "tx123",
    "status": "confirmed",
    "timestamp": "2023-05-15T14:25:30Z"
  }
}
```

#### MPESA Update

```json
{
  "type": "mpesa_update",
  "data": {
    "transactionId": "mpesa123",
    "status": "completed",
    "timestamp": "2023-05-15T14:25:30Z"
  }
}
```

## Pagination

For endpoints that return lists, pagination is supported with the following query parameters:

- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10, max: 100)

Example:

```
GET /token/tokenTransferEvents?address=0x123&page=2&limit=20
```

Response includes pagination metadata:

```json
{
  "success": true,
  "data": {
    "events": [...],
    "pagination": {
      "total": 150,
      "page": 2,
      "limit": 20,
      "pages": 8
    }
  }
}
```

## Rate Limits

- Authentication endpoints: 10 requests per minute
- Transaction endpoints: 30 requests per minute
- Query endpoints: 60 requests per minute

Rate limit headers are included in all responses:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 58
X-RateLimit-Reset: 1589210400
```

## Status Codes

- `200 OK`: Request succeeded
- `201 Created`: Resource created successfully
- `400 Bad Request`: Invalid input
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

## Integration Libraries

Frontend SDKs are available for easy integration:

- [JavaScript/TypeScript SDK](https://github.com/nexuspay/js-sdk)
- [React Native SDK](https://github.com/nexuspay/react-native-sdk)
- [Flutter SDK](https://github.com/nexuspay/flutter-sdk)

## Testing

Sandbox environment available for testing:

```
https://sandbox-api.nexuspay.app/api
```

Test credentials:
- Email: `test@example.com`
- Password: `TestPassword123`
- OTP: Always `123456` in sandbox

## Support

For API integration support, contact:
- Email: developers@nexuspay.app
- Developer Portal: https://developers.nexuspay.app

### Admin Management

#### Get All Users

```
GET /admin/users
```

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Query Parameters:**
```
limit: 10 (number of users per page)
page: 1 (page number)
sortBy: createdAt (field to sort by)
order: desc (sort order: asc or desc)
```

**Response:**
```json
{
  "success": true,
  "message": "Users retrieved successfully",
  "data": {
    "users": [
      {
        "_id": "60d5ec66fcf556001581bf35",
        "email": "user@example.com",
        "phoneNumber": "+254712345678",
        "walletAddress": "0xD4732b04f997D0229a755c797Bf1e4Ce6DcC65B7",
        "role": "user",
        "createdAt": "2023-05-15T14:23:45Z",
        "lastLogin": "2023-05-15T14:25:00Z"
      }
    ],
    "pagination": {
      "total": 100,
      "page": 1,
      "limit": 10,
      "pages": 10
    }
  }
}
```

#### Get User by ID

```
GET /admin/users/:id
```

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "success": true,
  "message": "User retrieved successfully",
  "data": {
    "user": {
      "_id": "60d5ec66fcf556001581bf35",
      "email": "user@example.com",
      "phoneNumber": "+254712345678",
      "walletAddress": "0xD4732b04f997D0229a755c797Bf1e4Ce6DcC65B7",
      "role": "user",
      "createdAt": "2023-05-15T14:23:45Z",
      "lastLogin": "2023-05-15T14:25:00Z",
      "transactions": [
        {
          "transactionId": "tx123",
          "amount": 1000,
          "type": "fiat_to_crypto",
          "status": "completed",
          "createdAt": "2023-05-15T14:23:45Z"
        }
      ],
      "walletBalance": {
        "USDC": "100.50",
        "CELO": "25.75"
      }
    }
  }
}
```

#### Promote User to Admin

```
POST /admin/users/promote/:id
```

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "success": true,
  "message": "User promoted to admin successfully",
  "data": {
    "userId": "60d5ec66fcf556001581bf35",
    "email": "user@example.com",
    "role": "admin"
  }
}
```

#### Get All Transactions

```
GET /admin/transactions
```

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Query Parameters:**
```
page (optional): Page number (default: 1)
limit (optional): Items per page (default: 10)
status (optional): Filter by status ('pending', 'completed', 'failed')
type (optional): Filter by type ('fiat_to_crypto', 'crypto_to_fiat', 'crypto_to_paybill', 'crypto_to_till')
startDate (optional): Filter by start date (ISO format)
endDate (optional): Filter by end date (ISO format)
userId (optional): Filter by user ID
```

**Response:**
```json
{
  "success": true,
  "message": "Transactions retrieved successfully",
  "data": {
    "transactions": [
      {
        "transactionId": "tx123",
        "amount": 1000,
        "cryptoAmount": 9.85,
        "type": "fiat_to_crypto",
        "status": "completed",
        "userId": {
          "phoneNumber": "+254712345678",
          "email": "user@example.com",
          "walletAddress": "0xD4732b04f997D0229a755c797Bf1e4Ce6DcC65B7"
        },
        "mpesaTransactionId": "MPESA123456",
        "cryptoTransactionHash": "0x123...",
        "createdAt": "2023-05-15T14:23:45Z",
        "completedAt": "2023-05-15T14:25:00Z"
      }
    ],
    "pagination": {
      "total": 100,
      "page": 1,
      "limit": 10,
      "pages": 10
    }
  }
}
```

#### Get Transaction by ID

```
GET /admin/transactions/:id
```

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "success": true,
  "message": "Transaction retrieved successfully",
  "data": {
    "transaction": {
      "transactionId": "tx123",
      "amount": 1000,
      "cryptoAmount": 9.85,
      "type": "fiat_to_crypto",
      "status": "completed",
      "userId": {
        "phoneNumber": "+254712345678",
        "email": "user@example.com",
        "walletAddress": "0xD4732b04f997D0229a755c797Bf1e4Ce6DcC65B7"
      },
      "mpesaTransactionId": "MPESA123456",
      "cryptoTransactionHash": "0x123...",
      "createdAt": "2023-05-15T14:23:45Z",
      "completedAt": "2023-05-15T14:25:00Z"
    }
  }
}
```

#### Update Transaction Status

```
PUT /admin/transactions/:id/status
```

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Request Body:**
```json
{
  "status": "completed",
  "notes": "Manually verified and completed"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Transaction status updated successfully",
  "data": {
    "transactionId": "tx123",
    "status": "completed",
    "retryCount": 1,
    "lastRetryAt": "2023-05-15T14:24:30Z",
    "completedAt": "2023-05-15T14:25:00Z"
  }
}
```

#### Get Platform Wallet Status

```
GET /admin/platform-wallets
```

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "success": true,
  "message": "Platform wallet status retrieved successfully",
  "data": {
    "mainWallet": {
      "address": "0xD4732b04f997D0229a755c797Bf1e4Ce6DcC65B7",
      "balance": 10000.5
    },
    "feesWallet": {
      "address": "0xA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0",
      "balance": 500.75
    }
  }
}
```

#### Fund User Wallet

```
POST /admin/wallets/fund
```

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Request Body:**
```json
{
  "userId": "60d5ec66fcf556001581bf35",
  "amount": 100,
  "chainName": "celo"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User wallet funded successfully",
  "data": {
    "userId": "60d5ec66fcf556001581bf35",
    "amount": 100,
    "transactionHash": "0x123...",
    "recipientAddress": "0xD4732b04f997D0229a755c797Bf1e4Ce6DcC65B7"
  }
}
```

#### Withdraw Fees to Main Wallet

```
POST /admin/wallets/withdraw-fees
```

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Request Body:**
```json
{
  "amount": 500
}
```

**Response:**
```json
{
  "success": true,
  "message": "Fees withdrawn to main wallet successfully",
  "data": {
    "amount": 500,
    "transactionHash": "0x123...",
    "fromAddress": "0xA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0",
    "toAddress": "0xD4732b04f997D0229a755c797Bf1e4Ce6DcC65B7"
  }
}
```

# 🚀 **CRYPTO SPENDING SYSTEM**

## **Pay Paybills/Tills with Crypto** 
**Revolutionary crypto-to-M-Pesa spending feature**

### **POST** `/api/mpesa/pay-with-crypto`

**Use Case**: Pay electricity bills, water bills, school fees, shops, etc. using your crypto balance.

**Authentication**: Required (JWT Token)

**Flow**: User Crypto → Platform Wallet → M-Pesa Payment to Target

**Performance**: ⚡ Optimized for speed with atomic transactions and rollback protection

---

### **Request Body**
```json
{
  "amount": 500,
  "cryptoAmount": 3.75,
  "targetType": "paybill",
  "targetNumber": "400222",
  "accountNumber": "12345",
  "chain": "polygon",
  "tokenType": "USDC",
  "description": "Electricity bill payment"
}
```

### **Parameters**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | Yes | Amount in KES to pay |
| `cryptoAmount` | number | Yes | Amount of crypto to spend |
| `targetType` | string | Yes | `"paybill"` or `"till"` |
| `targetNumber` | string | Yes | Paybill number or till number |
| `accountNumber` | string | Required for paybill | Account number for paybill payments |
| `chain` | string | Yes | Blockchain: `polygon`, `ethereum`, `arbitrum`, etc. |
| `tokenType` | string | Yes | Token: `USDC`, `USDT`, `BTC`, `ETH` |
| `description` | string | Optional | Payment description (max 100 chars) |

---

### **Success Response (200)**
```json
{
  "success": true,
  "message": "Crypto payment completed successfully",
  "data": {
    "transactionId": "abc73b37-7fcd-41e8-a70e-18b89192de70",
    "fiatAmount": 500,
    "cryptoAmount": 3.75,
    "tokenType": "USDC",
    "chain": "polygon",
    "targetType": "paybill",
    "targetNumber": "400222",
    "accountNumber": "12345",
    "status": "completed",
    "completedAt": "2025-01-06T04:07:15.123Z",
    "cryptoTransactionHash": "0x36990198eaa7bd18f0c8b09e9aa45553bf08fe642c4b78b345a068cfe2e54c28",
    "mpesaTransactionId": "ws_CO_03062025040707552759280875",
    "explorerUrl": "https://polygonscan.com/tx/0x36990198eaa7bd18f0c8b09e9aa45553bf08fe642c4b78b345a068cfe2e54c28",
    "processingTimeMs": 2847,
    "conversionRate": 133.33,
    "description": "Electricity bill payment",
    "note": "Successfully paid 500 KES to paybill 400222 using 3.75 USDC"
  }
}
```

### **Error Responses**

**Insufficient Balance (400)**
```json
{
  "success": false,
  "message": "Insufficient crypto balance",
  "data": {
    "requestedAmount": 3.75,
    "availableAmount": 2.1,
    "tokenType": "USDC",
    "chain": "polygon"
  },
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Insufficient USDC balance. Available: 2.1, Required: 3.75"
  }
}
```

**Payment Failed with Rollback (500)**
```json
{
  "success": false,
  "message": "Payment failed - crypto returned to your wallet",
  "data": {
    "transactionId": "def456-...",
    "rollbackTxHash": "0xabcd...",
    "explorerUrl": "https://polygonscan.com/tx/0xabcd..."
  },
  "error": {
    "code": "PAYMENT_FAILED_ROLLED_BACK",
    "message": "M-Pesa payment failed: Network timeout. Your crypto has been returned to your wallet."
  }
}
```

---

### **🔒 Security Features**

1. **Authentication Validation**: Must be logged in
2. **Balance Verification**: Checks crypto balance before proceeding  
3. **Conversion Rate Protection**: 2% tolerance to prevent manipulation
4. **Atomic Transactions**: All-or-nothing execution
5. **Automatic Rollback**: Returns crypto if M-Pesa payment fails
6. **Audit Logging**: Full transaction trail for compliance

### **⚡ Performance Features**

1. **Parallel Validation**: Multiple checks run simultaneously
2. **Conversion Rate Caching**: 2-minute cache for speed
3. **Optimized Database**: Single transaction for ACID compliance
4. **Fast Error Handling**: Immediate response on validation failures
5. **Background Processing**: Non-blocking operations where possible

### **🔄 Transaction Flow**

1. **Validation Phase**
   - User authentication
   - Input validation
   - Balance verification
   - Conversion rate check

2. **Execution Phase**
   - Create escrow record
   - Transfer crypto from user to platform
   - Initiate M-Pesa payment

3. **Completion Phase**
   - Update escrow with success
   - Log for reconciliation
   - Return success response

4. **Rollback Phase** (if needed)
   - Detect M-Pesa failure
   - Return crypto to user
   - Update escrow with rollback info

---

### **💡 Use Cases**

**Paybill Examples:**
- Electricity: KPLC `888880`
- Water: Nairobi Water `535353`
- TV: DSTV `820820`
- Internet: Safaricom `551500`

**Till Examples:**  
- Supermarkets: Naivas `508508`
- Fuel: Shell `374455`
- Pharmacies: Local till numbers

### **🌟 Benefits**

- **Real Crypto Utility**: Spend crypto for everyday payments
- **No M-Pesa Float Needed**: Platform handles liquidity
- **Instant Conversion**: Real-time rates
- **Security**: Rollback protection
- **Transparency**: Full audit trail

---

## **Example Usage**

### **Pay Electricity Bill with USDC**
```bash
curl -X POST https://api.nexuspay.co.ke/api/mpesa/pay-with-crypto \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "amount": 2500,
    "cryptoAmount": 18.75,
    "targetType": "paybill",
    "targetNumber": "888880",
    "accountNumber": "123456789",
    "chain": "polygon",
    "tokenType": "USDC",
    "description": "KPLC electricity bill"
  }'
```

### **Pay Shop Till with ETH**
```bash
curl -X POST https://api.nexuspay.co.ke/api/mpesa/pay-with-crypto \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "amount": 1200,
    "cryptoAmount": 0.0027,
    "targetType": "till",
    "targetNumber": "508508",
    "chain": "ethereum",
    "tokenType": "ETH",
    "description": "Grocery shopping"
  }'
```

---

**🎯 This feature transforms crypto from investment asset to practical spending money!** 

### Enhanced Transaction History

#### Get Enhanced Transaction History

```
GET /api/transactions/history
```

**Description:** Get comprehensive transaction history with detailed token information, multi-currency values, blockchain explorer links, portfolio impact analysis, and dashboard insights.

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Query Parameters:**
```
page (optional): Page number (default: 1)
limit (optional): Items per page (default: 10, max: 100)
status (optional): Filter by status ('pending', 'completed', 'failed', 'error', 'reserved')
type (optional): Filter by type ('fiat_to_crypto', 'crypto_to_fiat', 'crypto_to_paybill', 'crypto_to_till')
chain (optional): Filter by blockchain ('celo', 'polygon', 'arbitrum', 'base', 'optimism', etc.)
tokenType (optional): Filter by token ('USDC', 'USDT', 'BTC', 'ETH', 'WETH', 'WBTC', 'DAI', 'CELO')
dateFrom (optional): Filter from date (ISO8601 format)
dateTo (optional): Filter to date (ISO8601 format)
```

**Example Request:**
```
GET /api/transactions/history?page=1&limit=5&status=completed&chain=arbitrum
```

**Response:**
```json
{
  "success": true,
  "message": "Enhanced transaction history retrieved successfully",
  "data": {
    "transactions": [
      {
        "id": "tx-uuid-123",
        "type": "fiat_to_crypto",
        "status": "completed",
        "token": {
          "symbol": "USDC",
          "name": "USD Coin",
          "amount": 50.0,
          "decimals": 6
        },
        "values": {
          "fiat": {
            "amount": 6675,
            "currency": "KES",
            "formatted": "KES 6,675"
          },
          "usd": {
            "amount": 50.0,
            "formatted": "$50.00",
            "rate": 1.0
          },
          "kes": {
            "amount": 6675,
            "formatted": "KES 6,675",
            "rate": 133.5
          }
        },
        "blockchain": {
          "chain": "arbitrum",
          "network": "Arbitrum One",
          "txHash": "0xabc123def456...",
          "explorerUrl": "https://arbiscan.io/tx/0xabc123def456...",
          "explorerName": "Arbiscan"
        },
        "portfolio": {
          "impact": "positive",
          "direction": "+",
          "description": "Added crypto to your portfolio"
        },
        "timing": {
          "createdAt": "2024-01-15T10:30:00Z",
          "completedAt": "2024-01-15T10:32:15Z",
          "processingTimeSeconds": 135,
          "ageMinutes": 1440,
          "formatted": {
            "created": "1/15/2024, 10:30:00 AM",
            "completed": "1/15/2024, 10:32:15 AM"
          }
        },
        "references": {
          "transactionId": "tx-uuid-123",
          "mpesaTransactionId": "MPESA123456789",
          "retryCount": 0
        },
        "dashboard": {
          "priority": "low",
          "category": "Buy Crypto",
          "statusColor": "#10B981",
          "icon": "💳→🪙",
          "summary": "Bought 50 USDC ($50.00) on arbitrum"
        }
      },
      {
        "id": "tx-uuid-456",
        "type": "crypto_to_fiat",
        "status": "completed",
        "token": {
          "symbol": "USDC",
          "name": "USD Coin",
          "amount": 25.0,
          "decimals": 6
        },
        "values": {
          "fiat": {
            "amount": 3337.5,
            "currency": "KES",
            "formatted": "KES 3,338"
          },
          "usd": {
            "amount": 25.0,
            "formatted": "$25.00",
            "rate": 1.0
          },
          "kes": {
            "amount": 3337.5,
            "formatted": "KES 3,338",
            "rate": 133.5
          }
        },
        "blockchain": {
          "chain": "arbitrum",
          "network": "Arbitrum One",
          "txHash": "0xdef789ghi012...",
          "explorerUrl": "https://arbiscan.io/tx/0xdef789ghi012...",
          "explorerName": "Arbiscan"
        },
        "portfolio": {
          "impact": "negative",
          "direction": "-",
          "description": "Converted crypto to cash"
        },
        "timing": {
          "createdAt": "2024-01-14T15:20:00Z",
          "completedAt": "2024-01-14T15:21:30Z",
          "processingTimeSeconds": 90,
          "ageMinutes": 2880,
          "formatted": {
            "created": "1/14/2024, 3:20:00 PM",
            "completed": "1/14/2024, 3:21:30 PM"
          }
        },
        "references": {
          "transactionId": "tx-uuid-456",
          "mpesaTransactionId": "MPESA987654321",
          "retryCount": 0
        },
        "dashboard": {
          "priority": "low",
          "category": "Sell Crypto",
          "statusColor": "#10B981",
          "icon": "🪙→💰",
          "summary": "Sold 25 USDC for KES 3,338.00"
        }
      }
    ],
    "summary": {
      "total": 25,
      "page": 1,
      "limit": 5,
      "pages": 5,
      "filters": {
        "status": "completed",
        "type": null,
        "chain": "arbitrum",
        "tokenType": null,
        "dateFrom": null,
        "dateTo": null
      }
    },
    "insights": {
      "totalTransactions": 25,
      "completedTransactions": 23,
      "pendingTransactions": 1,
      "failedTransactions": 1,
      "totalVolume": {
        "usd": 1250.75,
        "kes": 166,975.50
      },
      "mostUsedChain": "arbitrum",
      "mostUsedToken": "USDC",
      "averageTransactionSize": 54.38,
      "recentActivity": {
        "last24h": 3,
        "last7d": 12,
        "last30d": 25
      }
    }
  }
}
```

#### Get Enhanced Transaction Details by ID

```
GET /api/transactions/:id
```

**Description:** Get comprehensive details for a specific transaction including complete blockchain information, portfolio analysis, and actionable insights.

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Parameters:**
```
id: Transaction ID or database ObjectId
```

**Example Request:**
```
GET /api/transactions/tx-uuid-123
```

**Response:**
```json
{
  "success": true,
  "message": "Enhanced transaction details retrieved successfully",
  "data": {
    "transaction": {
      "id": "tx-uuid-123",
      "type": "fiat_to_crypto",
      "status": "completed",
      "token": {
        "symbol": "USDC",
        "name": "USD Coin",
        "amount": 50.0,
        "decimals": 6,
        "contractAddress": null
      },
      "values": {
        "fiat": {
          "amount": 6675,
          "currency": "KES",
          "formatted": "KES 6,675",
          "historicalRate": 133.5
        },
        "usd": {
          "amount": 50.0,
          "formatted": "$50.00",
          "rate": 1.0,
          "currentRate": 1.0
        },
        "kes": {
          "amount": 6675,
          "formatted": "KES 6,675",
          "rate": 133.5,
          "currentRate": 133.5,
          "historicalRate": 133.5
        }
      },
      "blockchain": {
        "chain": "arbitrum",
        "network": "Arbitrum One",
        "txHash": "0xabc123def456...",
        "explorerUrl": "https://arbiscan.io/tx/0xabc123def456...",
        "explorerName": "Arbiscan",
        "blockNumber": 168234567,
        "gasUsed": 21000,
        "gasFee": 0.0001
      },
      "portfolio": {
        "impact": "positive",
        "direction": "+",
        "description": "Added crypto to your portfolio",
        "category": "Buy Crypto"
      },
      "timing": {
        "createdAt": "2024-01-15T10:30:00Z",
        "completedAt": "2024-01-15T10:32:15Z",
        "processingTimeSeconds": 135,
        "ageMinutes": 1440,
        "formatted": {
          "created": "1/15/2024, 10:30:00 AM",
          "completed": "1/15/2024, 10:32:15 AM"
        }
      },
      "references": {
        "transactionId": "tx-uuid-123",
        "mpesaTransactionId": "MPESA123456789",
        "cryptoTransactionHash": "0xabc123def456...",
        "retryCount": 0,
        "lastRetryAt": null
      },
      "metadata": {
        "chain": "arbitrum",
        "tokenType": "USDC",
        "directBuy": true,
        "conversionRate": 133.5,
        "estimatedValue": "$50.00 USD",
        "currentEstimatedValue": "$50.00 USD",
        "kesEstimatedValue": "KES 6,675.00",
        "platformFee": 0.5,
        "userBalanceAtTime": 125.50
      },
      "dashboard": {
        "priority": "low",
        "statusColor": "#10B981",
        "icon": "💳→🪙",
        "progressPercentage": 100,
        "actionItems": [
          "View on blockchain explorer"
        ],
        "summary": "Bought 50 USDC ($50.00) on arbitrum"
      }
    }
  }
}
```

#### Get Dashboard Insights

```
GET /api/transactions/dashboard/insights
```

**Description:** Get comprehensive portfolio insights and analytics for dashboard visualization.

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "success": true,
  "message": "Enhanced transaction history retrieved successfully",
  "data": {
    "transactions": [/* Recent 50 transactions with full details */],
    "summary": {
      "total": 125,
      "page": 1,
      "limit": 50,
      "pages": 3,
      "filters": {
        "status": null,
        "type": null,
        "chain": null,
        "tokenType": null,
        "dateFrom": null,
        "dateTo": null
      }
    },
    "insights": {
      "totalTransactions": 125,
      "completedTransactions": 115,
      "pendingTransactions": 5,
      "failedTransactions": 5,
      "totalVolume": {
        "usd": 15875.25,
        "kes": 2,119,246.25
      },
      "mostUsedChain": "arbitrum",
      "mostUsedToken": "USDC",
      "averageTransactionSize": 138.04,
      "recentActivity": {
        "last24h": 8,
        "last7d": 35,
        "last30d": 89
      }
    }
  }
}
```

### Transaction Status Definitions

**Transaction Statuses:**
- `pending`: Transaction initiated but not yet confirmed
- `reserved`: Funds reserved, waiting for blockchain confirmation
- `completed`: Transaction successfully completed
- `failed`: Transaction failed (can be retried)
- `error`: Transaction encountered an error (requires manual intervention)

**Transaction Types:**
- `fiat_to_crypto`: Buying crypto with M-Pesa (KES → Crypto)
- `crypto_to_fiat`: Selling crypto for M-Pesa (Crypto → KES)
- `crypto_to_paybill`: Paying paybill with crypto
- `crypto_to_till`: Paying till number with crypto
- `token_transfer`: Direct token transfers

**Portfolio Impact:**
- `positive`: Transaction adds value to portfolio (buying crypto)
- `negative`: Transaction removes value from portfolio (selling/spending crypto)
- `neutral`: No portfolio impact (failed transactions, transfers)

### Supported Blockchains and Tokens

**Supported Chains:**
- Arbitrum One (`arbitrum`)
- Polygon (`polygon`)
- Celo Mainnet (`celo`)
- Base (`base`)
- Optimism (`optimism`)
- Ethereum Mainnet (`ethereum`)
- BNB Smart Chain (`bnb`)
- Avalanche C-Chain (`avalanche`)
- Fantom Opera (`fantom`)
- Gnosis Chain (`gnosis`)
- Scroll (`scroll`)
- Moonbeam (`moonbeam`)
- Fuse Network (`fuse`)
- Aurora (`aurora`)
- Lisk (`lisk`)
- Somnia (`somnia`)

**Supported Tokens:**
- USDC (USD Coin)
- USDT (Tether USD)
- BTC (Bitcoin)
- ETH (Ethereum)
- WETH (Wrapped Ethereum)
- WBTC (Wrapped Bitcoin)
- DAI (Dai Stablecoin)
- CELO (Celo)

**Block Explorer Integration:**
Each transaction includes direct links to the appropriate blockchain explorer:
- Arbitrum: Arbiscan
- Polygon: PolygonScan
- Ethereum: Etherscan
- Celo: Celo Explorer
- Base: BaseScan
- Optimism: Optimism Explorer
- And more...

### Dashboard Features

**Real-time Values:**
- Current USD values for all tokens
- Live KES conversion rates
- Historical rate tracking
- Portfolio impact analysis

**Filtering and Search:**
- Filter by status, type, chain, token
- Date range filtering
- Pagination support
- Real-time updates

**Analytics and Insights:**
- Transaction volume tracking
- Most used chains and tokens
- Recent activity metrics
- Average transaction sizes
- Success/failure rates

**Visual Elements:**
- Status color coding
- Transaction type icons
- Progress indicators
- Priority levels
- Action items

// ... existing code ... 