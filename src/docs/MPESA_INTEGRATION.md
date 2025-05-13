# MPESA Integration Documentation

This document provides a comprehensive overview of the MPESA integration in the NexusPay backend system.

## Features

The MPESA integration includes the following core features:

1. **STK Push for Deposits** - Users can deposit funds via MPESA, which are converted to crypto and transferred to their wallet.
2. **Withdrawal to MPESA** - Users can convert crypto to fiat and withdraw to their MPESA accounts.
3. **Payment Options** - Implementation of paybill and till payment options for merchants.
4. **Transaction Status Tracking** - A comprehensive API for tracking transaction status with detailed information.
5. **Automatic Retry Mechanism** - Failed transactions are automatically retried based on a scheduled system.

## Architecture

The MPESA integration follows a microservices-inspired architecture with the following components:

### Controllers

- `mpesaController.ts` - Contains all the endpoint handlers for MPESA-related operations.

### Middleware

- `mpesaValidators.ts` - Contains validation rules for all MPESA-related requests.

### Models

- `escrowModel.ts` - Database model for tracking transactions between initiation and completion.

### Services

- `mpesa.ts` - Core service for interacting with the MPESA API.
- `mpesaRetry.ts` - Service for retrying failed transactions.
- `scheduler.ts` - Scheduler service to run periodic tasks including transaction retries.

### Routes

- `mpesaRoutes.ts` - API route definitions for MPESA operations.

## Transaction Flow

### Deposit Flow (Fiat to Crypto)

1. User initiates deposit via the `/api/mpesa/deposit` endpoint.
2. System creates an escrow record with status "pending".
3. MPESA STK Push is initiated to the user's phone.
4. User confirms the transaction on their phone.
5. MPESA sends a callback to the `/api/mpesa/stk-push/result` endpoint.
6. System updates the escrow record based on the callback.
7. If successful, crypto tokens are sent to the user's wallet.
8. If failed, the transaction is marked for retry.

### Withdrawal Flow (Crypto to Fiat)

1. User initiates withdrawal via the `/api/mpesa/withdraw` endpoint.
2. System creates an escrow record with status "pending".
3. Crypto tokens are transferred from user's wallet to the platform wallet.
4. MPESA B2C payment is initiated to the user's phone.
5. MPESA sends a callback to the `/api/mpesa/b2c/result` endpoint.
6. System updates the escrow record based on the callback.
7. If failed, the transaction is marked for retry.

### Merchant Payment Flow

1. User initiates payment via the `/api/mpesa/paybill` or `/api/mpesa/till` endpoint.
2. System creates an escrow record with status "pending".
3. Crypto tokens are transferred from user's wallet to the platform wallet.
4. MPESA payment is initiated to the merchant.
5. MPESA sends a callback to the appropriate endpoint.
6. System updates the escrow record based on the callback.

## Retry Mechanism

The system includes an automatic retry mechanism for failed transactions:

1. A scheduler runs every 15 minutes to check for failed transactions.
2. Failed transactions less than 60 minutes old and with less than 3 retry attempts are retried.
3. The retry process includes:
   - Incrementing the retry count
   - Making a new API call to MPESA
   - Updating the transaction status

## API Endpoints

### Deposit
- **POST** `/api/mpesa/deposit`
- **Body**: `{ "amount": number, "phone": string }`
- **Response**: Transaction details with status

### Withdraw
- **POST** `/api/mpesa/withdraw`
- **Body**: `{ "amount": number, "phone": string }`
- **Response**: Transaction details with status

### Paybill Payment
- **POST** `/api/mpesa/paybill`
- **Body**: `{ "amount": number, "phone": string, "businessNumber": string, "accountNumber": string }`
- **Response**: Transaction details with status

### Till Payment
- **POST** `/api/mpesa/till`
- **Body**: `{ "amount": number, "phone": string, "tillNumber": string }`
- **Response**: Transaction details with status

### Transaction Status
- **GET** `/api/mpesa/transaction/:transactionId`
- **Response**: Detailed transaction status and information

## Webhooks

The system has multiple webhook endpoints to receive callbacks from MPESA:

- **STK Push**: `/api/mpesa/stk-push/result`
- **B2C**: `/api/mpesa/b2c/result`
- **Queue Timeout**: `/api/mpesa/queue`
- **Paybill**: `/api/mpesa/paybill/result`
- **Till**: `/api/mpesa/till/result`

## Error Handling

All MPESA operations include comprehensive error handling:

1. **Input Validation** - All inputs are validated before processing.
2. **Transaction Tracking** - All transactions are tracked even if they fail.
3. **Retry Mechanism** - Failed transactions are automatically retried.
4. **Error Codes** - All errors are returned with appropriate error codes.

## Testing

To test the MPESA integration:

1. Use the test script: `src/scripts/testRetry.ts`
2. Trigger the manual retry endpoint: `POST /api/internal/retry-transactions` (development mode only)

## Transaction Status Codes

- **pending**: Transaction has been initiated but not yet completed.
- **completed**: Transaction has been successfully completed.
- **failed**: Transaction has failed and may be retried.

## Best Practices

1. Always check transaction status after initiating a transaction.
2. Handle webhook callbacks properly with immediate acknowledgment.
3. Properly validate all inputs to avoid transaction failures.
4. Use the escrow system to track all transactions.
5. Check both MPESA status and blockchain status for complete transaction information. 