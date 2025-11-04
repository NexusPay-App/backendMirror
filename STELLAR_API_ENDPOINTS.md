# 🌟 Stellar Chain API Endpoints - Frontend Integration Guide

## Base URL
```
http://localhost:8000/api  (Development)
https://your-production-domain.com/api  (Production)
```

---

## 📋 Table of Contents

1. [Authentication & User Management](#1-authentication--user-management)
2. [Stellar Wallet Management](#2-stellar-wallet-management)
3. [Stellar M-Pesa Integration](#3-stellar-m-pesa-integration)
4. [Stellar Token Operations](#4-stellar-token-operations)
5. [Stellar Advanced Features](#5-stellar-advanced-features)
6. [Multi-Chain Endpoints (Supporting Stellar)](#6-multi-chain-endpoints-supporting-stellar)

---

## 1. Authentication & User Management

### 1.1 Login
**Endpoint:** `POST /api/auth/login`

**Request:**
```json
{
  "phoneNumber": "+254759280875",
  "password": "your_password"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Please verify your login with the code sent to your phone number.",
  "data": {
    "phoneNumber": "+254759280875"
  }
}
```

### 1.2 Verify Login OTP
**Endpoint:** `POST /api/auth/login/verify`

**Request:**
```json
{
  "phoneNumber": "+254759280875",
  "otp": "123456"
}
```

**Response (Includes Both EVM and Stellar Wallets):**
```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "wallets": {
      "evm": "0x31c41BCa835C0d3c597cbBaFf2e8dBF973645fb4",
      "stellar": "GDFJ2AWYVAYUFPPTYIDRM6GNJJS3P2OZRBEO4XEQU2CHZUOE262OYJQI"
    },
    "walletAddress": "0x31c41BCa835C0d3c597cbBaFf2e8dBF973645fb4",
    "stellarAccountId": "GDFJ2AWYVAYUFPPTYIDRM6GNJJS3P2OZRBEO4XEQU2CHZUOE262OYJQI",
    "email": "user@example.com",
    "phoneNumber": "+254759280875",
    "stellarWalletCreated": true
  }
}
```

**Note:** Stellar wallet is automatically created on login if it doesn't exist.

---

## 2. Stellar Wallet Management

### 2.1 Create Stellar Wallet
**Endpoint:** `POST /api/stellar/wallet`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accountId": "GDFJ2AWYVAYUFPPTYIDRM6GNJJS3P2OZRBEO4XEQU2CHZUOE262OYJQI",
    "balances": [
      {
        "asset": "XLM",
        "balance": "10000.0000000",
        "usdValue": 0
      }
    ],
    "sequence": "0",
    "isActive": true,
    "createdAt": "2025-11-04T18:56:24.511Z"
  }
}
```

### 2.2 Get Stellar Wallet
**Endpoint:** `GET /api/stellar/wallet`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accountId": "GDFJ2AWYVAYUFPPTYIDRM6GNJJS3P2OZRBEO4XEQU2CHZUOE262OYJQI",
    "balances": [
      {
        "asset": "XLM",
        "balance": "10000.0000000",
        "usdValue": 0
      },
      {
        "asset": "USDC",
        "balance": "0.0000000",
        "usdValue": 0
      }
    ],
    "sequence": "0",
    "isActive": true
  }
}
```

**Note:** This endpoint does NOT return the secret key for security. Use `/api/stellar/secret-key` to retrieve it.

### 2.3 Get Stellar Secret Key (Private Key)
**Endpoint:** `GET /api/stellar/secret-key`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Secret key retrieved successfully",
  "data": {
    "accountId": "GDFJ2AWYVAYUFPPTYIDRM6GNJJS3P2OZRBEO4XEQU2CHZUOE262OYJQI",
    "secretKey": "SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "warning": "Keep this secret key secure. Never share it with anyone. Anyone with this key can access your wallet."
  }
}
```

**⚠️ Security Warning:**
- This endpoint returns sensitive information
- Only accessible by the authenticated wallet owner
- Store the secret key securely
- Never share it publicly or with anyone
- Anyone with this key has full access to your Stellar wallet

### 2.4 Get Balance (Specific Asset)
**Endpoint:** `GET /api/stellar/balance?asset=XLM`

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `asset` (optional): `XLM` or `USDC` (default: all assets)

**Response:**
```json
{
  "success": true,
  "data": {
    "asset": "XLM",
    "balance": "10000.0000000",
    "usdValue": 0
  }
}
```

### 2.5 Get All Balances
**Endpoint:** `GET /api/stellar/balances`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "balances": [
      {
        "asset": "XLM",
        "balance": "10000.0000000",
        "usdValue": 0
      },
      {
        "asset": "USDC",
        "balance": "50.0000000",
        "usdValue": 50
      }
    ],
    "totalUsdValue": 50
  }
}
```

### 2.6 Fund Wallet (Testnet Only)
**Endpoint:** `POST /api/stellar/fund`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Wallet funded successfully",
  "data": {
    "accountId": "GDFJ2AWYVAYUFPPTYIDRM6GNJJS3P2OZRBEO4XEQU2CHZUOE262OYJQI",
    "balance": "10000.0000000"
  }
}
```

### 2.7 Validate Stellar Address
**Endpoint:** `POST /api/stellar/validate-address`

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "address": "GDFJ2AWYVAYUFPPTYIDRM6GNJJS3P2OZRBEO4XEQU2CHZUOE262OYJQI"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "address": "GDFJ2AWYVAYUFPPTYIDRM6GNJJS3P2OZRBEO4XEQU2CHZUOE262OYJQI"
  }
}
```

---

## 3. Stellar M-Pesa Integration

### 3.1 Buy Crypto (M-Pesa → Stellar)
**Endpoint:** `POST /api/mpesa/buy-crypto`

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "phoneNumber": "+254759280875",
  "amount": 50,
  "chain": "stellar",
  "tokenSymbol": "USDC"
}
```

**Response:**
```json
{
  "success": true,
  "message": "M-Pesa STK Push initiated",
  "data": {
    "merchantRequestID": "12345-67890-12345",
    "checkoutRequestID": "ws_CO_123456789",
    "responseCode": "0",
    "responseDescription": "Success. Request accepted for processing",
    "escrowId": "escrow-uuid-here"
  }
}
```

**Note:** After M-Pesa payment, crypto is automatically sent to user's Stellar wallet.

### 3.2 Withdraw to M-Pesa (Stellar → M-Pesa)
**Endpoint:** `POST /api/mpesa/withdraw`

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "phoneNumber": "+254759280875",
  "amount": "20",
  "chain": "stellar",
  "tokenSymbol": "USDC"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Withdrawal initiated",
  "data": {
    "conversationId": "AG_20251104_123456789",
    "originatorConversationId": "originator-id",
    "escrowId": "escrow-uuid-here"
  }
}
```

### 3.3 Stellar-Specific Deposit (Alternative)
**Endpoint:** `POST /api/stellar-mpesa/deposit`

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "phoneNumber": "254759280875",
  "amountKES": 50,
  "asset": "USDC",
  "memo": "Optional memo"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "transactionId": "tx-uuid",
    "merchantRequestID": "12345-67890-12345",
    "checkoutRequestID": "ws_CO_123456789"
  }
}
```

### 3.4 Stellar-Specific Withdrawal (Alternative)
**Endpoint:** `POST /api/stellar-mpesa/withdraw`

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "phoneNumber": "254759280875",
  "amountAsset": "20",
  "asset": "USDC",
  "memo": "Optional memo"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "transactionId": "tx-uuid",
    "conversationId": "AG_20251104_123456789"
  }
}
```

