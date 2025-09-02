# Transaction Endpoints Documentation

## Overview
This document describes all available transaction endpoints in the NexusPay API, providing comprehensive transaction data with advanced filtering capabilities and automatic status validation.

## Base URL
```
GET /api/transactions
```

## Authentication
All endpoints require authentication via JWT token:
```
Authorization: Bearer <JWT_TOKEN>
```

## 🆕 Status Validation System
The API now includes automatic transaction status validation:
- **Real-time correction**: Transaction statuses are automatically validated and corrected based on blockchain data
- **Blockchain hash validation**: Transactions with valid blockchain hashes are marked as "completed"
- **Age-based validation**: Transactions without hashes older than 24 hours are marked as "failed"
- **Admin tools**: Manual correction endpoints for bulk status fixes

---

## 1. User Transaction History
**Get authenticated user's transaction history with automatic status validation**

### Endpoint
```
GET /api/transactions/history
```

### Query Parameters
| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `page` | number | No | Page number (default: 1) | `?page=2` |
| `limit` | number | No | Items per page (default: 10, max: 100) | `?limit=25` |
| `status` | string | No | Filter by status | `?status=completed` |
| `type` | string | No | Filter by transaction type | `?type=fiat_to_crypto` |
| `chain` | string | No | Filter by blockchain | `?chain=arbitrum` |
| `tokenType` | string | No | Filter by token | `?tokenType=USDC` |
| `dateFrom` | ISO8601 | No | Filter from date | `?dateFrom=2024-01-01T00:00:00Z` |
| `dateTo` | ISO8601 | No | Filter to date | `?dateTo=2024-12-31T23:59:59Z` |

### Response Structure
```json
{
  "success": true,
  "message": "Enhanced transaction history retrieved successfully",
  "data": {
    "transactions": [
      {
        "id": "ABC123DEF4",
        "type": "fiat_to_crypto",
        "status": "completed",
        "amount": 1000,
        "token": {
          "symbol": "USDC",
          "name": "USD Coin",
          "amount": 7.5,
          "decimals": 6
        },
        "values": {
          "fiat": {
            "amount": 1000,
            "currency": "KES",
            "formatted": "KES 1,000"
          },
          "usd": {
            "amount": 7.5,
            "formatted": "$7.50"
          },
          "kes": {
            "amount": 1000,
            "formatted": "KES 1,000"
          }
        },
        "blockchain": {
          "chain": "arbitrum",
          "network": "Arbitrum One",
          "txHash": "0x1234567890abcdef...",
          "explorerUrl": "https://arbiscan.io/tx/0x1234567890abcdef...",
          "explorerName": "Arbiscan",
          "isConfirmed": true,
          "confirmations": 12
        },
        "timing": {
          "createdAt": "2024-01-15T10:30:00Z",
          "completedAt": "2024-01-15T10:32:15Z",
          "processingTimeSeconds": 135,
          "ageMinutes": 45,
          "formatted": {
            "created": "1/15/2024, 10:30:00 AM",
            "completed": "1/15/2024, 10:32:15 AM"
          }
        },
        "dashboard": {
          "priority": "normal",
          "category": "Buy Crypto",
          "statusColor": "#10B981",
          "icon": "🟢",
          "summary": "Bought 7.5 USDC for KES 1,000 on Arbitrum"
        },
        "statusValidation": {
          "wasCorrected": false,
          "originalStatus": "completed",
          "correctionReason": null,
          "validatedAt": "2024-01-15T10:35:00Z"
        }
      }
    ],
    "summary": {
      "total": 150,
      "page": 1,
      "limit": 10,
      "pages": 15,
      "statusCorrections": {
        "corrected": 0,
        "totalProcessed": 10
      }
    }
  }
}
```

---

## 2. All Platform Transactions (Admin Only)
**Get ALL transactions across the platform with comprehensive analytics**

### Endpoint
```
GET /api/transactions/all
```

### Query Parameters
| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `page` | number | No | Page number (default: 1) | `?page=2` |
| `limit` | number | No | Items per page (default: 50, max: 100) | `?limit=75` |
| `status` | string | No | Filter by status | `?status=completed` |
| `type` | string | No | Filter by transaction type | `?type=fiat_to_crypto` |
| `chain` | string | No | Filter by blockchain | `?chain=arbitrum` |
| `tokenType` | string | No | Filter by token | `?tokenType=USDC` |
| `dateFrom` | ISO8601 | No | Filter from date | `?dateFrom=2024-01-01T00:00:00Z` |
| `dateTo` | ISO8601 | No | Filter to date | `?dateTo=2024-12-31T23:59:59Z` |
| `userId` | string | No | Filter by specific user | `?userId=507f1f77bcf86cd799439011` |
| `minAmount` | number | No | Minimum amount filter | `?minAmount=100` |
| `maxAmount` | number | No | Maximum amount filter | `?maxAmount=10000` |
| `hasTransactionHash` | boolean | No | Has blockchain hash | `?hasTransactionHash=true` |
| `hasMpesaId` | boolean | No | Has M-Pesa ID | `?hasMpesaId=true` |

