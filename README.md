## Stable M-Pesa Webhooks (Production)

We added a Vercel-based webhook service (`mpesa-webhook-service/`) and idempotency guards for STK, B2C, and B2B callbacks.

Setup:
- Deploy `mpesa-webhook-service` to Vercel and set env `BACKEND_URL=https://your-backend-domain`.
- Set in backend `.env`:
  - `MPESA_WEBHOOK_URL=https://your-vercel-app.vercel.app`
  - Or set explicit `MPESA_STK_CALLBACK_URL`, `MPESA_B2C_RESULT_URL`, `MPESA_B2C_TIMEOUT_URL`.

Notes:
- Callbacks are acknowledged instantly (200) and processed asynchronously.
- Redis-backed idempotency prevents duplicate processing across retries.
# NexusPay Backend

NexusPay is a crypto payment platform with MPESA integration, providing secure transactions and wallet management.

## Implementation Progress

We've implemented and optimized several key components of the NexusPay backend:

### Authentication System
- ✅ Complete registration flow with email and phone verification
- ✅ Secure login system with OTP verification
- ✅ Password reset and account management
- ✅ JWT-based authentication

### API Standardization
- ✅ Standardized response format across all endpoints
- ✅ Comprehensive input validation
- ✅ Consistent error handling and error codes
- ✅ Improved security practices

### Transaction System
- ✅ Send tokens to addresses or phone numbers
- ✅ Merchant payment functionality
- ✅ Transaction history tracking

### Infrastructure
- ✅ Redis caching for OTP storage
- ✅ MongoDB database integration
- ✅ Logging and error monitoring

## Next Steps

Based on our implementation plan, here are the next priorities:

1. **MPESA Integration**
   - Implement STK Push for deposits
   - Develop crypto withdrawal to MPESA
   - Create escrow system for pending transactions
   
2. **Business Account Features**
   - Implement business registration and verification
   - Create business wallet management
   - Develop business-to-personal transfers

3. **Real-time Updates**
   - Set up WebSocket server for live updates
   - Create transaction notification system
   - Implement real-time status updates

4. **Testing & Documentation**
   - Implement automated testing
   - Create detailed API documentation
   - Add monitoring and performance tracking

## Getting Started

### Prerequisites
- Node.js (v16+)
- MongoDB
- Redis

### Environment Variables

Create a `.env` file with the following:

```
PORT=8000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
REDIS_URL=redis://localhost:6379
EMAIL_USER=your_email@gmail.com
EMAIL_APP_PASSWORD=your_app_password
AFRICA_TALKING_API_KEY=your_api_key
AFRICA_TALKING_USERNAME=your_username
```

### Installation

```bash
npm install
npm run dev
```

## API Documentation

Refer to the [API_DOCUMENTATION.md](API_DOCUMENTATION.md) file for detailed API documentation.

## Implementation Roadmap

For a comprehensive implementation roadmap with code examples, see [NEXUSPAY_IMPLEMENTATION_PLAN.md](NEXUSPAY_IMPLEMENTATION_PLAN.md).

## Progress Tracking

To track implementation progress, refer to the [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md) file.

## Testing

### API Endpoint Testing

NexusPay includes a modular testing script for testing API endpoints, particularly admin functionality:

#### Running Tests

1. **Start the Server:**
   ```bash
   npm run dev
   ```

2. **Run API Tests:**
   ```bash
   # Test all endpoints (non-destructive)
   npm run test:admin
   
   # Test specific endpoint groups
   npm run test:admin:users
   npm run test:admin:transactions
   npm run test:admin:wallets
   ```

3. **Test Individual Endpoints:**
   ```bash
   # Build the project
   npm run build
   
   # Test specific endpoints with parameters
   node dist/scripts/testAdminAPI.js -e users
   node dist/scripts/testAdminAPI.js -e user -i <user_id>
   node dist/scripts/testAdminAPI.js -e transactions
   node dist/scripts/testAdminAPI.js -e transaction -i <transaction_id>
   node dist/scripts/testAdminAPI.js -e wallets
   ```

#### Available Test Endpoints

- **User Management:**
  - `users` - List all users
  - `user` - Get user details (requires ID parameter)
  - `promote` - Promote user to admin (requires ID parameter)

