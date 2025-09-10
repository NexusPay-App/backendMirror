# Business Balance & Transaction Endpoints - Complete API Documentation

This document contains all business balance, transaction, withdrawal, and loan endpoints for the NexusPay platform.

---

## 💰 **1. Business Balance Management**

### 1.1 Get Business Balance
**Endpoint:** `GET /api/business/:businessId/balance`

**Headers:**
```json
{
  "Authorization": "Bearer <JWT_TOKEN>",
  "Content-Type": "application/json"
}
```

**Path Parameters:**
- `businessId` (string, required) - The business account ID

**Success Response (200):**
```json
{
  "success": true,
  "message": "Business balance retrieved successfully",
  "data": {
    "businessId": "68c15076b30ba0873a33ee01",
    "businessName": "My Business Name",
    "merchantId": "NX-1040911545",
    "walletAddress": "0xA8BdB162d241E3bB69db76B64865ABb56Fa40A95",
    "balances": {
      "arbitrum": {
        "USDC": 1500.50,
        "USDT": 0
      },
      "base": {
        "USDC": 750.25,
        "USDT": 0
      },
      "celo": {
        "USDC": 0,
        "USDT": 200.00
      }
    },
    "totalUSDValue": 2450.75,
    "lastUpdated": "2025-01-10T10:30:00.000Z"
  }
}
```

**Error Responses:**
- `401` - Authentication required
- `400` - Business ID required
- `404` - Business not found
- `403` - Unauthorized access

---

## 📊 **2. Business Transaction History**

### 2.1 Get Business Transaction History
**Endpoint:** `GET /api/business/:businessId/transactions`

**Headers:**
```json
{
  "Authorization": "Bearer <JWT_TOKEN>",
  "Content-Type": "application/json"
}
```

**Path Parameters:**
- `businessId` (string, required) - The business account ID

**Query Parameters:**
- `page` (number, optional) - Page number (default: 1)
- `limit` (number, optional) - Items per page (default: 10, max: 100)
- `status` (string, optional) - Filter by status: `pending`, `completed`, `failed`, `error`
- `type` (string, optional) - Filter by type: `business_to_personal`, `business_crypto_to_fiat`, `crypto_to_paybill`, etc.
- `dateFrom` (string, optional) - Filter from date (ISO8601)
- `dateTo` (string, optional) - Filter to date (ISO8601)

**Success Response (200):**
```json
{
  "success": true,
  "message": "Business transaction history retrieved successfully",
  "data": {
    "transactions": [
      {
        "_id": "68c15076b30ba0873a33ee02",
        "transactionId": "tx_123456789",
        "userId": "661c24e2b01df40e476505aa",
        "businessId": "68c15076b30ba0873a33ee01",
        "amount": 100.50,
        "type": "business_to_personal",
        "status": "completed",
        "fromAddress": "0xA8BdB162d241E3bB69db76B64865ABb56Fa40A95",
        "toAddress": "0x31c41BCa835C0d3c597cbBaF2e8dBf973645fb4",
        "tokenType": "USDC",
        "chain": "arbitrum",
        "cryptoTransactionHash": "0xabc123...",
        "createdAt": "2025-01-10T10:30:00.000Z",
        "completedAt": "2025-01-10T10:31:00.000Z"
      }
    ],
    "summary": {
      "total": 25,
      "page": 1,
      "limit": 10,
      "pages": 3,
      "businessId": "68c15076b30ba0873a33ee01",
      "businessName": "My Business Name"
    }
  }
}
```

**Error Responses:**
- `401` - Authentication required
- `400` - Business ID required
- `404` - Business not found
- `403` - Unauthorized access

---

## 💸 **3. Business Withdrawal Endpoints**

### 3.1 Withdraw to Personal Account
**Endpoint:** `POST /api/business/withdraw-to-personal`

**Headers:**
```json
{
  "Authorization": "Bearer <JWT_TOKEN>",
  "Content-Type": "application/json"
}
```

**Request Body:**
```json
{
  "businessId": "68c15076b30ba0873a33ee01",
  "amount": 100.50,
  "tokenType": "USDC",
  "chain": "arbitrum"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Transfer to personal account successful",
  "data": {
    "transactionId": "tx_123456789",
    "amount": 100.50,
    "tokenType": "USDC",
    "chain": "arbitrum",
    "fromBusiness": "My Business Name",
    "toPersonal": "0x31c41BCa835C0d3c597cbBaF2e8dBf973645fb4"
  }
}
```

### 3.2 Withdraw to MPESA
**Endpoint:** `POST /api/business/withdraw-to-mpesa`

**Headers:**
```json
{
  "Authorization": "Bearer <JWT_TOKEN>",
  "Content-Type": "application/json"
}
```

**Request Body:**
```json
{
  "businessId": "68c15076b30ba0873a33ee01",
  "amount": 50.00,
  "phoneNumber": "+254759280875",
  "tokenType": "USDC",
  "chain": "arbitrum"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Business withdrawal to MPESA initiated successfully",
  "data": {
    "transactionId": "tx_987654321",
    "amount": 50.00,
    "tokenType": "USDC",
    "chain": "arbitrum",
    "phoneNumber": "+254759280875",
    "businessName": "My Business Name",
    "status": "processing"
  }
}
```

**Error Responses:**
- `401` - Authentication required
- `400` - Missing required fields or invalid amount
- `404` - Business or user not found
- `403` - Unauthorized access
- `500` - Transfer/withdrawal failed

---

## 📈 **4. Business Credit & Loan Management**

### 4.1 Get Business Credit Score
**Endpoint:** `GET /api/business/:businessId/credit-score`

