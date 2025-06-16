# NexusPay Platform Wallet API

## Overview
The NexusPay platform wallet system manages fee collection across multiple blockchains and provides liquidity provision with real-time yield calculation.

## Platform Fee Wallet
**Address**: `0x2b0B97EA7922E9CF5ef689A211F75B1E67A261Bf` (Multi-chain smart wallet)

This wallet automatically collects fees from:
- Ramp transactions (Mobile Money, M-Pesa)
- Crypto swaps
- Transfer fees
- Merchant payments

## Supported Chains
- **Arbitrum** (Primary): `https://arb1.arbitrum.io/rpc`
- **Polygon**: `https://polygon-rpc.com`
- **Base**: `https://mainnet.base.org`
- **Optimism**: `https://mainnet.optimism.io`
- **Celo**: `https://forno.celo.org`
- **Avalanche**: `https://api.avax.network/ext/bc/C/rpc`
- **BNB Chain**: `https://bsc-dataseed.binance.org`
- **Fantom**: `https://rpc.ftm.tools`

## API Endpoints

### 1. Get Platform Wallet Balance
```http
GET /api/platform-wallet/balance/:token?chain=arbitrum
Authorization: Bearer <token>
```

**Example:**
```bash
curl -X GET "https://api.nexuspay.com/api/platform-wallet/balance/USDC?chain=arbitrum" \
  -H "Authorization: Bearer your_jwt_token"
```

**Response:**
```json
{
  "success": true,
  "message": "Balance retrieved successfully",
  "data": {
    "token": "USDC",
    "chain": "arbitrum",
    "balance": 6.43
  }
}
```

### 2. Get Platform Wallet Status
```http
GET /api/platform-wallet/status?chain=arbitrum
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Platform wallet status retrieved successfully",
  "data": {
    "chain": "arbitrum",
    "main": {
      "address": "0x2b0B97EA7922E9CF5ef689A211F75B1E67A261Bf",
      "balance": 6.43
    },
    "fees": {
      "address": "0x...",
      "balance": 2.15
    }
  }
}
```

### 3. Get All Balances
```http
GET /api/platform-wallet/balances
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "All balances retrieved successfully",
  "data": {
    "arbitrum": {
      "USDC": 6.43,
      "USDT": 0,
      "DAI": 0,
      "WETH": 0,
      "WBTC": 0
    },
    "polygon": {
      "USDC": 0,
      "USDT": 0,
      "DAI": 0,
      "WETH": 0,
      "WBTC": 0
    }
  }
}
```

### 4. Withdraw Fees (Admin Only)
```http
POST /api/platform-wallet/withdraw
Authorization: Bearer <admin_token>

{
  "token": "USDC",
  "amount": 1000,
  "toAddress": "0x...",
  "primaryKey": "admin_private_key_1",
  "secondaryKey": "admin_private_key_2",
  "chain": "arbitrum"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Withdrawal completed successfully",
  "data": {
    "txHash": "0x...",
    "chain": "arbitrum",
    "token": "USDC",
    "amount": 1000,
    "toAddress": "0x..."
  }
}
```

## Liquidity Provision API

### 1. Provide Liquidity (Real Funds)
```http
POST /api/liquidity/provide
Authorization: Bearer <token>

{
  "token": "USDC",
  "amount": 10000,
  "duration": 168,
  "chain": "arbitrum"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Liquidity provided successfully",
  "data": {
    "positionId": "pos_123...",
    "token": "USDC",
    "amount": 10000,
    "duration": 168,
    "expectedYield": {
      "baseRate": 5.0,
      "durationBonus": 2.0,
      "amountBonus": 1.0,
      "utilizationBonus": 2.0,
      "totalRate": 10.0,
      "weeklyYield": 95.89
    },
    "lockUntil": "2024-03-22T10:30:00Z"
  }
}
```

### 2. Get Liquidity Positions
```http
GET /api/liquidity/positions
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Liquidity positions retrieved successfully",
  "data": [
    {
      "positionId": "pos_123...",
      "token": "USDC",
      "amount": 10000,
      "yieldEarned": 95.89,
      "currentYield": 10.0,
      "utilizationRate": 75,
      "lockUntil": "2024-03-22T10:30:00Z",
      "canWithdraw": false,
      "timeRemaining": "5 days 12 hours"
    }
  ]
}
```

### 3. Withdraw Liquidity
```http
POST /api/liquidity/withdraw
Authorization: Bearer <token>

{
  "positionId": "pos_123...",
  "amount": 10000
}
```

**Response:**
```json
{
  "success": true,
  "message": "Liquidity withdrawn successfully",
  "data": {
    "positionId": "pos_123...",
    "withdrawnAmount": 10000,
    "yieldEarned": 95.89,
    "totalReceived": 10095.89,
    "txHash": "0x...",
    "remainingBalance": 0
  }
}
```