- **Transaction Management:**
  - `transactions` - List all transactions
  - `transaction` - Get transaction details (requires ID parameter)
  - `update` - Update transaction status (requires ID parameter)

- **Wallet Management:**
  - `wallets` - Check platform wallet balances
  - `fund` - Fund user wallet (requires ID parameter)
  - `withdraw` - Withdraw fees to main wallet

### Postman Collection

For testing without running code, import the Postman collection:

1. **Import the Collection:**
   - Open Postman
   - Click "Import" button
   - Select the `nexuspay-admin-api.postman_collection.json` file

2. **Configure Environment:**
   - Create a new Environment in Postman
   - Add variables:
     - `base_url`: `http://localhost:8000/api`
     - `admin_token`: Your JWT token for admin access

3. **Using the Collection:**
   - Select the imported environment
   - Browse and execute requests for each endpoint
   - Check responses and test API behavior

# Platform Wallet System

This system implements a secure multi-chain platform wallet using ThirdWeb's smart wallet functionality. The system supports multiple chains and requires 2-of-3 signatures for enhanced security.

## Environment Variables

Copy these variables to your `.env` file and fill in the appropriate values:

### Required Variables

   ```bash
# ThirdWeb Configuration
THIRDWEB_SECRET_KEY=your_thirdweb_secret_key
THIRDWEB_CLIENT_ID=your_thirdweb_client_id
SMART_WALLET_FACTORY_ADDRESS=your_smart_wallet_factory_address

# Platform Wallet Keys
PLATFORM_WALLET_PRIMARY_KEY=your_primary_key
PLATFORM_WALLET_SECONDARY_KEY=your_secondary_key
PLATFORM_WALLET_BACKUP_KEY=your_backup_key
```

### Optional Variables (with defaults)

   ```bash
# Chain RPC URLs (will use public endpoints if not provided)
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
POLYGON_RPC_URL=https://polygon-rpc.com
BASE_RPC_URL=https://mainnet.base.org
OPTIMISM_RPC_URL=https://mainnet.optimism.io
CELO_RPC_URL=https://forno.celo.org
SCROLL_RPC_URL=https://rpc.scroll.io
FUSE_RPC_URL=https://rpc.fuse.io
GNOSIS_RPC_URL=https://rpc.gnosischain.com
AURORA_RPC_URL=https://mainnet.aurora.dev

# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_PREFIX=platform

# Feature Flags
ENABLE_GASLESS=true
ENABLED_CHAINS=arbitrum,polygon,base,optimism,celo,scroll,fuse,gnosis,aurora

# Logging
LOG_LEVEL=info
```

## Supported Chains

The system supports the following chains:

- Arbitrum One (chainId: 42161)
- Polygon (chainId: 137)
- Base (chainId: 8453)
- Optimism (chainId: 10)
- Celo (chainId: 42220)
- Scroll (chainId: 534352)
- Fuse (chainId: 122)
- Gnosis (chainId: 100)
- Aurora (chainId: 1313161554)

## Security Considerations

1. **Private Key Management**
   - Store private keys securely
   - Keep offline backups of all three keys
   - Store the backup key in a different physical location
   - Never share or expose these keys
   - Consider using a hardware security module (HSM) for key storage

2. **RPC Endpoints**
   - Use private RPC endpoints in production
   - Monitor RPC endpoint health
   - Have backup RPC providers configured

3. **Transaction Security**
   - All transactions require 2-of-3 signatures
   - Monitor failed transaction attempts
   - Set up alerts for suspicious activity

## Initialization

To initialize the platform wallets:

   ```bash
# Install dependencies
   npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Run initialization script
npm run init-wallets
```

## Monitoring

1. Set up monitoring for:
   - Wallet balances
   - Transaction success rates
   - RPC endpoint health
   - Gas prices
   - Network congestion

2. Configure alerts for:
   - Low balances
   - Failed transactions
   - Suspicious activity
   - RPC endpoint issues

## Recovery Procedures

1. If a key is compromised:
   - Use the remaining two keys to authorize a new key
   - Update the compromised key immediately
   - Document the incident
   - Review security measures

2. If a transaction fails:
   - Check transaction logs
   - Verify gas settings
   - Ensure sufficient balance
   - Retry with adjusted parameters

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run linter
npm run lint

# Build
npm run build
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.



