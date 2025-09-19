# 🌟 NexusPay Stellar API Documentation

## Base URL
```
https://your-domain.com/api
```

## Authentication
All Stellar endpoints require authentication using JWT tokens in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

---

## 📱 Basic Stellar Operations

### Create Wallet
Create a new Stellar wallet for the authenticated user.

**Endpoint:** `POST /stellar/wallet`

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Response:**
```json
{
  "success": true,
  "message": "Stellar wallet created successfully",
  "data": {
    "accountId": "GABC123...",
    "balances": [
      {
        "asset": "XLM",
        "balance": "0.0000000",
        "usdValue": 0
      }
    ],
    "isActive": true,
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

### Get Wallet Information
Retrieve the user's Stellar wallet information.

**Endpoint:** `GET /stellar/wallet`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Wallet information retrieved successfully",
  "data": {
    "accountId": "GABC123...",
    "balances": [
      {
        "asset": "XLM",
        "balance": "100.0000000",
        "usdValue": 10.50
      },
      {
        "asset": "USDC",
        "balance": "50.0000000",
        "usdValue": 50.00
      }
    ],
    "sequence": "123456789",
    "isActive": true,
    "createdAt": "2024-01-15T10:30:00Z",
    "lastActivity": "2024-01-15T12:45:00Z"
  }
}
```

### Get Balance
Get wallet balance for a specific asset.

**Endpoint:** `GET /stellar/balance`

**Query Parameters:**
- `asset` (optional): Asset code (default: "XLM")

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Balance retrieved successfully",
  "data": {
    "asset": "XLM",
    "balance": "100.0000000",
    "usdValue": 10.50,
    "timestamp": "2024-01-15T12:45:00Z"
  }
}
```

### Send Payment
Send a payment to another Stellar address.

**Endpoint:** `POST /stellar/send`

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "toAccountId": "GDEF456...",
  "amount": "10.5",
  "asset": "XLM",
  "memo": "Payment for services"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment sent successfully",
  "data": {
    "transactionId": "uuid-here",
    "transactionHash": "abc123...",
    "status": "success",
    "fee": "100",
    "timestamp": "2024-01-15T12:45:00Z"
  }
}
```

### Get Transaction History
Retrieve transaction history for the user's wallet.

**Endpoint:** `GET /stellar/transactions`

**Query Parameters:**
- `limit` (optional): Number of transactions to return (default: 10, max: 100)
- `cursor` (optional): Pagination cursor

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Transaction history retrieved successfully",
  "data": {
    "transactions": [
      {
        "id": "tx-123",
        "hash": "abc123...",
        "source": "GABC123...",
        "destination": "GDEF456...",
        "amount": "10.5",
        "asset": {
          "code": "XLM",
          "issuer": null,
          "type": "native"
        },
        "fee": "100",
        "memo": "Payment for services",
        "createdAt": "2024-01-15T12:45:00Z",
        "status": "success"
      }
    ],
    "nextCursor": "cursor-here"
  }
}
```

---

## 💰 Stellar MPESA Integration

### Initiate Deposit
Initiate a deposit from MPESA to Stellar wallet.

**Endpoint:** `POST /stellar-mpesa/deposit`

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "phoneNumber": "254712345678",
  "amountKES": 1000,
  "asset": "XLM",
  "memo": "Deposit to wallet"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Deposit initiated successfully",
  "data": {
    "transactionId": "deposit-123",
    "status": "pending",
    "message": "Deposit initiated. You will receive 0.65 XLM for 1000 KES"
  }
}
```

### Initiate Withdrawal
Initiate a withdrawal from Stellar wallet to MPESA.

**Endpoint:** `POST /stellar-mpesa/withdraw`

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "phoneNumber": "254712345678",
  "amountAsset": "1.5",
  "asset": "XLM",
  "memo": "Withdrawal to MPESA"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Withdrawal initiated successfully",
  "data": {
    "transactionId": "withdraw-123",
    "status": "pending",
    "message": "Withdrawal initiated. You will receive 1500 KES for 1.5 XLM"
  }
}
```

### Get Exchange Rates
Get current exchange rates between KES and Stellar assets.

**Endpoint:** `GET /stellar-mpesa/rates`

**Response:**
```json
{
  "success": true,
  "message": "Exchange rates retrieved successfully",
  "data": {
    "kesToUsd": 0.0065,
    "xlmPrice": 0.1,
    "usdcPrice": 1.0,
    "lastUpdated": "2024-01-15T12:45:00Z"
  }
}
```

### Convert Currency
Convert between KES and Stellar assets.

**Endpoint:** `POST /stellar-mpesa/convert/kes-to-asset`

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "amountKES": 1000,
  "asset": "XLM"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Currency conversion completed successfully",
  "data": {
    "amountKES": 1000,
    "amountAsset": "0.65",
    "asset": "XLM",
    "exchangeRate": 1538.46,
    "usdValue": 6.5,
    "timestamp": "2024-01-15T12:45:00Z"
  }
}
```

---

## 🔐 Advanced Features

### Create Multi-Signature Wallet
Create a multi-signature wallet for enhanced security.