### 3.5 Get Exchange Rates
**Endpoint:** `GET /api/stellar-mpesa/rates`

**Response:**
```json
{
  "success": true,
  "data": {
    "XLM": {
      "kes": 150.5,
      "usd": 0.12
    },
    "USDC": {
      "kes": 132.5,
      "usd": 1.0
    }
  }
}
```

### 3.6 Convert KES to Asset
**Endpoint:** `POST /api/stellar-mpesa/convert/kes-to-asset`

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "amountKES": 50,
  "asset": "USDC"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "amountKES": 50,
    "amountAsset": "0.377",
    "asset": "USDC",
    "rate": 132.5
  }
}
```

### 3.7 Convert Asset to KES
**Endpoint:** `POST /api/stellar-mpesa/convert/asset-to-kes`

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "amountAsset": "1.5",
  "asset": "USDC"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "amountAsset": "1.5",
    "amountKES": 198.75,
    "asset": "USDC",
    "rate": 132.5
  }
}
```

### 3.8 Get Transaction Status
**Endpoint:** `GET /api/stellar-mpesa/transaction/:transactionId`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "transactionId": "tx-uuid",
    "status": "completed",
    "type": "deposit",
    "amountKES": 50,
    "amountAsset": "0.377",
    "asset": "USDC",
    "stellarTransactionHash": "stellar-tx-hash",
    "mpesaReceiptNumber": "RB123456789",
    "createdAt": "2025-11-04T18:56:24.511Z",
    "completedAt": "2025-11-04T18:57:00.000Z"
  }
}
```

### 3.9 Get Transaction History
**Endpoint:** `GET /api/stellar-mpesa/transactions?limit=10`

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `limit` (optional): Number of transactions (1-100, default: 10)

**Response:**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "transactionId": "tx-uuid-1",
        "status": "completed",
        "type": "deposit",
        "amountKES": 50,
        "amountAsset": "0.377",
        "asset": "USDC",
        "createdAt": "2025-11-04T18:56:24.511Z"
      }
    ],
    "total": 1
  }
}
```

