# NexusPay Liquidity Provision System

## Overview
The NexusPay Liquidity Provision system allows users to provide liquidity to the platform and earn yields based on the utilization of their provided funds. This document outlines how the system works, its features, and implementation details.

## Features
- Provide liquidity in supported tokens (USDC, USDT, DAI, WBTC, WETH, ARB, etc.)
- Multi-chain support across major networks
- Earn yields based on liquidity utilization
- Dynamic yield rates that increase with higher utilization
- Real-time tracking of earnings and positions
- Secure withdrawal system with OTP verification

## Supported Chains
1. Arbitrum
   - Full token support (USDC, USDT, DAI, WBTC, WETH, ARB)
   - Native gas token: ETH
   
2. Optimism
   - Full token support (USDC, USDT, DAI, WBTC, WETH, OP)
   - Native gas token: ETH

3. Polygon
   - Full token support (USDC, USDT, DAI, WBTC, WETH, MATIC)
   - Native gas token: MATIC

4. Base
   - Basic token support (USDC, WETH)
   - Native gas token: ETH

5. BNB Chain
   - Full token support (USDC, USDT, DAI, WBTC, WETH, BNB)
   - Native gas token: BNB

6. Avalanche
   - Full token support (USDC, USDT, DAI, WBTC, WETH)
   - Native gas token: AVAX

7. Celo
   - Basic token support (USDC, USDT)
   - Native gas token: CELO

8. Scroll
   - Basic token support (USDC)
   - Native gas token: ETH

9. Gnosis
   - Basic token support (USDC)
   - Native gas token: xDAI

10. Fantom
    - Basic token support (USDC)
    - Native gas token: FTM

11. Somnia
    - Basic token support (USDC)
    - Native gas token: SOM

12. Moonbeam
    - Basic token support (USDC)
    - Native gas token: GLMR

13. Fuse
    - Basic token support (USDC)
    - Native gas token: FUSE

14. Aurora
    - Basic token support (USDC)
    - Native gas token: ETH

15. Lisk
    - Basic token support (USDC)
    - Native gas token: ETH

## Yield Calculation
Yields are calculated based on two main factors:

1. Base Yield Rate (Annual Percentage Yield)
   - USDC: 5% APY
   - USDT: 5% APY
   - DAI: 5.5% APY
   - WBTC: 3% APY
   - WETH: 4% APY
   - ARB: 6% APY
   - Other tokens: Variable rates based on market conditions

2. Utilization Bonus
   - Additional yield based on the utilization rate of the provided liquidity
   - Higher utilization = Higher yield
   - Maximum bonus: Up to 3x base rate

## How to Use

### Providing Liquidity
1. Log in to your account
2. Navigate to the liquidity provision section
3. Select the chain you want to provide liquidity on
4. Choose the token and enter the amount
5. Confirm the transaction

Example:
```json
POST /api/liquidity/provide
{
    "token": "USDC",
    "amount": 1000,
    "chain": "arbitrum"  // Optional, defaults to arbitrum
}
```

### Withdrawing Liquidity
1. Navigate to your positions
2. Select the position you want to withdraw
3. Enter the withdrawal amount
4. Verify with OTP
5. Confirm the withdrawal

Example:
```json
POST /api/liquidity/withdraw
{
    "token": "USDC",
    "amount": 500,
    "otp": "123456",
    "chain": "arbitrum"  // Optional, defaults to arbitrum
}
```

## Security Features
1. OTP Verification for Withdrawals
   - One-time password sent to registered phone number
   - Required for all withdrawal transactions
   - 5-minute validity period

2. Transaction Monitoring
   - Real-time tracking of all liquidity movements
   - Automated alerts for suspicious activities
   - Multi-chain transaction verification

3. Rate Limiting
   - Protection against brute force attacks
   - Cooldown period between withdrawal attempts

## Error Handling
The API returns detailed error messages with appropriate HTTP status codes:

- 400: Invalid input parameters
- 401: Unauthorized (invalid or expired token)
- 403: Forbidden (insufficient permissions)
- 404: Resource not found
- 429: Too many requests (rate limit exceeded)
- 500: Internal server error

Each error response includes:
- Error code
- Human-readable message
- Additional context when available

## API Endpoints

### 1. Provide Liquidity
```http
POST /api/liquidity/provide
Authorization: Bearer <token>

{
    "token": "USDC",
    "amount": 1000,
    "chain": "arbitrum" // Optional, defaults to arbitrum
}
```

### 2. Get Liquidity Positions
```http
GET /api/liquidity/positions
Authorization: Bearer <token>
```

### 3. Get Token Stats
```http
GET /api/liquidity/stats/:token
Authorization: Bearer <token>
```

### 4. Withdraw Liquidity
```http
POST /api/liquidity/withdraw
Authorization: Bearer <token>

{
    "token": "USDC",
    "amount": 500,
    "otp": "123456", // Required for security
    "chain": "arbitrum" // Optional, defaults to arbitrum
}
```

## Response Examples

### Liquidity Position Response
```json
{
    "success": true,
    "message": "Liquidity positions retrieved successfully",
    "data": [
        {
            "token": "USDC",
            "amount": 1000,
            "yieldEarned": 25.5,
            "utilizationRate": 75,
            "currentYield": 7.5,
            "lastYieldCalculation": "2024-03-15T10:30:00Z"
        }
    ]
}
```

### Token Stats Response
```json
{
    "success": true,
    "message": "Liquidity stats retrieved successfully",
    "data": {
        "totalLiquidity": 100000,
        "utilizationRate": 75,
        "currentYieldRate": 7,
        "totalYieldEarned": 1500
    }
}
```

### Withdrawal Response
```json
{
    "success": true,
    "message": "Withdrawal successful",
    "data": {
        "withdrawnAmount": 500,
        "yieldEarned": 25.5,
        "totalWithdrawn": 525.5,
        "remainingBalance": 500,
        "token": "USDC",
        "chain": "arbitrum"
    }
}
```

## Implementation Details

### Liquidity Tracking
- Each liquidity provision is tracked in MongoDB using the `LiquidityProvider` model
- Utilization rates are updated periodically based on platform activity
- Yields are calculated in real-time when positions are viewed or modified

### Security Measures
1. All endpoints require authentication
2. Withdrawals require OTP verification
3. Input validation for all parameters
4. Rate limiting on API endpoints
5. Transaction validation before processing
6. Error handling and logging

### Yield Distribution
1. Yields are calculated and accrued continuously
2. Users can view their earned yields at any time
3. Yields are paid out in the same token as the provided liquidity
4. Withdrawals automatically include accrued yields

## Best Practices
1. Always check token allowance before providing liquidity
2. Monitor utilization rates for optimal yield
3. Keep track of transaction history
4. Maintain sufficient reserves for withdrawals
5. Never share your OTP with anyone

## Future Improvements
1. Additional token support
2. Advanced yield strategies
3. Governance system for yield parameters
4. Integration with more DeFi protocols
5. Enhanced analytics and reporting
6. Automated yield optimization
7. Multi-factor authentication options

## Testing
To ensure the system works correctly:
1. Run unit tests: `npm run test:unit`
2. Run integration tests: `npm run test:integration`
3. Test all API endpoints with different scenarios
4. Verify yield calculations
5. Test error handling 