**Endpoint:** `POST /stellar-advanced/multisig`

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "signers": [
    {
      "publicKey": "GABC123...",
      "weight": 1
    },
    {
      "publicKey": "GDEF456...",
      "weight": 1
    }
  ],
  "threshold": {
    "low": 1,
    "medium": 2,
    "high": 2
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Multi-signature wallet created successfully",
  "data": {
    "id": "multisig-123",
    "accountId": "GMULTI123...",
    "signers": [
      {
        "publicKey": "GABC123...",
        "weight": 1
      },
      {
        "publicKey": "GDEF456...",
        "weight": 1
      }
    ],
    "threshold": {
      "low": 1,
      "medium": 2,
      "high": 2
    },
    "createdAt": "2024-01-15T12:45:00Z",
    "isActive": true
  }
}
```

### Create Payment Channel
Create a payment channel for instant, low-cost payments.

**Endpoint:** `POST /stellar-advanced/payment-channel`

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "destinationAccountId": "GDEF456...",
  "asset": "XLM",
  "amount": "100",
  "durationHours": 24
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment channel created successfully",
  "data": {
    "id": "channel-123",
    "sourceAccount": "GABC123...",
    "destinationAccount": "GDEF456...",
    "asset": "XLM",
    "amount": "100",
    "sequence": "123456790",
    "createdAt": "2024-01-15T12:45:00Z",
    "expiresAt": "2024-01-16T12:45:00Z",
    "status": "active"
  }
}
```

### Get Asset Information
Get detailed information about a Stellar asset.

**Endpoint:** `GET /stellar-advanced/asset-info`

**Query Parameters:**
- `assetCode` (required): Asset code (e.g., "XLM", "USDC")
- `issuer` (optional): Asset issuer address

**Response:**
```json
{
  "success": true,
  "message": "Asset information retrieved successfully",
  "data": {
    "code": "USDC",
    "issuer": "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    "type": "credit_alphanum4",
    "name": "USD Coin",
    "description": "USD Coin on Stellar",
    "image": "https://example.com/usdc.png",
    "totalSupply": "1000000000",
    "circulatingSupply": "500000000",
    "isVerified": true
  }
}
```

### Create Swap Offer
Create a swap offer on the Stellar DEX.

**Endpoint:** `POST /stellar-advanced/swap-offer`

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "fromAsset": "XLM",
  "toAsset": "USDC",
  "fromAmount": "100",
  "toAmount": "10",
  "expiresInHours": 24
}
```

**Response:**
```json
{
  "success": true,
  "message": "Swap offer created successfully",
  "data": {
    "id": "swap-123",
    "fromAsset": "XLM",
    "toAsset": "USDC",
    "fromAmount": "100",
    "toAmount": "10",
    "price": 0.1,
    "expiresAt": "2024-01-16T12:45:00Z",
    "status": "active",
    "creator": "GABC123...",
    "createdAt": "2024-01-15T12:45:00Z"
  }
}
```

### Get Network Statistics
Get Stellar network statistics.

**Endpoint:** `GET /stellar-advanced/network-stats`

**Response:**
```json
{
  "success": true,
  "message": "Network statistics retrieved successfully",
  "data": {
    "totalAccounts": 1000000,
    "totalTransactions": 50000000,
    "totalOperations": 200000000,
    "totalAssets": 5000,
    "networkFee": 100,
    "baseReserve": 5000000
  }
}
```

---

## ❌ Error Responses

All endpoints return consistent error responses:

```json
{
  "success": false,
  "message": "Error description",
  "data": null,
  "error": {
    "code": "ERROR_CODE",
    "message": "Detailed error message"
  }
}
```

### Common Error Codes

- `AUTH_REQUIRED` - Authentication required
- `VALIDATION_ERROR` - Invalid request parameters
- `WALLET_NOT_FOUND` - Stellar wallet not found
- `INSUFFICIENT_BALANCE` - Insufficient balance for transaction
- `INVALID_ADDRESS` - Invalid Stellar address
- `NETWORK_ERROR` - Stellar network error
- `TRANSACTION_FAILED` - Transaction failed

---

## 📊 Rate Limits

- **Wallet Operations**: 100 requests per minute
- **Payment Operations**: 50 requests per minute
- **Price Data**: 200 requests per minute
- **Advanced Features**: 20 requests per minute

---

## 🔒 Security Notes

1. **Private Keys**: Never expose private keys in API responses
2. **Authentication**: All endpoints require valid JWT tokens
3. **Validation**: All input parameters are validated
4. **Rate Limiting**: Implemented to prevent abuse
5. **HTTPS**: Use HTTPS in production environments

---

## 📝 Testing

### Testnet Usage
For testing, use the Stellar testnet:
- Set `STELLAR_NETWORK=testnet` in environment variables
- Use testnet addresses for testing
- Fund accounts using the friendbot service

### Example Test Addresses
```
Testnet XLM: GABC123... (funded with friendbot)
Testnet USDC: GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN
```

---

## 🚀 Getting Started

1. **Install Dependencies**: `npm install stellar-sdk`
2. **Configure Environment**: Set up Stellar environment variables
3. **Create Wallet**: Use the wallet creation endpoint
4. **Fund Wallet**: Use friendbot for testnet funding
5. **Start Transacting**: Begin with small test transactions

For more detailed information, see the [Stellar Integration Guide](./STELLAR_INTEGRATION_GUIDE.md).