### Response Structure
```json
{
  "success": true,
  "message": "All platform transactions retrieved successfully",
  "data": {
    "transactions": [...],
    "summary": {
      "total": 1500,
      "page": 1,
      "limit": 50,
      "pages": 30,
      "filters": {...},
      "statusCorrections": {
        "corrected": 12,
        "totalProcessed": 1500
      }
    },
    "analytics": {
      "totalVolume": 1500000,
      "totalCryptoVolume": 11250,
      "averageTransactionSize": 1000,
      "statusDistribution": {
        "completed": 1200,
        "pending": 200,
        "failed": 100
      },
      "chainDistribution": {
        "arbitrum": 800,
        "celo": 400,
        "polygon": 300
      }
    }
  }
}
```

---

## 3. Onchain Transactions (Admin Only)
**Get ALL blockchain transactions across all chains**

### Endpoint
```
GET /api/transactions/onchain
```

### Query Parameters
| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `page` | number | No | Page number (default: 1) | `?page=2` |
| `limit` | number | No | Items per page (default: 50, max: 100) | `?limit=75` |
| `chain` | string | No | Filter by blockchain | `?chain=arbitrum` |
| `tokenType` | string | No | Filter by token | `?tokenType=USDC` |
| `dateFrom` | ISO8601 | No | Filter from date | `?dateFrom=2024-01-01T00:00:00Z` |
| `dateTo` | ISO8601 | No | Filter to date | `?dateTo=2024-12-31T23:59:59Z` |
| `userId` | string | No | Filter by specific user | `?userId=507f1f77bcf86cd799439011` |
| `minAmount` | number | No | Minimum amount filter | `?minAmount=100` |
| `maxAmount` | number | No | Maximum amount filter | `?maxAmount=10000` |
| `status` | string | No | Filter by status | `?status=completed` |

### Response Structure
```json
{
  "success": true,
  "message": "All onchain transactions retrieved successfully",
  "data": {
    "transactions": [
      {
        "id": "ABC123DEF4",
        "type": "fiat_to_crypto",
        "status": "completed",
        "amount": 1000,
        "token": {...},
        "values": {...},
        "blockchain": {
          "chain": "arbitrum",
          "network": "Arbitrum One",
          "txHash": "0x1234567890abcdef...",
          "explorerUrl": "https://arbiscan.io/tx/0x1234567890abcdef...",
          "explorerName": "Arbiscan",
          "confirmationStatus": "confirmed",
          "confirmations": 12,
          "isConfirmed": true,
          "networkFee": 0.001,
          "gasUsed": 21000,
          "gasPrice": "20000000000"
        },
        "user": {
          "id": "507f1f77bcf86cd799439011",
          "phone": "+254712345678",
          "email": "user@example.com",
          "wallet": "0x31c41BCa835C0d3c597cbBaFf2e8dBF973645fb4"
        },
        "timing": {...},
        "dashboard": {...},
        "statusValidation": {
          "wasCorrected": true,
          "originalStatus": "failed",
          "correctionReason": "Blockchain hash exists, transaction was successful",
          "validatedAt": "2024-01-15T10:35:00Z"
        }
      }
    ],
    "summary": {...},
    "blockchain": {
      "totalChains": 5,
      "chainDistribution": {
        "arbitrum": 800,
        "celo": 400,
        "polygon": 300
      },
      "totalVolume": 11250,
      "averageTransactionSize": 7.5
    }
  }
}
```

---

## 4. Fiat-Crypto Transactions (Admin Only)
**Get buy/sell crypto conversion transactions**

### Endpoint
```
GET /api/transactions/fiat-crypto
```

