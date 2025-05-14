# NexusPay Admin Scripts

This directory contains utility scripts for NexusPay platform administration.

## Available Scripts

### 1. Fix Duplicate Phone Number Issues

Use this script to resolve duplicate phone number conflicts that may occur when creating admin users.

```bash
npx ts-node scripts/fixDuplicatePhoneNumber.ts
```

This script will:
1. Ask for the phone number with duplicates
2. Show all users with that phone number
3. Give options to either delete duplicate users or modify a phone number

### 2. Promote User to Admin

Use this script to promote an existing user to the admin role.

```bash
npx ts-node scripts/promoteToAdmin.ts
```

This script will:
1. Ask for the phone number of the user to promote
2. Show user details and confirm the promotion
3. Update the user's role to 'admin'

### 3. Fund Test Wallets

Use this script to add funds to test wallets for testing the platform's transaction features.

```bash
npx ts-node scripts/fundTestWallets.ts
```

This script offers three options:
1. Fund main platform wallet (requires an external funded wallet)
2. Fund fees wallet from main platform wallet
3. Fund a specific wallet address

### 4. List and Manage Escrow Transactions

Use this script to view, filter, and manage escrow transactions (onramp/offramp transactions).

```bash
npx ts-node scripts/listEscrowTransactions.ts
```

This script offers several options:
1. View all transactions (latest first)
2. Filter by status (pending/completed/failed)
3. Filter by type (fiat_to_crypto/crypto_to_fiat/etc.)
4. Find a transaction by ID
5. Retry a failed transaction

## Wallet Setup

The platform requires two wallets to be configured:
- Main Platform Wallet: Used for holding main funds and executing platform transactions
- Fees Wallet: Used for collecting transaction fees

To set up these wallets, run:

```bash
npx ts-node scripts/setupPlatformWallet.ts
```

## Troubleshooting

### Common Issues

1. **Admin User Creation Error (Duplicate Phone Number)**
   - Use the `fixDuplicatePhoneNumber.ts` script to resolve the duplicate phone number issue.

2. **Zero Balance in Test Wallets**
   - Use the `fundTestWallets.ts` script to add funds to the test wallets.

3. **User Not Having Admin Privileges**
   - Use the `promoteToAdmin.ts` script to promote an existing user to admin role.

4. **Failed Transactions**
   - Use the `listEscrowTransactions.ts` script to view and retry failed transactions.

### Environment Configuration

Make sure your `.env` file has the following variables set:
- `DEV_PLATFORM_WALLET_ADDRESS`: The address of the main platform wallet
- `DEV_PLATFORM_WALLET_PRIVATE_KEY`: The private key of the main platform wallet
- `FEES_WALLET_ADDRESS`: The address of the fees wallet
- `FEES_WALLET_PRIVATE_KEY`: The private key of the fees wallet 