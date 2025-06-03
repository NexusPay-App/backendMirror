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