### Query Parameters
| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `page` | number | No | Page number (default: 1) | `?page=2` |
| `limit` | number | No | Items per page (default: 50, max: 100) | `?limit=75` |
| `type` | string | No | Filter by type | `?type=fiat_to_crypto` |
| `chain` | string | No | Filter by blockchain | `?chain=arbitrum` |
| `tokenType` | string | No | Filter by token | `?tokenType=USDC` |
| `dateFrom` | ISO8601 | No | Filter from date | `?dateFrom=2024-01-01T00:00:00Z` |
| `dateTo` | ISO8601 | No | Filter to date | `?dateTo=2024-12-31T23:59:59Z` |
| `userId` | string | No | Filter by specific user | `?userId=507f1f77bcf86cd799439011` |
| `minAmount` | number | No | Minimum amount filter | `?minAmount=100` |
| `maxAmount` | number | No | Maximum amount filter | `?maxAmount=10000` |
| `status` | string | No | Filter by status | `?status=completed` |
| `conversionType` | string | No | Filter by direction | `?conversionType=buy` |

### Response Structure
```json
{
  "success": true,
  "message": "Fiat-crypto conversion transactions retrieved successfully",
  "data": {
    "transactions": [
      {
        "id": "ABC123DEF4",
        "type": "fiat_to_crypto",
        "status": "completed",
        "amount": 1000,
        "conversion": {
          "direction": "KES → Crypto",
          "type": "fiat_to_crypto",
          "fiatAmount": 1000,
          "cryptoAmount": 7.5,
          "conversionRate": 0.0075,
          "effectiveRate": 133.33,
          "rateDisplay": "1 USDC = KES 133.33"
        },
        "token": {...},
        "values": {...},
        "blockchain": {...},
        "user": {...},
        "mpesa": {
          "transactionId": "MPESA123456",
          "receiptNumber": "REC123456"
        },
        "timing": {...},
        "dashboard": {...}
      }
    ],
    "summary": {...},
    "conversions": {
      "totalBuyVolume": 800000,
      "totalSellVolume": 700000,
      "totalCryptoVolume": 11250,
      "averageConversionRate": 133.5,
      "conversionDistribution": {
        "fiat_to_crypto": 800,
        "crypto_to_fiat": 700
      }
    }
  }
}
```

---

## 5. Transaction by ID
**Get detailed information about a specific transaction**

### Endpoint
```
GET /api/transactions/:id
```

### Path Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Transaction ID or database ObjectId |

### Response Structure
```json
{
  "success": true,
  "message": "Enhanced transaction details retrieved successfully",
  "data": {
    "id": "ABC123DEF4",
    "type": "fiat_to_crypto",
    "status": "completed",
    "amount": 1000,
    "token": {...},
    "values": {...},
    "blockchain": {...},
    "user": {...},
    "mpesa": {...},
    "timing": {...},
    "dashboard": {...},
    "statusValidation": {
      "wasCorrected": false,
      "originalStatus": "completed",
      "correctionReason": null,
      "validatedAt": "2024-01-15T10:35:00Z"
    }
  }
}
```

---

## 🆕 Admin Status Correction Endpoints

### 6. Manual Transaction Status Correction (Admin Only)
**Manually trigger transaction status correction based on blockchain data**

### Endpoint
```
POST /api/admin/transactions/fix-statuses
```

### Headers
```
Authorization: Bearer <ADMIN_JWT_TOKEN>
Content-Type: application/json
```

### Response Structure
```json
{
  "success": true,
  "message": "Transaction status correction completed successfully",
  "data": {
    "summary": {
      "totalProcessed": 12,
      "successfullyCorrected": 12,
      "errorsEncountered": 0,
      "markedAsFailed": 5,
      "completedWithoutHashes": 5
    },
    "details": {
      "correctedTransactions": [
        {
          "transactionId": "ABC123DEF4",
          "originalStatus": "failed",
          "newStatus": "completed",
          "blockchainHash": "0x1234567890abcdef...",
          "type": "fiat_to_crypto",
          "amount": 1000
        }
      ],
      "failedTransactions": [
        {
          "transactionId": "XYZ789ABC1",
          "originalStatus": "completed",
          "newStatus": "failed",
          "reason": "No blockchain hash found after 24 hours",
          "type": "fiat_to_crypto",
          "amount": 500
        }
      ]
    }
  }
}
```

---

## Frontend Integration Guide

### React/JavaScript Example

```javascript
// Fetch user transaction history
const fetchTransactionHistory = async (filters = {}) => {
  try {
    const queryParams = new URLSearchParams(filters);
    const response = await fetch(`/api/transactions/history?${queryParams}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Handle successful response
      console.log('Transactions:', data.data.transactions);
      console.log('Status corrections:', data.data.summary.statusCorrections);
      return data.data;
    } else {
      throw new Error(data.message);
    }
  } catch (error) {
    console.error('Error fetching transactions:', error);
    throw error;
  }
};

