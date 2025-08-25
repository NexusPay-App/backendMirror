# NexusPay Wallet & Crypto Endpoints

**Base URL:** `http://localhost:8000`

## 💰 Core Wallet Operations

### Send & Receive Crypto
```
POST /api/token/sendToken          # Send crypto to another wallet
POST /api/token/pay               # Pay merchant with crypto
GET  /api/token/tokenTransferEvents # Get transfer history
GET  /api/token/receive           # Get receive info (wallet address, phone, email, chains)
GET  /api/token/balance           # Get user wallet balance across all chains

```

## 📥 Receive Crypto Endpoint

**Endpoint:** `GET http://localhost:8000/api/token/receive`

**Authentication:** Requires `enforceStrictAuth` (OTP verification)

**Response:**
```json
{
  "success": true,
  "message": "Receive information retrieved successfully",
  "data": {
    "walletAddress": "0x...",
    "phoneNumber": "+254XXXXXXXXX",
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

## 💰 User Balance Endpoint

**Endpoint:** `GET http://localhost:8000/api/token/balance`

**Authentication:** Requires `enforceStrictAuth` (OTP verification)

**Response:**
```json
{
  "success": true,
  "message": "User balance retrieved successfully",
  "data": {
    "walletAddress": "0x31c41BCa835C0d3c597cbBaFf2e8dBF973645fb4",
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
    "lastUpdated": "2025-08-25T12:52:00.000Z"
  }
}
```

### Wallet Management
```
POST /api/token/unify             # Unify wallet accounts
POST /api/token/migrate           # Migrate wallet
```

## 🔄 Crypto On/Off Ramp (M-Pesa Integration)

### Fiat to Crypto (On-Ramp)
```
POST /api/mpesa/deposit           # Deposit KES via M-Pesa, get crypto
POST /api/mpesa/buy-crypto        # Buy crypto with M-Pesa
```

### Crypto to Fiat (Off-Ramp)
```
POST /api/mpesa/withdraw          # Convert crypto to KES, withdraw via M-Pesa
```

### Crypto Spending (Pay Bills with Crypto)
```
POST /api/mpesa/pay/paybill       # Pay paybill with crypto
POST /api/mpesa/pay/till          # Pay till number with crypto
POST /api/mpesa/pay-with-crypto   # Enhanced crypto payment system
```

### Transaction Management
```
GET  /api/mpesa/transaction/:id   # Get M-Pesa transaction status
POST /api/mpesa/submit-receipt    # Submit manual receipt
GET  /api/mpesa/pending-interventions # Get failed transactions
```

## 📊 Platform Wallet Operations

### Wallet Status & Balances
```
GET /api/platform-wallet/status   # Get platform wallet status
GET /api/platform-wallet/balance/:token # Get specific token balance
GET /api/platform-wallet/balances # Get all token balances
```

### Admin Operations
```
POST /api/platform-wallet/withdraw # Withdraw fees (admin)
POST /api/platform-wallet/transfer # Transfer fees (admin)
```

## 🏦 Liquidity Operations

### Liquidity Management
```
POST /api/liquidity/provide       # Provide liquidity
GET  /api/liquidity/positions     # Get liquidity positions
GET  /api/liquidity/stats/:token  # Get liquidity stats
```

### Liquidity Withdrawal
```
POST /api/liquidity/withdraw/initiate # Initiate withdrawal
POST /api/liquidity/withdraw/confirm  # Confirm withdrawal
DELETE /api/liquidity/position/:id    # Delete position
```

## 🌉 Ramp Services

### Transaction Management
```
POST /api/ramp/transaction        # Create ramp transaction
GET  /api/ramp/transactions       # Get user transactions
GET  /api/ramp/stats             # Get transaction stats
POST /api/ramp/calculate-savings  # Calculate potential savings
```

## 📈 Transaction History & Analytics

### Transaction History
```
GET /api/transactions/history     # Get transaction history with filters
GET /api/transactions/:id         # Get transaction by ID
GET /api/transactions/dashboard/insights # Get dashboard insights
```