---

## 4. Stellar Token Operations

### 4.1 Send Stellar Payment
**Endpoint:** `POST /api/stellar/send`

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "toAccountId": "GDFJ2AWYVAYUFPPTYIDRM6GNJJS3P2OZRBEO4XEQU2CHZUOE262OYJQI",
  "amount": "10",
  "asset": "USDC",
  "memo": "Payment for services"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "transactionHash": "stellar-tx-hash-here",
    "transactionId": "tx-uuid",
    "amount": "10",
    "asset": "USDC",
    "recipient": "GDFJ2AWYVAYUFPPTYIDRM6GNJJS3P2OZRBEO4XEQU2CHZUOE262OYJQI",
    "fee": "0.00001",
    "status": "success"
  }
}
```

### 4.2 Send Token (Multi-Chain - Supports Stellar)
**Endpoint:** `POST /api/token/sendToken`

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "recipientIdentifier": "+254712345678",
  "amount": "10",
  "senderAddress": "0x31c41BCa835C0d3c597cbBaFf2e8dBF973645fb4",
  "chain": "stellar",
  "tokenSymbol": "USDC",
  "password": "user_password",
  "memo": "Optional memo"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Stellar payment sent successfully",
  "data": {
    "transactionHash": "stellar-tx-hash",
    "amount": 10,
    "asset": "USDC",
    "recipient": "GDFJ2AWYVAYUFPPTYIDRM6GNJJS3P2OZRBEO4XEQU2CHZUOE262OYJQI",
    "chain": "stellar"
  }
}
```

**Note:** `recipientIdentifier` can be:
- Stellar address (starts with `G`)
- Phone number (will lookup user's Stellar wallet)
- Email (will lookup user's Stellar wallet)

### 4.3 Get Transaction History
**Endpoint:** `GET /api/stellar/transactions?limit=10&cursor=optional`

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `limit` (optional): 1-100 (default: 10)
- `cursor` (optional): Pagination cursor

**Response:**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "tx-id",
        "hash": "stellar-tx-hash",
        "source": "sender-address",
        "destination": "recipient-address",
        "amount": "10",
        "asset": {
          "code": "USDC",
          "issuer": "issuer-address",
          "type": "credit_alphanum4"
        },
        "fee": "100",
        "memo": "Payment memo",
        "createdAt": "2025-11-04T18:56:24Z",
        "status": "success"
      }
    ],
    "nextCursor": "paging-token"
  }
}
```

### 4.4 Create Trustline
**Endpoint:** `POST /api/stellar/trustline`

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "assetCode": "USDC",
  "issuer": "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  "limit": "1000000"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "transactionHash": "stellar-tx-hash",
    "assetCode": "USDC",
    "issuer": "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
  }
}
```

