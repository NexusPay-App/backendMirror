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