**Headers:**
```json
{
  "Authorization": "Bearer <JWT_TOKEN>",
  "Content-Type": "application/json"
}
```

**Path Parameters:**
- `businessId` (string, required) - The business account ID

**Success Response (200):**
```json
{
  "success": true,
  "message": "Business credit score retrieved successfully",
  "data": {
    "businessId": "68c15076b30ba0873a33ee01",
    "businessName": "My Business Name",
    "creditScore": 750,
    "riskLevel": "low",
    "creditLimit": 5000,
    "currentCredit": 0,
    "availableCredit": 5000,
    "totalVolume": 15000,
    "monthlyVolume": 2500,
    "paymentHistory": {
      "totalPayments": 45,
      "completedPayments": 44,
      "successRate": 97.78
    },
    "lastAssessment": "2025-01-10T10:30:00.000Z",
    "recommendations": [
      "Maintain consistent payment history",
      "Increase transaction volume to improve credit score",
      "Keep overdraft utilization below 30%"
    ]
  }
}
```

### 4.2 Apply for Business Loan
**Endpoint:** `POST /api/business/apply-loan`

**Headers:**
```json
{
  "Authorization": "Bearer <JWT_TOKEN>",
  "Content-Type": "application/json"
}
```

**Request Body:**
```json
{
  "businessId": "68c15076b30ba0873a33ee01",
  "loanAmount": 1000,
  "purpose": "Business expansion",
  "repaymentPeriod": 12
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Loan application submitted successfully",
  "data": {
    "loanApplication": {
      "loanId": "loan_123456789",
      "businessId": "68c15076b30ba0873a33ee01",
      "businessName": "My Business Name",
      "loanAmount": 1000,
      "purpose": "Business expansion",
      "repaymentPeriod": 12,
      "creditScore": 750,
      "riskLevel": "low",
      "status": "pending_approval",
      "appliedAt": "2025-01-10T10:30:00.000Z",
      "interestRate": 8.5,
      "monthlyPayment": 87.92
    },
    "estimatedApprovalTime": "24-48 hours",
    "nextSteps": [
      "Application under review",
      "Credit assessment in progress",
      "You will be notified of the decision"
    ]
  }
}
```

**Error Responses:**
- `401` - Authentication required
- `400` - Missing fields, invalid amount, loan amount exceeded, or high risk
- `404` - Business not found
- `403` - Unauthorized access
- `500` - Loan application failed

---

## 🔒 **Authentication Requirements**

### Endpoints requiring JWT Authentication:
- All balance endpoints
- All transaction history endpoints
- All withdrawal endpoints
- All credit score endpoints
- All loan application endpoints

### Security Features:
- Business ownership verification
- Amount validation
- Transaction recording
- Error handling with specific codes

---

## 📊 **Rate Limiting**

- **Balance requests:** 10 per minute per business
- **Transaction history:** 20 per minute per business
- **Withdrawals:** 5 per hour per business
- **Credit score checks:** 5 per hour per business
- **Loan applications:** 1 per day per business

---

## 🚨 **Error Codes**

### Common Error Codes:
- `AUTH_REQUIRED` - Authentication required
- `MISSING_BUSINESS_ID` - Business ID is required
- `BUSINESS_NOT_FOUND` - Business account not found
- `UNAUTHORIZED` - Unauthorized access to business
- `MISSING_FIELDS` - Required fields are missing
- `INVALID_AMOUNT` - Amount must be a positive number
- `USER_NOT_FOUND` - User account not found
- `BALANCE_FAILED` - Failed to retrieve balance
- `HISTORY_FAILED` - Failed to retrieve transaction history
- `TRANSFER_FAILED` - Transfer operation failed
- `WITHDRAWAL_FAILED` - Withdrawal operation failed
- `CREDIT_SCORE_FAILED` - Failed to retrieve credit score
- `LOAN_AMOUNT_EXCEEDED` - Loan amount exceeds credit limit
- `HIGH_RISK` - Loan not approved due to high risk profile
- `LOAN_APPLICATION_FAILED` - Loan application failed

---

## 📝 **Usage Examples**

### Example 1: Check Business Balance
```bash
curl -X GET "http://localhost:8000/api/business/68c15076b30ba0873a33ee01/balance" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json"
```

### Example 2: Get Transaction History with Filters
```bash
curl -X GET "http://localhost:8000/api/business/68c15076b30ba0873a33ee01/transactions?page=1&limit=20&status=completed&type=business_to_personal" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json"
```

### Example 3: Withdraw to Personal Account
```bash
curl -X POST "http://localhost:8000/api/business/withdraw-to-personal" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "businessId": "68c15076b30ba0873a33ee01",
    "amount": 100.50,
    "tokenType": "USDC",
    "chain": "arbitrum"
  }'
```

### Example 4: Withdraw to MPESA
```bash
curl -X POST "http://localhost:8000/api/business/withdraw-to-mpesa" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "businessId": "68c15076b30ba0873a33ee01",
    "amount": 50.00,
    "phoneNumber": "+254759280875",
    "tokenType": "USDC",
    "chain": "arbitrum"
  }'
```

### Example 5: Check Credit Score
```bash
curl -X GET "http://localhost:8000/api/business/68c15076b30ba0873a33ee01/credit-score" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json"
```

### Example 6: Apply for Loan
```bash
curl -X POST "http://localhost:8000/api/business/apply-loan" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "businessId": "68c15076b30ba0873a33ee01",
    "loanAmount": 1000,
    "purpose": "Business expansion",
    "repaymentPeriod": 12
  }'
```

---

This documentation covers all business balance, transaction, withdrawal, and loan endpoints for comprehensive business financial management on the NexusPay platform.