### 4.5 Get Prices
**Endpoint:** `GET /api/stellar/prices?asset=USDC`

**Query Parameters:**
- `asset` (optional): `XLM` or `USDC`

**Response:**
```json
{
  "success": true,
  "data": {
    "XLM": {
      "usd": 0.12,
      "kes": 150.5
    },
    "USDC": {
      "usd": 1.0,
      "kes": 132.5
    }
  }
}
```

### 4.6 Get Network Info
**Endpoint:** `GET /api/stellar/network`

**Response:**
```json
{
  "success": true,
  "data": {
    "network": "testnet",
    "horizonUrl": "https://horizon-testnet.stellar.org",
    "baseFee": 100,
    "minBalance": 0.5,
    "version": "20.0.0"
  }
}
```

---

## 5. Stellar Advanced Features

### 5.1 Create Multi-Signature Wallet
**Endpoint:** `POST /api/stellar-advanced/multisig`

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "signers": [
    {
      "publicKey": "GDFJ2AWYVAYUFPPTYIDRM6GNJJS3P2OZRBEO4XEQU2CHZUOE262OYJQI",
      "weight": 1
    }
  ],
  "threshold": {
    "low": 1,
    "medium": 1,
    "high": 1
  }
}
```

### 5.2 Get Multi-Signature Wallets
**Endpoint:** `GET /api/stellar-advanced/multisig`

**Headers:**
```
Authorization: Bearer <token>
```

### 5.3 Create Payment Channel
**Endpoint:** `POST /api/stellar-advanced/payment-channel`

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "destinationAccountId": "recipient-address",
  "asset": "USDC",
  "amount": "1000",
  "durationHours": 24
}
```

### 5.4 Execute Channel Payment
**Endpoint:** `POST /api/stellar-advanced/payment-channel/:channelId/pay`

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "amount": "10",
  "memo": "Channel payment"
}
```

### 5.5 Get Payment Channels
**Endpoint:** `GET /api/stellar-advanced/payment-channels`

**Headers:**
```
Authorization: Bearer <token>
```

### 5.6 Get Asset Info
**Endpoint:** `GET /api/stellar-advanced/asset-info?assetCode=USDC&issuer=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`

**Query Parameters:**
- `assetCode`: Asset code (required)
- `issuer`: Issuer address (optional for native XLM)

### 5.7 Create Swap Offer
**Endpoint:** `POST /api/stellar-advanced/swap-offer`

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "fromAsset": "XLM",
  "toAsset": "USDC",
  "fromAmount": "100",
  "toAmount": "12",
  "expiresInHours": 24
}
```

### 5.8 Get Swap Offers
**Endpoint:** `GET /api/stellar-advanced/swap-offers?fromAsset=XLM&toAsset=USDC&limit=10`

**Query Parameters:**
- `fromAsset` (optional)
- `toAsset` (optional)
- `limit` (optional): 1-100

### 5.9 Execute Swap
**Endpoint:** `POST /api/stellar-advanced/swap/:offerId/execute`

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "userAccountId": "user-stellar-address",
  "amount": "100"
}
```

### 5.10 Get Network Stats
**Endpoint:** `GET /api/stellar-advanced/network-stats`

**Response:**
```json
{
  "success": true,
  "data": {
    "ledgerNumber": 1416546,
    "baseFee": 100,
    "baseReserve": 0.5,
    "protocolVersion": 20
  }
}
```

### 5.11 Create Time-Locked Payment
**Endpoint:** `POST /api/stellar-advanced/time-locked-payment`

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "toAccountId": "recipient-address",
  "amount": "100",
  "asset": "USDC",
  "unlockTime": "2025-12-31T23:59:59Z",
  "memo": "Time-locked payment"
}
```

---

## 6. Multi-Chain Endpoints (Supporting Stellar)

