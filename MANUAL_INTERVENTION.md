# Manual M-Pesa Receipt Verification System

## Overview

This system provides a secure manual intervention mechanism for users when automatic M-Pesa payment detection fails. Users can manually submit their M-Pesa receipt numbers to complete crypto purchases.

## Security Features

1. **User Ownership Verification**: Only the original purchaser can submit the receipt for their transaction
2. **Single-Use Receipts**: Each M-Pesa receipt can only be used once across the entire platform
3. **Transaction Status Validation**: Only eligible transactions (reserved, error, failed) can use manual submission
4. **Direct Buy Only**: Manual submission is only available for direct crypto purchases
5. **Receipt Format Validation**: M-Pesa receipts must be exactly 10 alphanumeric characters

## API Endpoints

### 1. Submit M-Pesa Receipt Manually

**POST** `/api/mpesa/submit-receipt`

Submit an M-Pesa receipt number for manual verification and crypto release.

**Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "mpesaReceiptNumber": "ABC1234567",
  "transactionId": "uuid-of-transaction"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "M-Pesa receipt verified and crypto transfer initiated",
  "data": {
    "transactionId": "uuid-of-transaction",
    "mpesaReceiptNumber": "ABC1234567",
    "cryptoAmount": 100.50,
    "tokenType": "USDC",
    "chain": "arbitrum",
    "recipient": "0x...",
    "queuedTxId": "queue-id",
    "status": "processing",
    "estimatedCompletionTime": "2024-01-01T12:05:00.000Z",
    "note": "Your M-Pesa receipt has been verified. Crypto will be transferred to your wallet shortly."
  }
}
```

**Error Responses:**
- `400`: Invalid receipt format, receipt already used, transaction not eligible
- `401`: Authentication required
- `404`: Transaction not found or no permission
- `500`: Internal server error

### 2. Get Transactions Requiring Intervention

**GET** `/api/mpesa/pending-interventions`

Get a list of user's transactions that may require manual intervention.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Transactions requiring intervention retrieved successfully",
  "data": {
    "transactions": [
      {
        "transactionId": "uuid-of-transaction",
        "amount": 13000,
        "cryptoAmount": 100,
        "tokenType": "USDC",
        "chain": "arbitrum",
        "status": "reserved",
        "createdAt": "2024-01-01T12:00:00.000Z",
        "requiresManualIntervention": true,
        "hasReceiptSubmitted": false,
        "eligibleForManualSubmission": true
      }
    ],
    "totalCount": 1,
    "message": "You have transactions that may require manual M-Pesa receipt submission"
  }
}
```

## Usage Flow

1. **User makes crypto purchase** via `/api/mpesa/buy-crypto`
2. **Automatic processing fails** (M-Pesa successful but crypto not released)
3. **User checks pending transactions** via `/api/mpesa/pending-interventions`
4. **User submits M-Pesa receipt** via `/api/mpesa/submit-receipt`
5. **System validates receipt** and queues crypto transfer with high priority
6. **Crypto is transferred** to user's wallet within 2 minutes

## Business Logic

### Eligible Transactions
- Status: `reserved`, `error`, or `failed`
- Type: `fiat_to_crypto`
- Direct buy: `true`
- Created within last 24 hours
- No M-Pesa receipt already submitted

### Validation Steps
1. Authenticate user
2. Validate receipt format (10 alphanumeric characters)
3. Check transaction ownership
4. Verify receipt hasn't been used before
5. Confirm transaction eligibility
6. Validate platform wallet balance
7. Queue crypto transfer with high priority

### Security Measures
- Receipt numbers are stored in uppercase for consistency
- Database constraints prevent duplicate receipt usage
- User can only submit receipts for their own transactions
- Comprehensive audit logging for all manual submissions
- Priority queuing ensures fast processing

## Error Handling

The system handles various error scenarios:
- Invalid receipt formats
- Duplicate receipt usage attempts
- Insufficient platform wallet balance
- Non-existent or unauthorized transactions
- System processing errors

All errors are logged for monitoring and include user-friendly messages with specific error codes.

## Monitoring

All manual interventions are logged with:
- Transaction details
- User information
- Receipt numbers
- Processing status
- Execution times

This enables comprehensive reconciliation and fraud detection. 