## Fee Collection System

### Transaction Fees
All fees are automatically collected to the platform wallet:

1. **Ramp Fees**:
   - Mobile Money: 0.6% - 1.5%
   - M-Pesa: 0.5% - 1.2%

2. **Swap Fees**: 0.15% - 0.5%

3. **Transfer Fees**: $0.20 - $1.00 (fixed)

4. **Merchant Payment Fees**: 0.05% - 0.15%

### Fee Collection Flow
```javascript
// Example: Ramp transaction with fee collection
const rampResult = await axios.post('/api/ramp/transaction', {
  type: 'ON_RAMP',
  paymentMethod: 'MPESA',
  fiatAmount: 1000,
  cryptoToken: 'USDC',
  chain: 'arbitrum'
});

// Fee is automatically calculated and collected
// Platform wallet receives: 1000 * 0.8% = 8 USDC
// User receives: 992 USDC
```

## Yield Calculation

### Base Rates
- **USDC/USDT**: 5.0% APY
- **DAI**: 5.5% APY
- **WBTC**: 3.0% APY
- **WETH**: 4.0% APY
- **ARB**: 6.0% APY

### Bonuses
1. **Duration Bonus**:
   - 36h+: +0.5% APY
   - 72h+: +1.0% APY
   - 1 week+: +2.0% APY
   - 1 month+: +3.0% APY
   - 3 months+: +5.0% APY

2. **Amount Bonus**:
   - $10k+: +0.5% APY
   - $50k+: +1.0% APY
   - $100k+: +2.0% APY
   - $500k+: +3.0% APY

3. **Utilization Bonus**:
   - 50%+: +1.0% APY
   - 75%+: +2.0% APY
   - 90%+: +3.0% APY

### Example Calculation
```
Amount: $50,000 USDC
Duration: 1 week (168 hours)
Utilization: 75%

Base Rate: 5.0%
Duration Bonus: +2.0% (1 week+)
Amount Bonus: +1.0% ($50k+)
Utilization Bonus: +2.0% (75%+)
Total APY: 10.0%

Weekly Yield: $50,000 * 10.0% * (7/365) = $95.89
```

## Security Features

1. **Multi-Signature Wallet**: Requires 2 admin signatures for withdrawals
2. **Real-Time Balance Verification**: Prevents overdrafts
3. **Transaction Monitoring**: All transactions are logged and monitored
4. **Rate Limiting**: API endpoints are rate-limited
5. **Authentication**: All endpoints require valid JWT tokens

## Testing with Real Funds

### Setup
1. Fund your wallet with test tokens on Arbitrum
2. Get API access token
3. Use the liquidity provision endpoints

### Example Test Flow
```bash
# 1. Check platform wallet balance
curl -X GET "https://api.nexuspay.com/api/platform-wallet/balance/USDC?chain=arbitrum" \
  -H "Authorization: Bearer your_token"

# 2. Provide liquidity
curl -X POST "https://api.nexuspay.com/api/liquidity/provide" \
  -H "Authorization: Bearer your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "USDC",
    "amount": 100,
    "duration": 72,
    "chain": "arbitrum"
  }'

# 3. Check positions
curl -X GET "https://api.nexuspay.com/api/liquidity/positions" \
  -H "Authorization: Bearer your_token"

# 4. Withdraw after lock period
curl -X POST "https://api.nexuspay.com/api/liquidity/withdraw" \
  -H "Authorization: Bearer your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "positionId": "pos_123...",
    "amount": 100
  }'
```

## Environment Variables
```bash
# Platform Wallet
PLATFORM_FEE_WALLET_ADDRESS=0x2b0B97EA7922E9CF5ef689A211F75B1E67A261Bf
DEV_PLATFORM_WALLET_PRIVATE_KEY=your_controlling_eoa_private_key

# Chain RPCs
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
POLYGON_RPC_URL=https://polygon-rpc.com
BASE_RPC_URL=https://mainnet.base.org
OPTIMISM_RPC_URL=https://mainnet.optimism.io
CELO_RPC_URL=https://forno.celo.org

# Redis
REDIS_URL=redis://localhost:6379

# MongoDB
MONGODB_URI=mongodb://localhost:27017/nexuspay
```

## Error Handling
All endpoints return standardized error responses:
```json
{
  "success": false,
  "message": "Error description",
  "error": {
    "code": "ERROR_CODE",
    "message": "Detailed error message"
  }
}
```

Common error codes:
- `INSUFFICIENT_BALANCE`: Not enough balance for operation
- `INVALID_DURATION`: Lock duration below minimum (36 hours)
- `POSITION_LOCKED`: Cannot withdraw before lock expiry
- `UNSUPPORTED_CHAIN`: Chain not supported
- `UNSUPPORTED_TOKEN`: Token not supported on specified chain 