### 6.1 Get User Balance (Multi-Chain)
**Endpoint:** `GET /api/token/balance?chain=stellar&tokenSymbol=USDC`

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `chain`: `stellar`
- `tokenSymbol`: `XLM` or `USDC`

**Response:**
```json
{
  "success": true,
  "data": {
    "chain": "stellar",
    "tokenSymbol": "USDC",
    "balance": "50.0000000",
    "formattedBalance": "50.00"
  }
}
```

### 6.2 Get User Balance by Chain
**Endpoint:** `GET /api/token/balance-by-chain?chain=stellar`

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `chain`: `stellar`

**Response:**
```json
{
  "success": true,
  "data": {
    "chain": "stellar",
    "balances": [
      {
        "tokenSymbol": "XLM",
        "balance": "10000.0000000",
        "formattedBalance": "10000.00"
      },
      {
        "tokenSymbol": "USDC",
        "balance": "50.0000000",
        "formattedBalance": "50.00"
      }
    ]
  }
}
```

### 6.3 Liquidity Check
**Endpoint:** `GET /api/mpesa/liquidity-check/USDC/stellar`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tokenType": "USDC",
    "chain": "stellar",
    "platformBalance": 1000.5,
    "maxKesAmount": 132500,
    "conversionRate": 132.5,
    "hasLiquidity": true,
    "alternativeOptions": []
  }
}
```

---

## 🔐 Authentication

All protected endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer <token>
```

The token is obtained from:
- `POST /api/auth/login/verify` (after OTP verification)

---

## 📝 Important Notes

1. **Stellar Wallet Auto-Creation**: Stellar wallets are automatically created on login/registration if they don't exist.

2. **Testnet vs Mainnet**: 
   - Default: Testnet
   - Set `STELLAR_NETWORK=mainnet` in environment for production
   - Testnet accounts can be funded via `/api/stellar/fund`

3. **Supported Assets**: 
   - `XLM` (native)
   - `USDC` (requires trustline, auto-created on first use)

4. **Phone Number Format**: 
   - M-Pesa endpoints: `254XXXXXXXXX` (no +)
   - Other endpoints: `+254XXXXXXXXX` (with +)

5. **Transaction Fees**: 
   - Stellar transactions cost ~0.00001 XLM per operation
   - Users must have XLM balance for fees
   - Fees are deducted automatically from sender's wallet

6. **Memo Field**: 
   - Optional for all payments
   - Max 28 characters
   - Used for transaction identification

7. **Error Handling**: 
   - All endpoints return consistent error format:
   ```json
   {
     "success": false,
     "message": "Error message",
     "error": {
       "code": "ERROR_CODE",
       "message": "Detailed error message"
     }
   }
   ```

---

## 🔗 Stellar Explorer Links

**Testnet:**
- Account: `https://stellar.expert/explorer/testnet/account/{accountId}`
- Transaction: `https://stellar.expert/explorer/testnet/tx/{transactionHash}`

**Mainnet:**
- Account: `https://stellar.expert/explorer/mainnet/account/{accountId}`
- Transaction: `https://stellar.expert/explorer/mainnet/tx/{transactionHash}`

---

## 📚 Example Frontend Integration Flow

### Complete Buy Crypto Flow (M-Pesa → Stellar USDC):

```javascript
// 1. Login
const loginResponse = await fetch('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ phoneNumber: '+254759280875', password: 'password' })
});

// 2. Verify OTP
const verifyResponse = await fetch('/api/auth/login/verify', {
  method: 'POST',
  body: JSON.stringify({ phoneNumber: '+254759280875', otp: '123456' })
});
const { token, wallets } = await verifyResponse.json();
// wallets.stellar contains the Stellar wallet address

// 3. Buy Crypto
const buyResponse = await fetch('/api/mpesa/buy-crypto', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({
    phoneNumber: '+254759280875',
    amount: 50,
    chain: 'stellar',
    tokenSymbol: 'USDC'
  })
});
// User receives M-Pesa STK Push, pays, crypto automatically sent to wallets.stellar

// 4. Check Balance
const balanceResponse = await fetch('/api/stellar/balances', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

---

**Last Updated:** November 4, 2025
**Version:** 1.0.0

