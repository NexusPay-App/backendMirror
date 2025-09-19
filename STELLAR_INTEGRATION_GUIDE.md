# 🌟 NexusPay Stellar Integration Guide

## Overview

This guide provides comprehensive documentation for the Stellar blockchain integration in NexusPay. The integration includes wallet management, payment processing, MPESA integration, and advanced features like multi-signature wallets and payment channels.

## 🏗️ Architecture

### Core Components

1. **Stellar Service** (`src/services/stellar.ts`) - Core Stellar network operations
2. **Stellar Wallet Service** (`src/services/stellarWallet.ts`) - User wallet management
3. **Stellar Price Service** (`src/services/stellarPrice.ts`) - Real-time price data
4. **Stellar MPESA Service** (`src/services/stellarMpesa.ts`) - MPESA integration
5. **Stellar Advanced Service** (`src/services/stellarAdvanced.ts`) - Advanced features

### API Endpoints

#### Basic Stellar Operations
- `POST /api/stellar/wallet` - Create wallet
- `GET /api/stellar/wallet` - Get wallet info
- `GET /api/stellar/balance` - Get balance
- `POST /api/stellar/send` - Send payment
- `GET /api/stellar/transactions` - Transaction history

#### Stellar MPESA Integration
- `POST /api/stellar-mpesa/deposit` - Deposit via MPESA
- `POST /api/stellar-mpesa/withdraw` - Withdraw to MPESA
- `GET /api/stellar-mpesa/rates` - Exchange rates
- `POST /api/stellar-mpesa/convert/kes-to-asset` - Currency conversion

#### Advanced Features
- `POST /api/stellar-advanced/multisig` - Create multi-sig wallet
- `POST /api/stellar-advanced/payment-channel` - Create payment channel
- `GET /api/stellar-advanced/asset-info` - Asset information
- `POST /api/stellar-advanced/swap-offer` - Create swap offer

## 🔧 Setup Instructions

### 1. Environment Configuration

Add the following to your `.env` file:

```bash
# Stellar Configuration
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL_TESTNET=https://horizon-testnet.stellar.org
STELLAR_HORIZON_URL_MAINNET=https://horizon.stellar.org
STELLAR_FRIENDBOT_URL=https://friendbot.stellar.org
STELLAR_USDC_ISSUER_TESTNET=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN
STELLAR_USDC_ISSUER_MAINNET=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN
STELLAR_PLATFORM_WALLET_SECRET=your_platform_wallet_secret_key_here
STELLAR_XLM_ASSET_CODE=XLM
STELLAR_USDC_ASSET_CODE=USDC
```

### 2. Install Dependencies

```bash
npm install stellar-sdk
```

### 3. Database Schema Updates

Add Stellar wallet fields to your User model:

```typescript
interface IUser {
  // ... existing fields
  stellarWallet?: {
    accountId: string;
    secretKey: string; // Encrypted
    createdAt: Date;
    isActive: boolean;
  };
  stellarMultiSigWallets?: Array<{
    id: string;
    accountId: string;
    signers: Array<{ publicKey: string; weight: number }>;
    threshold: { low: number; medium: number; high: number };
    createdAt: Date;
  }>;
}
```

## 🚀 Usage Examples

### Creating a Stellar Wallet

```typescript
// POST /api/stellar/wallet
const response = await fetch('/api/stellar/wallet', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  }
});

const wallet = await response.json();
console.log('Wallet created:', wallet.data.accountId);
```

### Sending a Payment

```typescript
// POST /api/stellar/send
const payment = await fetch('/api/stellar/send', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    toAccountId: 'GABC123...',
    amount: '10.5',
    asset: 'XLM',
    memo: 'Payment for services'
  })
});
```

### MPESA Deposit

```typescript
// POST /api/stellar-mpesa/deposit
const deposit = await fetch('/api/stellar-mpesa/deposit', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    phoneNumber: '254712345678',
    amountKES: 1000,
    asset: 'XLM'
  })
});
```

### Creating a Multi-Signature Wallet

