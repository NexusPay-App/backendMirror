# NexusPay Fee and Yield System

## Overview
This document outlines NexusPay's comprehensive fee structure for various transactions and the yield system for liquidity providers.

## Transaction Fees

### 1. Ramp Fees (On/Off Ramp)

#### Mobile Money
| Amount Range | Fee Rate |
|-------------|----------|
| $0-$100     | 1.5%    |
| $100-$500   | 1.2%    |
| $500-$2000  | 1.0%    |
| $2000-$5000 | 0.8%    |
| $5000+      | 0.6%    |
Minimum fee: 0.5%

#### M-Pesa
| Amount Range | Fee Rate |
|-------------|----------|
| $0-$100     | 1.2%    |
| $100-$500   | 1.0%    |
| $500-$2000  | 0.8%    |
| $2000-$5000 | 0.6%    |
| $5000+      | 0.5%    |
Minimum fee: 0.3%

### 2. Swap Fees (Crypto-to-Crypto)
| Amount Range   | Fee Rate |
|---------------|----------|
| $0-$100       | 0.5%    |
| $100-$1000    | 0.4%    |
| $1000-$5000   | 0.3%    |
| $5000-$10000  | 0.2%    |
| $10000+       | 0.15%   |
Minimum fee: 0.1%

### 3. Transfer Fees (Sending Crypto)
| Amount Range | Fixed Fee |
|-------------|-----------|
| $0-$100     | $0.20    |
| $100-$500   | $0.30    |
| $500-$1000  | $0.50    |
| $1000-$5000 | $0.80    |
| $5000+      | $1.00    |

### 4. Merchant Payment Fees
| Amount Range   | Fee Rate |
|---------------|----------|
| $0-$100       | 0.15%   |
| $100-$1000    | 0.12%   |
| $1000-$5000   | 0.10%   |
| $5000-$10000  | 0.08%   |
| $10000+       | 0.05%   |
Minimum fee: 0.05%

## Liquidity Provider Yields

### Base APY Rates
| Token | Base Rate |
|-------|-----------|
| USDC  | 5.0% APY |
| USDT  | 5.0% APY |
| DAI   | 5.5% APY |
| WBTC  | 3.0% APY |
| WETH  | 4.0% APY |
| ARB   | 6.0% APY |

### Yield Bonuses

#### 1. Duration Bonus (Additional APY)
| Lock Duration | Bonus Rate |
|--------------|------------|
| 36+ hours    | +0.5% APY |
| 72+ hours    | +1.0% APY |
| 1+ week      | +2.0% APY |
| 1+ month     | +3.0% APY |
| 3+ months    | +5.0% APY |

#### 2. Amount Bonus (Additional APY)
| Amount       | Bonus Rate |
|-------------|------------|
| $10,000+    | +0.5% APY |
| $50,000+    | +1.0% APY |
| $100,000+   | +2.0% APY |
| $500,000+   | +3.0% APY |

#### 3. Utilization Bonus (Additional APY)
| Utilization Rate | Bonus Rate |
|-----------------|------------|
| 50%+            | +1.0% APY |
| 75%+            | +2.0% APY |
| 90%+            | +3.0% APY |

### Minimum Requirements
- Minimum lock duration: 36 hours
- Yields are calculated and compounded continuously
- Early withdrawal forfeits accrued yields

## Example Calculations

### 1. Ramp Transaction
```
Amount: $1,000 (Mobile Money)
Fee Rate: 1.0%
Fee Amount: $10
Total: $1,010
```

### 2. Crypto Transfer
```
Amount: $750
Fixed Fee: $0.50
Total: $750.50
```

### 3. Liquidity Provider Yield
```
Amount: $50,000 USDC
Duration: 1 week
Utilization: 75%

Base Rate: 5.0%
Duration Bonus: +2.0% (1 week+)
Amount Bonus: +1.0% ($50,000+)
Utilization Bonus: +2.0% (75%+)
Total APY: 10.0%

Weekly Yield: $50,000 * 10.0% * (7/365) = $95.89
```

## Implementation Details

### Fee Calculation
1. Determine transaction type
2. Find applicable fee tier based on amount
3. Apply minimum fee if calculated fee is lower
4. For transfers, use fixed fee structure
5. Calculate final amount including fee

### Yield Calculation
1. Verify minimum lock duration (36 hours)
2. Calculate base yield for token
3. Add applicable bonuses:
   - Duration bonus
   - Amount bonus
   - Utilization bonus
4. Calculate actual yield based on duration
5. Update yield continuously

## Best Practices
1. Always verify transaction amounts
2. Check fee tiers before processing
3. Monitor utilization rates
4. Regular yield distribution
5. Keep audit trails

## Error Handling
- Invalid amount validation
- Minimum fee enforcement
- Lock duration verification
- Yield calculation validation

## Future Improvements
1. Dynamic fee adjustment based on market conditions
2. Additional payment methods
3. Enhanced yield strategies
4. More token support
5. Advanced analytics for fee optimization
6. Automated yield distribution 