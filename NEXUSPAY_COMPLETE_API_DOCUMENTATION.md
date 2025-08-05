# NexusPay Complete API Documentation
## Comprehensive Cross-Layer Endpoint Documentation

> **Generated on:** `r new Date().toISOString()`
> **Version:** v2.0
> **Base URL:** `https://api.nexuspay.app/api`

---

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Authentication & Security Layers](#authentication--security-layers)
3. [Complete API Endpoints](#complete-api-endpoints)
4. [Controller Layer Architecture](#controller-layer-architecture)
5. [Service Layer Components](#service-layer-components)
6. [Data Models & Relationships](#data-models--relationships)
7. [Middleware Security Stack](#middleware-security-stack)
8. [Error Handling & Response Standards](#error-handling--response-standards)

---

## 🏗️ Architecture Overview

NexusPay follows a **layered architecture** pattern with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                        API LAYER                            │
│  Routes → Middleware → Controllers → Services → Models     │
└─────────────────────────────────────────────────────────────┘

📡 API Routes (10 modules)
├── Authentication (/auth)
├── Business Accounts (/business)
├── Token Operations (/token)
├── M-Pesa Integration (/mpesa)
├── Admin Management (/admin)
├── Transaction History (/transactions)
├── Liquidity Provision (/liquidity)
├── Fiat Ramp (/ramp)
├── Platform Wallets (/platform-wallet)
└── Health & Monitoring (/health)

🛡️ Middleware Stack
├── Security (Helmet, CORS, Rate Limiting)
├── Authentication (JWT, Strict Auth, OTP)
├── Authorization (Role-based Access)
├── Validation (Zod, Express-Validator)
└── Logging & Monitoring

🎯 Controller Layer (11 controllers)
├── Authentication & User Management
├── Business Account Operations
├── Crypto Token Transactions
├── M-Pesa Payment Processing
├── Administrative Functions
├── Transaction Management
├── Liquidity Pool Operations
├── Fiat On/Off Ramp
├── Platform Wallet Management
├── Monitoring & Analytics
└── Fee Management

⚙️ Service Layer (25+ services)
├── Core Services (Auth, Token, Platform Wallet)
├── Payment Services (M-Pesa, Fiat Processing)
├── Blockchain Services (Multi-chain Support)
├── Infrastructure Services (Redis, Queue, Scheduler)
├── Business Logic Services (Fees, Rates, Swaps)
└── Monitoring Services (Logging, Recovery, Reconciliation)

💾 Data Layer (9+ models)
├── User Management (User, Verification)
├── Business Operations (Business, Escrow)
├── Financial Operations (RampTransaction, LiquidityProvider)
└── System Models (Platform configurations)
```

---

## 🔐 Authentication & Security Layers

### Authentication Mechanisms

| **Type** | **Middleware** | **Use Case** | **Requirements** |
|----------|---------------|--------------|------------------|
| **Basic Auth** | `authenticate` | General API access | Valid JWT token |
| **Strict Auth** | `enforceStrictAuth` | Sensitive operations | JWT + OTP verification |
| **Legacy Auth** | `authenticateToken` | Legacy endpoints | JWT with debug logging |
| **Admin Auth** | `authenticate + isAdmin` | Admin operations | JWT + Admin role |

### Security Middleware Stack

```typescript
// Security Pipeline for Sensitive Operations
enforceStrictAuth → validate(schema) → controller → service

// Admin Operations Pipeline  
authenticate → isAdmin → validate(schema) → controller → service

// Rate-Limited Operations
cryptoSpendingProtection → authenticateToken → validate → controller
```

---

## 🌐 Complete API Endpoints

### 🔑 Authentication Endpoints (`/api/auth`)

| **Method** | **Endpoint** | **Middleware** | **Controller** | **Description** |
|------------|--------------|----------------|----------------|-----------------|
| POST | `/login` | `validate(loginValidation)` | `login` | User login initiation |
| POST | `/login/verify` | `validate(phoneLoginVerifyValidation)` | `verifyLogin` | Login OTP verification |
| POST | `/logout` | `enforceStrictAuth` | `logout` | Secure logout |
| POST | `/otp` | `validate(phoneOtpRequestValidation)` | Inline handler | Request standalone OTP |
| POST | `/verify-otp` | `validate(phoneOtpVerifyValidation)` | Inline handler | Verify standalone OTP |
| POST | `/register/initiate` | - | `initiateRegisterUser` | Start user registration |
| POST | `/register` | `validate(registerValidation)` | `registerUser` | Complete registration |
| POST | `/register/verify/email` | `validate(verifyEmailValidation)` | `verifyEmail` | Email verification |
| POST | `/register/verify/phone` | `validate(verifyPhoneValidation)` | `verifyPhone` | Phone verification |
| POST | `/password-reset/request` | `validate(passwordResetRequestValidation)` | `requestPasswordReset` | Request password reset |
| POST | `/password-reset` | `validate(passwordResetValidation)` | `resetPassword` | Reset password |
| POST | `/account-deletion/request` | `authenticate` | `requestAccountDeletion` | Request account deletion |
| POST | `/account-deletion/confirm` | `authenticate` | `confirmAccountDeletion` | Confirm account deletion |

### 🏢 Business Account Endpoints (`/api/business`)

| **Method** | **Endpoint** | **Middleware** | **Controller** | **Description** |
|------------|--------------|----------------|----------------|-----------------|
| POST | `/request-upgrade` | `enforceStrictAuth` | `requestBusinessCreation` | Request business account |
| POST | `/complete-upgrade` | `enforceStrictAuth` | `completeBusinessCreation` | Complete business setup |
| POST | `/transfer-funds` | `enforceStrictAuth` | `transferFundsToPersonal` | Transfer business funds |
| POST | `/verify-external-transfer` | `enforceStrictAuth` | `verifyExternalTransfer` | Verify external transfers |
| GET | `/details` | `enforceStrictAuth` | `getBusinessDetails` | Get business information |
| GET | `/status` | `enforceStrictAuth` | `checkBusinessStatus` | Check business status |
| GET | `/find/:merchantId` | `enforceStrictAuth` | `getBusinessByMerchantId` | Find business by merchant ID |

### 🪙 Token Operations (`/api/token`)

| **Method** | **Endpoint** | **Middleware** | **Controller** | **Description** |
|------------|--------------|----------------|----------------|-----------------|
| POST | `/sendToken` | `enforceStrictAuth, validate(sendTokenValidation)` | `send` | Send tokens to recipient |
| POST | `/pay` | `enforceStrictAuth, validate(payMerchantValidation)` | `pay` | Pay merchant with tokens |
| GET | `/tokenTransferEvents` | `enforceStrictAuth, validate(tokenTransferEventsValidation)` | `tokenTransferEvents` | Get transfer events |
| POST | `/unify` | `enforceStrictAuth` | `unify` | Unify user accounts |
| POST | `/migrate` | `enforceStrictAuth` | `migrate` | Migrate token holdings |
| GET | `/wallet` | `enforceStrictAuth` | `getWallet` | Get wallet information |

### 💳 M-Pesa Payment Endpoints (`/api/mpesa`)

| **Method** | **Endpoint** | **Middleware** | **Controller** | **Description** |
|------------|--------------|----------------|----------------|-----------------|
| **Public Webhooks** |
| POST | `/stk-callback` | - | `mpesaSTKPushWebhook` | STK Push callback |
| POST | `/b2c-callback` | - | `mpesaB2CWebhook` | B2C transaction callback |
| POST | `/queue-timeout` | - | `mpesaQueueWebhook` | Queue timeout callback |
| POST | `/callback` | - | `stkPushCallback` | General STK callback |
| **User Operations** |
| POST | `/deposit` | `enforceStrictAuth, validate(depositValidation)` | `mpesaDeposit` | Deposit via M-Pesa |
| POST | `/withdraw` | `enforceStrictAuth, validate(withdrawValidation)` | `mpesaWithdraw` | Withdraw to M-Pesa |
| POST | `/pay/paybill` | `enforceStrictAuth, validate(paybillValidation)` | `payToPaybill` | Pay paybill with crypto |
| POST | `/pay/till` | `enforceStrictAuth, validate(tillValidation)` | `payToTill` | Pay till with crypto |
| POST | `/buy-crypto` | `enforceStrictAuth, validate(buyCryptoValidation)` | `buyCrypto` | Buy crypto with M-Pesa |
| GET | `/transaction/:transactionId` | `enforceStrictAuth` | `getTransactionStatus` | Get transaction status |
| **Manual Intervention** |
| POST | `/submit-receipt` | `enforceStrictAuth, validate(manualReceiptValidation)` | `submitMpesaReceiptManually` | Submit M-Pesa receipt |
| GET | `/pending-interventions` | `enforceStrictAuth` | `getTransactionsRequiringIntervention` | Get pending interventions |
| **Admin Operations** |
| GET | `/platform-wallet` | `enforceStrictAuth, isAdmin` | `getPlatformWalletStatus` | Platform wallet status |
| POST | `/withdraw-fees` | `enforceStrictAuth, isAdmin` | `withdrawFeesToMainWallet` | Withdraw collected fees |
| **Test & Development** |
| POST | `/test-webhook-logging` | - | `testWebhookLogging` | Test webhook logging |
| **Crypto Spending** |
| POST | `/pay-with-crypto` | `cryptoSpendingProtection, authenticateToken, validate(validateCryptoSpending)` | `payWithCrypto` | Pay bills with crypto |

### 👑 Admin Management (`/api/admin`)

| **Method** | **Endpoint** | **Middleware** | **Controller** | **Description** |
|------------|--------------|----------------|----------------|-----------------|
| **User Management** |
| GET | `/users` | `authenticate, isAdmin, validate(getUsersValidation)` | `getUsers` | Get all users |
| GET | `/users/:id` | `authenticate, isAdmin, validate(getUserByIdValidation)` | `getUserById` | Get user by ID |
| POST | `/users/promote/:id` | `authenticate, isAdmin, validate(promoteToAdminValidation)` | `promoteToAdmin` | Promote user to admin |
| **Transaction Management** |
| GET | `/transactions` | `authenticate, isAdmin` | `getTransactions` | Get all transactions |
| GET | `/transactions/:id` | `authenticate, isAdmin, validate(transactionLookupValidation)` | `getTransactionById` | Get transaction by ID |
| PUT | `/transactions/:id/status` | `authenticate, isAdmin` | `updateTransactionStatus` | Update transaction status |
| **Wallet Management** |
| GET | `/platform-wallets` | `authenticate, isAdmin` | `getPlatformWallets` | Get platform wallet status |
| POST | `/wallets/fund` | `authenticate, isAdmin, validate(walletFundingValidation)` | `fundUserWallet` | Fund user wallet |
| POST | `/wallets/withdraw-fees` | `authenticate, isAdmin` | `withdrawFeesToMainWallet` | Withdraw platform fees |

### 📊 Transaction History (`/api/transactions`)

| **Method** | **Endpoint** | **Middleware** | **Controller** | **Description** |
|------------|--------------|----------------|----------------|-----------------|
| GET | `/history` | `authenticate, validate(transactionHistoryValidation)` | `getTransactionHistory` | Enhanced transaction history |
| GET | `/:id` | `authenticate` | `getTransactionById` | Get transaction details |
| GET | `/dashboard/insights` | `authenticate` | Inline handler | Dashboard insights |

### 💧 Liquidity Provision (`/api/liquidity`)

| **Method** | **Endpoint** | **Middleware** | **Controller** | **Description** |
|------------|--------------|----------------|----------------|-----------------|
| POST | `/provide` | `authenticate` | `provideLiquidity` | Provide liquidity |
| GET | `/positions` | `authenticate` | `getLiquidityPositions` | Get user positions |
| GET | `/stats/:token` | `authenticate` | `getLiquidityStats` | Get token stats |
| POST | `/withdraw/initiate` | `authenticate` | `initiateWithdrawal` | Initiate withdrawal |
| POST | `/withdraw/confirm` | `authenticate` | `withdrawLiquidity` | Confirm withdrawal |
| DELETE | `/position/:positionId` | `authenticate` | `deletePosition` | Delete position |

### 🔄 Fiat Ramp (`/api/ramp`)

| **Method** | **Endpoint** | **Middleware** | **Controller** | **Description** |
|------------|--------------|----------------|----------------|-----------------|
| POST | `/transaction` | `authenticate` | `createRampTransaction` | Create ramp transaction |
| GET | `/transactions` | `authenticate` | `getUserTransactions` | Get user transactions |
| GET | `/stats` | `authenticate` | `getTransactionStats` | Get transaction stats |
| POST | `/calculate-savings` | `authenticate` | `calculateSavings` | Calculate savings |

### 💰 Platform Wallet (`/api/platform-wallet`)

| **Method** | **Endpoint** | **Middleware** | **Controller** | **Description** |
|------------|--------------|----------------|----------------|-----------------|
| GET | `/balance/:token` | `authenticate` | `getWalletBalance` | Get token balance |
| GET | `/status` | `authenticate` | `getPlatformStatus` | Platform status |
| GET | `/balances` | `authenticate` | `getAllBalances` | Get all balances |
| POST | `/withdraw` | `authenticate` | `withdrawFees` | Withdraw fees |
| POST | `/transfer` | `authenticate` | `transferFees` | Transfer fees |

### 🔍 System Endpoints

| **Method** | **Endpoint** | **Middleware** | **Controller** | **Description** |
|------------|--------------|----------------|----------------|-----------------|
| GET | `/health` | - | Inline handler | Health check |
| POST | `/verifications` | - | Inline handler | Create verification |
| GET | `/verifications` | - | Inline handler | Get verifications |
| POST | `/internal/retry-transactions` | Dev only | Inline handler | Manual retry (dev) |

---

## 🎯 Controller Layer Architecture

### Controller Organization

```typescript
// Controller Structure Pattern
export class ControllerName {
  // Input validation
  // Authentication checks  
  // Business logic delegation to services
  // Response formatting
  // Error handling
}
```

### Controller Responsibilities

| **Controller** | **Primary Responsibilities** | **Key Services Used** |
|----------------|------------------------------|----------------------|
| **authController** | User authentication, registration, password management | auth, email, otpService |
| **businessController** | Business account creation, fund transfers, verification | platformWallet, email |
| **tokenController** | Token transfers, merchant payments, wallet operations | token, platformWallet |
| **mpesaController** | M-Pesa integration, crypto buying/selling, bill payments | mpesa, platformWallet, rates |
| **adminController** | User management, transaction oversight, platform monitoring | Multiple services |
| **transactionController** | Transaction history, analytics, insights | transactionLogger, rates |
| **liquidityController** | Liquidity provision, yield generation, pool management | liquidityService, feeService |
| **rampController** | Fiat on/off ramps, conversion calculations | rampService, rates |
| **platformWalletController** | Wallet balance management, fee operations | platformWallet |
| **monitoringController** | System monitoring, performance metrics | transactionMonitor |

---

## ⚙️ Service Layer Components

### Core Infrastructure Services

| **Service** | **Purpose** | **Key Features** |
|-------------|-------------|------------------|
| **platformWallet.ts** | Multi-chain wallet management | 82KB - Handles 18+ blockchains, transaction processing, balance management |
| **database.ts** | MongoDB connection management | Connection pooling, error handling |
| **redis.ts** | Caching and session management | Rate limiting, session storage, caching |
| **scheduler.ts** | Background job processing | Transaction retry, recovery, monitoring |
| **queue.ts** | Asynchronous task management | Transaction queuing, processing |

### Financial Services

| **Service** | **Purpose** | **Key Features** |
|-------------|-------------|------------------|
| **mpesa.ts** | M-Pesa API integration | STK Push, B2C, callbacks, webhook handling |
| **token.ts** | Blockchain token operations | Multi-chain transfers, balance queries |
| **rates.ts** | Currency conversion rates | Real-time rates, caching, multiple providers |
| **feeService.ts** | Fee calculation and management | Dynamic fees, volume discounts, loyalty |
| **swapService.ts** | Token swapping operations | Cross-chain swaps, rate calculations |

### Business Logic Services

| **Service** | **Purpose** | **Key Features** |
|-------------|-------------|------------------|
| **liquidityService.ts** | Liquidity pool management | Yield generation, position tracking |
| **rampService.ts** | Fiat conversion services | On/off ramp, fee calculations |
| **yieldService.ts** | Yield farming operations | APY calculations, reward distribution |

### Monitoring & Recovery Services

| **Service** | **Purpose** | **Key Features** |
|-------------|-------------|------------------|
| **transactionLogger.ts** | Transaction audit trail | Comprehensive logging, metrics |
| **transactionMonitor.ts** | Real-time monitoring | Performance tracking, alerting |
| **transactionRecovery.ts** | Failed transaction recovery | Automatic retry, manual intervention |
| **reconciliation.ts** | Financial reconciliation | Balance verification, discrepancy detection |

### Communication Services

| **Service** | **Purpose** | **Key Features** |
|-------------|-------------|------------------|
| **email.ts** | Email notifications | OTP delivery, transaction alerts |
| **auth.ts** | Authentication utilities | JWT handling, OTP generation |
| **otpService.ts** | OTP management | Generation, validation, expiration |

---

## 💾 Data Models & Relationships

### User Management Models

```typescript
// Primary User Model (models.ts)
interface IUser {
  phoneNumber: string;
  email: string;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  walletAddress: string;
  password: string;
  privateKey: string;
  role: 'user' | 'admin' | 'support';
  isUnified: boolean;
  createdAt: Date;
  lastLoginAt?: Date;
}

// Verification Model
interface IVerification {
  providerId: string;
  providerName: string;
  phoneNumber: string;
  proof: string;
  verified: boolean;
}
```

### Business Models

```typescript
// Business Account Model
interface IBusiness {
  businessName: string;
  ownerName: string;
  location: string;
  businessType: string;
  phoneNumber: string;
  merchantId: string;
  walletAddress: string;
  privateKey: string;
  userId: mongoose.Types.ObjectId;
}

// Escrow Model for Secure Transactions
interface IEscrow {
  transactionId: string;
  userId: string;
  amount: number;
  cryptoAmount: number;
  status: 'pending' | 'completed' | 'failed' | 'rolledback';
  mpesaTransactionId?: string;
  cryptoTransactionHash?: string;
  rollbackTransactionHash?: string;
}
```

### Financial Models

```typescript
// Ramp Transaction Model
interface IRampTransaction {
  userId: string;
  type: 'fiat_to_crypto' | 'crypto_to_fiat';
  paymentMethod: 'bank_transfer' | 'card' | 'mobile_money' | 'mpesa';
  fiatCurrency: string;
  fiatAmount: number;
  cryptoToken: string;
  cryptoAmount: number;
  exchangeRate: number;
  fees: {
    platformFee: number;
    networkFee: number;
    totalFee: number;
  };
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
}

// Liquidity Provider Model
interface ILiquidityProvision {
  userId: string;
  token: string;
  amount: number;
  chain: string;
  apy: number;
  lockupPeriod: number;
  expectedYield: number;
  status: 'active' | 'withdrawn' | 'expired';
  transactionHash: string;
  transactionStatus: 'pending' | 'confirmed' | 'failed';
}
```

### Model Relationships

```
User (1) ←→ (*) Business
User (1) ←→ (*) RampTransaction  
User (1) ←→ (*) LiquidityProvision
User (1) ←→ (*) Verification
User (1) ←→ (*) Escrow
```

---

## 🛡️ Middleware Security Stack

### Authentication Middleware

```typescript
// Standard Authentication
authenticate: JWT validation + user lookup

// Strict Authentication  
enforceStrictAuth: JWT + OTP verification + session tracking

// Legacy Authentication
authenticateToken: JWT with debug logging (for compatibility)
```

### Authorization Middleware

```typescript
// Role-based Access Control
isAdmin: Checks user.role === 'admin'

// Future extensions
isSupport: Checks user.role === 'support' 
isBusiness: Checks business account status
```

### Validation Middleware

```typescript
// Flexible Validation Support
validate(schema): Supports both Zod and express-validator schemas

// Validation Categories:
- authValidators: Login, registration, password reset
- mpesaValidators: Deposits, withdrawals, crypto spending  
- tokenValidators: Transfers, merchant payments
- adminValidators: User management, transaction oversight
```

### Security Middleware

```typescript
// Rate Limiting
cryptoSpendingProtection: Enhanced protection for crypto spending
limiter: General API rate limiting (100 req/15min)

// Security Headers
helmet(): Security headers
cors(): CORS with origin validation
compression(): Response compression
```

---

## 🔄 Error Handling & Response Standards

### Standardized Response Format

```typescript
interface StandardResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp?: string;
}
```

### Error Categories

| **Category** | **HTTP Status** | **Error Codes** |
|--------------|-----------------|-----------------|
| **Authentication** | 401 | `AUTH_REQUIRED`, `INVALID_TOKEN`, `USER_NOT_FOUND` |
| **Authorization** | 403 | `FORBIDDEN`, `INSUFFICIENT_PERMISSIONS` |
| **Validation** | 400 | `VALIDATION_ERROR`, `MISSING_FIELDS`, `INVALID_INPUT` |
| **Business Logic** | 400 | `INSUFFICIENT_BALANCE`, `TRANSACTION_FAILED` |
| **Rate Limiting** | 429 | `RATE_LIMIT_EXCEEDED` |
| **Server Errors** | 500 | `SERVER_ERROR`, `CONFIG_ERROR`, `DATABASE_ERROR` |

### Global Error Handling

```typescript
// Automatic error handling for:
- ValidationError → 400 with field details
- UnauthorizedError → 401 with auth requirements  
- CORS errors → 401 with origin information
- Unhandled errors → 500 with stack trace (dev only)
```

---

## 🚀 Performance & Monitoring

### Key Performance Features

- **Redis Caching**: Rate data, user sessions, transaction states
- **Connection Pooling**: MongoDB optimized connections
- **Async Processing**: Background transaction processing
- **Retry Mechanisms**: Automatic retry for failed transactions
- **Load Balancing**: Multiple blockchain RPC endpoints

### Monitoring Systems

- **Transaction Logging**: Comprehensive audit trail
- **Performance Metrics**: Response times, success rates
- **Error Tracking**: Categorized error monitoring  
- **Health Checks**: System status endpoints
- **Recovery Systems**: Automatic transaction recovery

---

## 📝 Development Notes

### Environment Configuration

```bash
# Core Configuration
NODE_ENV=production|development
PORT=8000
JWT_SECRET=<secret>

# Database  
MONGODB_URI=<connection_string>
REDIS_URL=<redis_connection>

# M-Pesa Configuration
MPESA_CONSUMER_KEY=<key>
MPESA_CONSUMER_SECRET=<secret>
MPESA_PASSKEY=<passkey>

# Blockchain Configuration  
PLATFORM_WALLET_PRIMARY_KEY=<key>
PLATFORM_WALLET_SECONDARY_KEY=<key>
THIRDWEB_SECRET_KEY=<key>

# External Services
ALLOWED_ORIGINS=<comma_separated_origins>
```

### Testing & Development

- **Development Mode**: Additional CORS origins, debug logging
- **Test Endpoints**: Manual retry triggers, webhook testing
- **Sandbox Support**: Test credentials for M-Pesa integration

---

## 🔗 Related Documentation

- **Existing API Documentation**: `API_DOCUMENTATION.md` - Frontend integration guide
- **Implementation Checklist**: `IMPLEMENTATION_CHECKLIST.md` - Development progress
- **System Issues**: `SYSTEM_ISSUES.md` - Known issues and resolutions
- **Admin API Testing**: `Admin_API_Testing_Guide.md` - Admin endpoint testing

---

*This documentation provides a comprehensive view of the NexusPay API across all architectural layers. For specific endpoint usage examples and frontend integration, refer to the existing API_DOCUMENTATION.md file.*