## 📋 Complete Endpoint List with Full URLs

### Core Crypto Operations
- **Send Crypto:** `http://localhost:8000/api/token/sendToken`
- **Pay Merchant:** `http://localhost:8000/api/token/pay`
- **Transfer Events:** `http://localhost:8000/api/token/tokenTransferEvents`
- **Receive Info:** `http://localhost:8000/api/token/receive`
- **User Balance:** `http://localhost:8000/api/token/balance`
- **Setup Wallet:** `http://localhost:8000/api/token/setup-wallet`
- **Unify Accounts:** `http://localhost:8000/api/token/unify`
- **Migrate Wallet:** `http://localhost:8000/api/token/migrate`

### M-Pesa Crypto Bridge
- **Buy Crypto:** `http://localhost:8000/api/mpesa/buy-crypto`
- **Deposit (M-Pesa → Crypto):** `http://localhost:8000/api/mpesa/deposit`
- **Withdraw (Crypto → M-Pesa):** `http://localhost:8000/api/mpesa/withdraw`
- **Pay Paybill with Crypto:** `http://localhost:8000/api/mpesa/pay/paybill`
- **Pay Till with Crypto:** `http://localhost:8000/api/mpesa/pay/till`
- **Enhanced Crypto Payment:** `http://localhost:8000/api/mpesa/pay-with-crypto`

### Platform Wallet Management
- **Wallet Status:** `http://localhost:8000/api/platform-wallet/status`
- **Token Balance:** `http://localhost:8000/api/platform-wallet/balance/:token`
- **All Balances:** `http://localhost:8000/api/platform-wallet/balances`
- **Withdraw Fees:** `http://localhost:8000/api/platform-wallet/withdraw`
- **Transfer Fees:** `http://localhost:8000/api/platform-wallet/transfer`

### Liquidity Operations
- **Provide Liquidity:** `http://localhost:8000/api/liquidity/provide`
- **Get Positions:** `http://localhost:8000/api/liquidity/positions`
- **Liquidity Stats:** `http://localhost:8000/api/liquidity/stats/:token`
- **Initiate Withdrawal:** `http://localhost:8000/api/liquidity/withdraw/initiate`
- **Confirm Withdrawal:** `http://localhost:8000/api/liquidity/withdraw/confirm`

### Ramp Services
- **Create Transaction:** `http://localhost:8000/api/ramp/transaction`
- **Get Transactions:** `http://localhost:8000/api/ramp/transactions`
- **Transaction Stats:** `http://localhost:8000/api/ramp/stats`
- **Calculate Savings:** `http://localhost:8000/api/ramp/calculate-savings`

### Transaction Analytics
- **Transaction History:** `http://localhost:8000/api/transactions/history`
- **Get Transaction:** `http://localhost:8000/api/transactions/:id`
- **Dashboard Insights:** `http://localhost:8000/api/transactions/dashboard/insights`

## 🔐 Authentication Requirements

- **Strict Auth:** Most crypto operations require `enforceStrictAuth` (OTP verification)
- **Basic Auth:** Some read operations require standard `authenticate`
- **Admin Auth:** Platform wallet operations require admin privileges

## 🌐 Supported Chains & Tokens

**Chains:** Celo, Polygon, Arbitrum, Base, Optimism, Ethereum, BNB, Avalanche, Fantom, Gnosis, Scroll, Moonbeam, Fuse, Aurora, Lisk, Somnia

**Tokens:** USDC, USDT, BTC, ETH, WETH, WBTC, DAI, CELO

## 📝 Key Features

- **Multi-chain support** across 15+ blockchains
- **M-Pesa integration** for seamless fiat on/off ramp
- **Crypto bill payments** (paybills & till numbers)
- **Liquidity provision** with yield farming
- **Real-time transaction tracking**
- **Comprehensive analytics** and insights
- **Rate limiting** and security protections