```typescript
// POST /api/stellar-advanced/multisig
const multiSig = await fetch('/api/stellar-advanced/multisig', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    signers: [
      { publicKey: 'GABC123...', weight: 1 },
      { publicKey: 'GDEF456...', weight: 1 }
    ],
    threshold: {
      low: 1,
      medium: 2,
      high: 2
    }
  })
});
```

## 🔐 Security Considerations

### 1. Private Key Management
- Store private keys encrypted in the database
- Use hardware security modules (HSM) for production
- Implement key rotation policies

### 2. Multi-Signature Security
- Require multiple signatures for high-value transactions
- Implement time-locked operations for additional security
- Use threshold signatures for enhanced security

### 3. API Security
- All endpoints require authentication
- Implement rate limiting
- Use HTTPS in production
- Validate all input parameters

## 🧪 Testing

### Unit Tests

```typescript
// Example test for wallet creation
describe('Stellar Wallet Service', () => {
  it('should create a new wallet', async () => {
    const wallet = await stellarWalletService.createWallet('user123');
    expect(wallet.accountId).toBeDefined();
    expect(wallet.secretKey).toBeDefined();
  });
});
```

### Integration Tests

```typescript
// Example integration test
describe('Stellar API Integration', () => {
  it('should create wallet via API', async () => {
    const response = await request(app)
      .post('/api/stellar/wallet')
      .set('Authorization', 'Bearer ' + token)
      .expect(201);
    
    expect(response.body.success).toBe(true);
    expect(response.body.data.accountId).toBeDefined();
  });
});
```

## 📊 Monitoring & Analytics

### Key Metrics to Track

1. **Transaction Volume**
   - Daily/monthly transaction count
   - Transaction value distribution
   - Success/failure rates

2. **User Activity**
   - Active wallet count
   - New wallet creation rate
   - User retention metrics

3. **Network Performance**
   - Transaction confirmation times
   - Network fee trends
   - Stellar network health

### Logging

All Stellar operations are logged with structured data:

```typescript
logger.info('Stellar payment successful', {
  transactionHash: result.hash,
  from: sourceAccount,
  to: destinationAccount,
  amount: amount,
  asset: asset
});
```

## 🔄 Error Handling

### Common Error Scenarios

1. **Insufficient Balance**
   ```json
   {
     "success": false,
     "message": "Insufficient balance",
     "error": {
       "code": "INSUFFICIENT_BALANCE",
       "message": "Account balance is too low"
     }
   }
   ```

2. **Invalid Address**
   ```json
   {
     "success": false,
     "message": "Invalid recipient address",
     "error": {
       "code": "INVALID_ADDRESS",
       "message": "Please provide a valid Stellar address"
     }
   }
   ```

3. **Network Error**
   ```json
   {
     "success": false,
     "message": "Network error",
     "error": {
       "code": "NETWORK_ERROR",
       "message": "Failed to connect to Stellar network"
     }
   }
   ```

## 🚀 Deployment

### Production Checklist

- [ ] Set `STELLAR_NETWORK=mainnet`
- [ ] Configure production Horizon URL
- [ ] Set up proper private key encryption
- [ ] Configure monitoring and alerting
- [ ] Set up backup and recovery procedures
- [ ] Test all endpoints thoroughly
- [ ] Configure rate limiting
- [ ] Set up SSL certificates

### Environment Variables

```bash
# Production Stellar Configuration
STELLAR_NETWORK=mainnet
STELLAR_HORIZON_URL_MAINNET=https://horizon.stellar.org
STELLAR_USDC_ISSUER_MAINNET=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN
STELLAR_PLATFORM_WALLET_SECRET=your_production_secret_key
```

## 📚 Additional Resources

- [Stellar Documentation](https://developers.stellar.org/)
- [Stellar SDK JavaScript](https://stellar.github.io/js-stellar-sdk/)
- [Stellar Network Explorer](https://stellar.expert/)
- [Stellar Laboratory](https://laboratory.stellar.org/)

## 🤝 Support

For technical support or questions about the Stellar integration:

1. Check the logs for detailed error messages
2. Verify environment configuration
3. Test with Stellar testnet first
4. Review the API documentation
5. Contact the development team

---

**Note**: This integration maintains the same authentication system as your existing NexusPay services, ensuring users don't need to re-login when accessing Stellar features.
