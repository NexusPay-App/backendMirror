# KPLC Token Integration Guide

This document explains how the KPLC (Kenya Power) token messaging system works in NexusPay.

## Overview

When users buy Kenya Power tokens through NexusPay, they should receive the actual KPLC token message on their phone. This integration ensures that KPLC token messages are captured and forwarded to users.

## How It Works

### 1. Transaction Flow

1. **User initiates payment**: User pays for KPLC tokens using crypto
2. **Crypto transfer**: USDC is transferred from user to platform wallet
3. **B2B Paybill payment**: Platform pays KPLC via M-Pesa B2B BusinessPayBill
4. **KPLC processes payment**: KPLC receives payment and generates token
5. **Token message sent**: KPLC sends token message to user's phone
6. **Token captured**: Our system captures and forwards the token message

### 2. KPLC Token Message Format

KPLC typically sends messages in this format:
```
KPLC: Your token is 1234-5678-9012-3456. Units: 12.34 kWh. 
Amount: KES 500.00. Meter: 12345678901. Time: 10/09/2025 15:30:00
```

## API Endpoints

### 1. KPLC Token Webhook
**POST** `/api/kplc/webhook/token`

Receives token messages from KPLC or external systems.

**Request Body:**
```json
{
  "accountNumber": "12345678901",
  "tokenMessage": "KPLC: Your token is 1234-5678-9012-3456. Units: 12.34 kWh.",
  "amount": 500,
  "phoneNumber": "+254712345678",
  "timestamp": "2025-09-10T15:30:00Z"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Token message received"
}
```

### 2. Manual Token Sending
**POST** `/api/kplc/send-token`

Manually send a KPLC token message (for admin/testing).

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{
  "transactionId": "uuid-transaction-id",
  "tokenMessage": "KPLC: Your token is 1234-5678-9012-3456. Units: 12.34 kWh."
}
```

### 3. Transaction Status
**GET** `/api/kplc/transaction/:transactionId/status`

Check if a transaction has received its KPLC token.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "transactionId": "uuid-transaction-id",
    "status": "completed",
    "amount": 500,
    "accountNumber": "12345678901",
    "paybillNumber": "888880",
    "hasKPLCToken": true,
    "tokenProcessed": true,
    "kplcToken": "KPLC: Your token is 1234-5678-9012-3456. Units: 12.34 kWh.",
    "tokenReceivedAt": "2025-09-10T15:30:00Z",
    "createdAt": "2025-09-10T15:25:00Z",
    "completedAt": "2025-09-10T15:28:00Z"
  }
}
```

### 4. KPLC Statistics
**GET** `/api/kplc/stats`

Get overall KPLC transaction statistics.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalTransactions": 150,
    "completedTransactions": 145,
    "tokensReceived": 140,
    "pendingTokens": 5,
    "tokenSuccessRate": "96.55"
  }
}
```

### 5. Simulate Token (Testing)
**POST** `/api/kplc/simulate-token`

Simulate a KPLC token message for testing.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{
  "transactionId": "uuid-transaction-id",
  "tokenMessage": "KPLC: Your token is 1234-5678-9012-3456. Units: 12.34 kWh."
}
```

## Monitoring and Alerts

### 1. Automatic Monitoring

The system automatically monitors for KPLC transactions that should receive tokens:

- **Frequency**: Every 10 minutes
- **Scope**: Transactions from the last 24 hours
- **Alert**: If no token received after 30 minutes

### 2. Missing Token Alerts

When a token is not received within 30 minutes:
- Transaction is marked for manual intervention
- Admin is notified via console logs
- User can be manually sent the token

## SMS Message Format

When a KPLC token is received, users get an SMS in this format:

```
⚡ KENYA POWER TOKEN

🔑 KPLC: Your token is 1234-5678-9012-3456. Units: 12.34 kWh.

📊 Account: 12345678901
💰 Amount: 500 KES
🆔 TX: 0af5b8f2-ee60-4fa7-901e-a3b1b3efafed
⏰ 10/09/2025 15:30:00

Thank you for using NEXUSPAY!
```

## Database Schema

### Escrow Model Updates

The `metadata` field in the Escrow model now includes:

```javascript
{
  // ... existing metadata
  kplcPaymentCompleted: true,
  kplcTokenExpected: true,
  kplcTokenMonitoringStarted: "2025-09-10T15:28:00Z",
  kplcToken: "KPLC: Your token is 1234-5678-9012-3456. Units: 12.34 kWh.",
  kplcTokenReceivedAt: "2025-09-10T15:30:00Z",
  kplcTokenProcessed: true,
  kplcTokenTimeout: false,
  requiresManualIntervention: false
}
```

## Testing

### 1. Test Transaction Flow

1. Make a KPLC payment through the normal flow
2. Wait for B2B callback to complete
3. Use the simulate endpoint to send a test token
4. Verify user receives the token SMS

### 2. Test Webhook

```bash
curl -X POST http://localhost:8000/api/kplc/webhook/token \
  -H "Content-Type: application/json" \
  -d '{
    "accountNumber": "12345678901",
    "tokenMessage": "KPLC: Your token is 1234-5678-9012-3456. Units: 12.34 kWh.",
    "amount": 500,
    "phoneNumber": "+254712345678"
  }'
```

### 3. Check Transaction Status

```bash
curl -X GET http://localhost:8000/api/kplc/transaction/{transactionId}/status \
  -H "Authorization: Bearer <jwt_token>"
```

## Troubleshooting

### 1. Token Not Received

**Symptoms:**
- Transaction completed but no token SMS
- User reports missing token

**Solutions:**
1. Check transaction status endpoint
2. Use manual token sending endpoint
3. Contact KPLC if payment was successful

### 2. Webhook Not Working

**Symptoms:**
- KPLC webhook returns errors
- Tokens not being processed

**Solutions:**
1. Check webhook URL configuration
2. Verify webhook service is running
3. Check backend logs for errors

### 3. SMS Not Sent

**Symptoms:**
- Token processed but user didn't receive SMS

**Solutions:**
1. Check Africa's Talking configuration
2. Verify phone number format
3. Check SMS service logs

## Configuration

### Environment Variables

No additional environment variables are required. The system uses existing:
- `AFRICAS_TALKING_API_KEY` for SMS
- `MPESA_WEBHOOK_URL` for webhook base URL

### Webhook Service

The webhook service is deployed at:
- **Local**: `http://localhost:8000/api/kplc/webhook/token`
- **Production**: `https://your-domain.com/api/kplc/webhook/token`

## Security Considerations

1. **Webhook Authentication**: Consider adding webhook signature verification
2. **Rate Limiting**: Webhook endpoints should have rate limiting
3. **Input Validation**: All webhook inputs are validated
4. **Logging**: All token processing is logged for audit

## Future Enhancements

1. **Multiple Utility Support**: Extend to other utilities (water, gas)
2. **Token Parsing**: Extract specific token numbers and units
3. **User Preferences**: Allow users to choose SMS format
4. **Analytics**: Track token delivery success rates
5. **Retry Logic**: Automatic retry for failed token deliveries