// Admin: Trigger status correction
const triggerStatusCorrection = async () => {
  try {
    const response = await fetch('/api/admin/transactions/fix-statuses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('adminToken')}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('Correction summary:', data.data.summary);
      return data.data;
    } else {
      throw new Error(data.message);
    }
  } catch (error) {
    console.error('Error triggering correction:', error);
    throw error;
  }
};
```

### Vue.js Example

```javascript
// Vue.js composable for transactions
export const useTransactions = () => {
  const transactions = ref([]);
  const loading = ref(false);
  const error = ref(null);

  const fetchHistory = async (filters = {}) => {
    loading.value = true;
    error.value = null;
    
    try {
      const queryParams = new URLSearchParams(filters);
      const response = await fetch(`/api/transactions/history?${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      const data = await response.json();
      
      if (data.success) {
        transactions.value = data.data.transactions;
        return data.data;
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  };

  return {
    transactions,
    loading,
    error,
    fetchHistory
  };
};
```

### Angular Example

```typescript
// Angular service for transactions
@Injectable({
  providedIn: 'root'
})
export class TransactionService {
  private apiUrl = '/api/transactions';

  constructor(private http: HttpClient) {}

  getTransactionHistory(filters: any = {}): Observable<any> {
    const params = new HttpParams({ fromObject: filters });
    
    return this.http.get(`${this.apiUrl}/history`, { params })
      .pipe(
        map((response: any) => {
          if (response.success) {
            return response.data;
          } else {
            throw new Error(response.message);
          }
        }),
        catchError(error => {
          console.error('Error fetching transactions:', error);
          throw error;
        })
      );
  }

  triggerStatusCorrection(): Observable<any> {
    return this.http.post('/api/admin/transactions/fix-statuses', {})
      .pipe(
        map((response: any) => {
          if (response.success) {
            return response.data;
          } else {
            throw new Error(response.message);
          }
        })
      );
  }
}
```

---

## Status Validation Logic

### Automatic Correction Rules

1. **Blockchain Hash Validation**
   ```javascript
   // If transaction has blockchain hash → Mark as COMPLETED
   if (tx.cryptoTransactionHash && tx.status === 'failed') {
     tx.status = 'completed';
     tx.metadata.statusCorrected = true;
   }
   ```

2. **Age-based Validation**
   ```javascript
   // If transaction has no hash and is older than 24h → Mark as FAILED
   const age = (Date.now() - new Date(tx.createdAt)) / (1000 * 60 * 60);
   if (!tx.cryptoTransactionHash && tx.status === 'completed' && age > 24) {
     tx.status = 'failed';
     tx.metadata.statusCorrected = true;
   }
   ```

### Status Validation Response

```json
{
  "statusValidation": {
    "wasCorrected": true,
    "originalStatus": "failed",
    "correctionReason": "Blockchain hash exists, transaction was successful",
    "validatedAt": "2024-01-15T10:35:00Z"
  }
}
```

---

## Supported Transaction Types

| Type | Description | Example |
|------|-------------|---------|
| `fiat_to_crypto` | Buy crypto with M-Pesa | KES → USDC |
| `crypto_to_fiat` | Sell crypto for M-Pesa | USDC → KES |
| `crypto_to_paybill` | Pay bills with crypto | USDC → Paybill |
| `crypto_to_till` | Pay till with crypto | USDC → Till |
| `token_transfer` | Direct token transfers | Wallet → Wallet |

## Supported Statuses

| Status | Description | Color | Icon |
|--------|-------------|-------|------|
| `pending` | Transaction initiated | 🟡 | ⏳ |
| `processing` | Transaction in progress | 🔵 | 🔄 |
| `completed` | Transaction successful | 🟢 | ✅ |
| `failed` | Transaction failed | 🔴 | ❌ |
| `error` | Transaction error | ⚫ | ⚠️ |
| `reserved` | Funds reserved | 🟠 | 🔒 |

## Supported Chains

| Chain | Network Name | Explorer | API Key Required |
|-------|--------------|----------|------------------|
| `arbitrum` | Arbitrum One | Arbiscan | Yes |
| `celo` | Celo Mainnet | Celo Explorer | Yes |
| `polygon` | Polygon | PolygonScan | Yes |
| `base` | Base | BaseScan | Yes |
| `optimism` | Optimism | Optimism Explorer | Yes |
| `ethereum` | Ethereum | Etherscan | Yes |
| `bnb` | BNB Smart Chain | BSCScan | Yes |
| `avalanche` | Avalanche C-Chain | Snowtrace | Yes |
| `fantom` | Fantom Opera | FantomScan | Yes |
| `gnosis` | Gnosis Chain | GnosisScan | Yes |
| `scroll` | Scroll | ScrollScan | Yes |
| `moonbeam` | Moonbeam | MoonbeamScan | Yes |
| `fuse` | Fuse Network | Fuse Explorer | Yes |
| `aurora` | Aurora | Aurora Explorer | Yes |
| `lisk` | Lisk | Lisk Explorer | Yes |
| `somnia` | Somnia | SomniaScan | Yes |

## Supported Tokens

| Token | Name | Decimals | Description |
|-------|------|----------|-------------|
| `USDC` | USD Coin | 6 | Stablecoin pegged to USD |
| `USDT` | Tether USD | 6 | Stablecoin pegged to USD |
| `BTC` | Bitcoin | 8 | Bitcoin |
| `ETH` | Ethereum | 18 | Ethereum |
| `WETH` | Wrapped Ethereum | 18 | Wrapped ETH |
| `WBTC` | Wrapped Bitcoin | 8 | Wrapped BTC |
| `DAI` | Dai | 18 | Decentralized stablecoin |
| `CELO` | Celo | 18 | Celo native token |

## Date Format
All date parameters should be in ISO8601 format:
```
2024-01-15T10:30:00Z
2024-01-15T10:30:00.000Z
```

## Error Responses

### Authentication Error
```json
{
  "success": false,
  "message": "Authentication required",
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "You must be logged in to view transaction history"
  }
}
```

### Admin Access Required
```json
{
  "success": false,
  "message": "Admin access required",
  "error": {
    "code": "ADMIN_ACCESS_REQUIRED",
    "message": "Only administrators can access all transactions"
  }
}
```

### Validation Error
```json
{
  "success": false,
  "message": "Validation failed",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [
      "Page must be a positive integer",
      "Limit must be between 1 and 100"
    ]
  }
}
```

## Usage Examples

### Get User's Recent Transactions
```bash
curl -X GET "http://localhost:8000/api/transactions/history?limit=20&status=completed" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Get All Platform Transactions with Filters
```bash
curl -X GET "http://localhost:8000/api/transactions/all?chain=arbitrum&tokenType=USDC&dateFrom=2024-01-01T00:00:00Z&limit=100" \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN"
```

### Get Onchain Transactions for Specific Chain
```bash
curl -X GET "http://localhost:8000/api/transactions/onchain?chain=celo&status=completed&minAmount=100" \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN"
```

### Get Fiat-Crypto Buy Transactions
```bash
curl -X GET "http://localhost:8000/api/transactions/fiat-crypto?conversionType=buy&chain=arbitrum&limit=50" \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN"
```

### Get Transaction by ID
```bash
curl -X GET "http://localhost:8000/api/transactions/ABC123DEF4" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Trigger Status Correction (Admin)
```bash
curl -X POST "http://localhost:8000/api/admin/transactions/fix-statuses" \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

## Rate Limiting
- Standard users: 100 requests per minute
- Admin users: 500 requests per minute

## Frontend Implementation Notes

### Status Display Logic
```javascript
const getStatusDisplay = (transaction) => {
  const statusConfig = {
    completed: { color: '#10B981', icon: '✅', text: 'Completed' },
    pending: { color: '#F59E0B', icon: '⏳', text: 'Pending' },
    processing: { color: '#3B82F6', icon: '🔄', text: 'Processing' },
    failed: { color: '#EF4444', icon: '❌', text: 'Failed' },
    error: { color: '#6B7280', icon: '⚠️', text: 'Error' }
  };
  
  return statusConfig[transaction.status] || statusConfig.error;
};
```

### Transaction Card Component
```javascript
const TransactionCard = ({ transaction }) => {
  const status = getStatusDisplay(transaction);
  
  return (
    <div className="transaction-card">
      <div className="status-indicator" style={{ color: status.color }}>
        {status.icon} {status.text}
      </div>
      
      {transaction.blockchain?.txHash && (
        <a 
          href={transaction.blockchain.explorerUrl} 
          target="_blank" 
          rel="noopener noreferrer"
        >
          View on {transaction.blockchain.explorerName}
        </a>
      )}
      
      {transaction.statusValidation?.wasCorrected && (
        <div className="correction-notice">
          Status was automatically corrected based on blockchain data
        </div>
      )}
    </div>
  );
};
```

## Notes
- All amounts are returned in their original units (KES for fiat, token decimals for crypto)
- Timestamps are in UTC and formatted for both machine and human reading
- Explorer URLs are automatically generated for confirmed transactions
- User data is populated for admin endpoints
- Comprehensive analytics are provided for admin endpoints
- All endpoints support pagination for large datasets
- **Status validation happens automatically** on every transaction history request
- **Admin can manually trigger** status correction when needed
- **Correction metadata** is preserved for audit purposes
