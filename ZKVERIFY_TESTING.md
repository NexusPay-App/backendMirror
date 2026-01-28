# zkVerify Liquidity Track - Testing Guide

This document provides instructions for testing the zkVerify integration in backendMirror (liquidity track).

## Prerequisites

- Node.js 16+ installed
- MongoDB database
- zkVerify testnet credentials (or mock mode enabled)
- Test wallet with testnet tokens

## Setup

1. **Configure Environment**

```bash
cp env.example .env
```

Edit `.env` and add:

```bash
# zkVerify Configuration (Testnet)
ZKVERIFY_ENABLED=false  # Set to 'true' for real zkVerify testing
ZKVERIFY_NODE_URL=https://api.zkverify.io
ZKVERIFY_API_KEY=your_testnet_api_key
ZKVERIFY_NETWORK=testnet
ZKVERIFY_TIMEOUT_MS=30000
```

2. **Install Dependencies**

```bash
npm install
npm install --save-dev @types/jest jest ts-jest @types/node
```

## Running Tests

### Unit Tests

Test liquidity proof service:

```bash
npm test -- zkverify.test.ts
```

### Integration Tests

Test full LP proof flow:

```bash
npm test -- liquidity-zkverify-integration.test.ts
```

### All Tests

```bash
npm test
```

## Manual Testing

### 1. Provide Liquidity (Generates Tier Proof)

```bash
curl -X POST http://localhost:3000/api/liquidity/provide \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT" \
  -d '{
    "token": "USDC",
    "amount": 5000,
    "otp": "123456",
    "chain": "arbitrum"
  }'
```

Response should include:
- `tier` (bronze/silver/gold/platinum)
- `tierVerificationId` (if zkVerify enabled)

### 2. Check Liquidity Positions

```bash
curl -X GET http://localhost:3000/api/liquidity/positions \
  -H "Authorization: Bearer YOUR_JWT"
```

Shows all positions with tiers and zkVerify proof history.

### 3. View zkVerify Metrics

```bash
curl -X GET http://localhost:3000/api/liquidity/zkverify/metrics?startDate=2026-01-01&endDate=2026-12-31 \
  -H "Authorization: Bearer YOUR_JWT"
```

### 4. Get Milestone Report

```bash
curl -X GET http://localhost:3000/api/liquidity/zkverify/milestone-report?milestone=2 \
  -H "Authorization: Bearer YOUR_JWT"
```

## Testing Proof Types

### LP Tier Proof

Automatically generated when providing liquidity. Proves user's LP amount qualifies for a specific tier.

**Tiers:**
- Bronze: $0 - $1,000
- Silver: $1,000 - $5,000
- Gold: $5,000 - $25,000
- Platinum: $25,000+

### LP Duration Proof

Proves user has held position for >= N days.

```typescript
// Internal service call (not exposed via API yet)
await LiquidityProofService.generateDurationProof(provision, 30);
```

### LP Reward Claim Proof

Proves user is eligible to claim rewards (sufficient duration + amount).

```typescript
// Internal service call
await LiquidityProofService.generateRewardClaimProof(provision, 1000, 7);
```

## Mock Mode Testing

When `ZKVERIFY_ENABLED=false`:

- Proof submissions return mock `verificationId`
- Status checks return `verified` immediately
- No network calls to zkVerify
- Tier proofs still generated and persisted

## Tier Verification Flow

1. User provides liquidity
2. System calculates tier based on amount
3. Generates zkVerify proof for tier eligibility
4. Updates provision with `tierVerificationId`
5. Proof can be used for:
   - Tier-gated features
   - Lower fees for higher tiers
   - Exclusive reward pools

## Database Schema

Each liquidity provision has:

```typescript
{
  zkVerifyProofs: [
    {
      proofType: 'lp_tier',
      verificationId: 'zkv_abc123',
      verificationStatus: 'verified',
      zkVerifyTxHash: '0x...',
      submittedAt: Date
    }
  ],
  tier: 'gold',
  tierVerificationId: 'zkv_abc123',
  tierLastVerified: Date
}
```

## Metrics for Grant Reporting

The metrics endpoints track:

- **Total Proofs**: All zkVerify proofs submitted
- **Unique Users**: Distinct wallet addresses
- **Proofs by Type**: Breakdown (lp_tier, lp_duration, lp_reward_claim)
- **Proofs by Status**: pending/verified/failed
- **Tier Distribution**: How many users in each tier

## Troubleshooting

### Tier Not Updated

- Check provision was created successfully
- Verify zkVerify service is initialized
- Check logs for proof submission errors

### No verificationId

- Confirm `ZKVERIFY_ENABLED=true`
- Verify API key is set
- Check network connectivity

### Tests Failing

- Ensure MongoDB is running
- Check test database connection string
- Clear test data between runs

## Circuit Compilation (Future)

When ready to use real ZK circuits:

```bash
cd circuits
npm install
./compile_all.sh
```

This will:
1. Compile Circom circuits to R1CS
2. Generate proving keys
3. Generate verification keys
4. Export artifacts for production use

## Next Steps

1. Compile production Circom circuits
2. Deploy verification keys to zkVerify testnet
3. Test end-to-end with real proofs
4. Monitor proof submission success rates
5. Optimize gas costs and proof generation time
