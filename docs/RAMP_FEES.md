# NexusPay Ramp Fee System

## Overview
NexusPay's ramp fee system is designed to generate revenue from on/off-ramp transactions while providing competitive rates and incentivizing higher transaction volumes and user loyalty.

## Fee Structure

### Base Fees by Payment Method
- Bank Transfer: 1.0%
- Card Payment: 2.5%
- Mobile Money: 1.5%
- M-Pesa: 1.2%

### Volume-Based Discounts
- Transactions > $10,000: 0.2% discount
- Transactions > $50,000: 0.5% discount
- Transactions > $100,000: 0.8% discount

### Loyalty Tier Discounts
- Tier 1 (Regular): 0.1% discount
- Tier 2 (Premium): 0.2% discount
- Tier 3 (VIP): 0.3% discount

### Minimum Fee
- 0.5% minimum fee applies regardless of discounts

## API Endpoints

### 1. Create Ramp Transaction
```http
POST /api/ramp/transaction
Authorization: Bearer <token>

{
    "type": "ON_RAMP",
    "paymentMethod": "BANK_TRANSFER",
    "fiatCurrency": "USD",
    "fiatAmount": 1000,
    "cryptoToken": "USDC"
}
```

### 2. Get User Transactions
```http
GET /api/ramp/transactions?type=ON_RAMP&status=COMPLETED
Authorization: Bearer <token>
```

### 3. Get Transaction Statistics
```http
GET /api/ramp/stats
Authorization: Bearer <token>
```

### 4. Calculate Potential Savings
```http
POST /api/ramp/calculate-savings
Authorization: Bearer <token>

{
    "amount": 10000,
    "currentTier": "TIER_1",
    "nextTier": "TIER_2"
}
```

## Response Examples

### Transaction Creation Response
```json
{
    "success": true,
    "message": "Ramp transaction created successfully",
    "data": {
        "type": "ON_RAMP",
        "status": "PENDING",
        "paymentMethod": "BANK_TRANSFER",
        "fiatCurrency": "USD",
        "fiatAmount": 1000,
        "cryptoToken": "USDC",
        "cryptoAmount": 1000,
        "feePercentage": 0.9,
        "feeAmount": 9,
        "totalAmount": 1009,
        "paymentReference": "NP-20240315123456-ABC123"
    }
}
```

### Transaction Statistics Response
```json
{
    "success": true,
    "message": "Transaction statistics retrieved successfully",
    "data": {
        "totalVolume": 50000,
        "totalFees": 450,
        "averageProcessingTime": 2.5,
        "transactionCount": 10
    }
}
```

### Savings Calculation Response
```json
{
    "success": true,
    "message": "Savings calculation completed",
    "data": {
        "currentFees": 90,
        "potentialFees": 80,
        "savings": 10
    }
}
```

## Implementation Details

### Transaction Processing
1. User initiates a ramp transaction
2. System validates input parameters
3. Calculates applicable fees based on:
   - Payment method
   - Transaction volume
   - User's loyalty tier
4. Creates transaction record
5. Processes payment
6. Updates transaction status

### Fee Calculation Logic
1. Start with base fee for payment method
2. Apply volume-based discount if applicable
3. Apply loyalty tier discount
4. Ensure final fee is not below minimum (0.5%)

### Security Measures
1. Authentication required for all endpoints
2. Input validation and sanitization
3. Rate limiting
4. Transaction monitoring
5. Secure payment processing

## Best Practices
1. Always verify transaction details before confirming
2. Monitor transaction status
3. Keep records of all transactions
4. Regular reconciliation
5. Maintain adequate liquidity

## Error Handling
Standard error responses:
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
- `INVALID_INPUT`: Invalid parameters
- `INVALID_AMOUNT`: Invalid transaction amount
- `UNSUPPORTED_TOKEN`: Token not supported
- `PAYMENT_FAILED`: Payment processing failed

## Future Improvements
1. Additional payment methods
2. Dynamic fee adjustment based on market conditions
3. Enhanced loyalty program
4. Advanced analytics and reporting
5. Integration with more payment providers
6. Automated compliance checks 