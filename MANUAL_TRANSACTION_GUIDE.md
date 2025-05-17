# Manual Transaction Processing Guide

This guide outlines the steps to manually process M-Pesa transactions when automatic token transfers fail.

## When M-Pesa Payment Succeeds but Token Transfer Fails

### Step 1: Verify the M-Pesa Transaction

1. Check the M-Pesa confirmation SMS received by the user.
2. Confirm payment details:
   - Amount paid
   - Transaction ID/receipt number
   - Time of transaction
   - Phone number used

### Step 2: Find the Pending Transaction in Database

```javascript
// Sample MongoDB query to find pending transactions
db.escrows.find({
  status: "pending",
  type: "fiat_to_crypto"
}).sort({ createdAt: -1 })
```

### Step 3: Manually Transfer Tokens

1. Use a properly funded wallet with sufficient token balance.
2. Transfer the correct amount of tokens to the user's wallet.
3. Use a blockchain explorer to verify the transaction success:
   - Arbitrum: https://arbiscan.io
   - Celo: https://explorer.celo.org
   - Polygon: https://polygonscan.com

### Step 4: Update the Transaction Record

```javascript
// Sample MongoDB query to update transaction status
db.escrows.updateOne(
  { transactionId: "<TRANSACTION_ID>" },
  { 
    $set: {
      status: "completed",
      completedAt: new Date(),
      cryptoTransactionHash: "<BLOCKCHAIN_TX_HASH>",
      notes: "Manually processed due to platform wallet issues"
    }
  }
)
```

### Step 5: Notify the User

Send a notification to the user that their transaction has been processed:

1. Email notification with transaction details
2. SMS notification with confirmation
3. In-app notification (if applicable)

Include:
- Transaction ID
- Amount of crypto received
- Blockchain explorer link to verify

## Prevention and Monitoring

### Regular Balance Checks

Run the balance check script regularly to monitor platform wallet balances:

```bash
npx ts-node src/scripts/checkPlatformBalances.ts
```

### Address Known Issues

Refer to SYSTEM_ISSUES.md for a comprehensive list of known issues and their solutions.

### Emergency Contact Information

For urgent wallet funding or transaction processing, contact:

- Admin Name: [Add admin name]
- Email: [Add admin email]
- Phone: [Add admin phone] 