# Business Balance Endpoints - Complete API Documentation

This document contains the business balance endpoints for the NexusPay platform.

---

## 💰 **Business Balance Management**

### 1. Get Business Balance Overview
**Endpoint:** `GET /api/business/:businessId/balance`

**Headers:**
```json
{
  "Authorization": "Bearer <JWT_TOKEN>",
  "Content-Type": "application/json"
}
```

**Path Parameters:**
- `businessId` (string, required) - The business account ID

**Success Response (200):**
```json
{
  "success": true,
  "message": "Business balance overviehave you w retrieved successfully",
  "data": {
    "businessId": "67c9bd80c4e15a99274c2b73",
    "businessName": "Sample Business",
    "merchantId": "NX-9674944361",
    "walletAddress": "0x85127dF1008d286576d05629182a743BeF311794",
    "overview": {
      "totalUSDValue": 0.6,
      "totalKESValue": 80.1,
      "activeChains": ["arbitrum"],
      "totalTokens": {
        "USDC": 0.6
      },
      "lastUpdated": "2025-09-10T14:45:25.411Z"
    },
    "balances": {
      "arbitrum": {
        "USDC": {
          "balance": 0.6,
          "usdValue": 0.6,
          "kesValue": 80.1,
          "price": 1
        },
        "USDT": {
          "balance": 0,
          "usdValue": 0,
          "kesValue": 0,
          "price": 1
        },
        "DAI": {
          "balance": 0,
          "usdValue": 0,
          "kesValue": 0,
          "price": 0
        },
        "WBTC": {
          "balance": 0,
          "usdValue": 0,
          "kesValue": 0,
          "price": 0
        },
        "WETH": {
          "balance": 0,
          "usdValue": 0,
          "kesValue": 0,
          "price": 0
        },
        "ARB": {
          "balance": 0,
          "usdValue": 0,
          "kesValue": 0,
          "price": 0
        }
      },
      "base": {
        "USDC": {
          "balance": 0,
          "usdValue": 0,
          "kesValue": 0,
          "price": 1
        },
        "WETH": {
          "balance": 0,
          "usdValue": 0,
          "kesValue": 0,
          "price": 0
        }
      },
      "celo": {
        "USDC": {
          "balance": 0,
          "usdValue": 0,
          "kesValue": 0,
          "price": 1
        },
        "USDT": {
          "balance": 0,
          "usdValue": 0,
          "kesValue": 0,
          "price": 1
        }
      },
      "polygon": {
        "USDC": {
          "balance": 0,
          "usdValue": 0,
          "kesValue": 0,
          "price": 1
        },
        "USDT": {
          "balance": 0,
          "usdValue": 0,
          "kesValue": 0,
          "price": 1
        },
        "DAI": {
          "balance": 0,
          "usdValue": 0,
          "kesValue": 0,
          "price": 0
        },
        "WBTC": {
          "balance": 0,
          "usdValue": 0,
          "kesValue": 0,
          "price": 0
        },
        "WETH": {
          "balance": 0,
          "usdValue": 0,
          "kesValue": 0,
          "price": 0
        },
        "MATIC": {
          "balance": 0,
          "usdValue": 0,
          "kesValue": 0,
          "price": 0.85
        }
      },
      "optimism": {
        "USDC": {
          "balance": 0,
          "usdValue": 0,
          "kesValue": 0,
          "price": 1
        },
        "USDT": {
          "balance": 0,
          "usdValue": 0,
          "kesValue": 0,
          "price": 1
        },
        "DAI": {
          "balance": 0,
          "usdValue": 0,
          "kesValue": 0,
          "price": 0
        },
        "WBTC": {
          "balance": 0,
          "usdValue": 0,
          "kesValue": 0,
          "price": 0
        },
        "WETH": {
          "balance": 0,
          "usdValue": 0,
          "kesValue": 0,
          "price": 0
        },
        "OP": {
          "balance": 0,
          "usdValue": 0,
          "kesValue": 0,
          "price": 0
        }
      }
    },
    "summary": {
      "totalChains": 5,
      "activeChainsCount": 1,
      "totalTokensCount": 1,
      "supportedTokens": ["USDC", "USDT", "ETH", "MATIC", "CELO"]
    }
  }
}
```

**Error Responses:**
- `401` - Authentication required
- `400` - Business ID required
- `404` - Business not found
- `403` - Unauthorized access

---

### 2. Get Business Balance for Specific Chain
**Endpoint:** `GET /api/business/:businessId/balance/:chain`

**Headers:**
```json
{
  "Authorization": "Bearer <JWT_TOKEN>",
  "Content-Type": "application/json"
}
```

**Path Parameters:**
- `businessId` (string, required) - The business account ID
- `chain` (string, required) - The blockchain network (arbitrum, base, celo, polygon, optimism)

**Success Response (200):**
```json
{
  "success": true,
  "message": "Business balance for arbitrum retrieved successfully",
  "data": {
    "businessId": "67c9bd80c4e15a99274c2b73",
    "businessName": "Sample Business",
    "merchantId": "NX-9674944361",
    "walletAddress": "0x85127dF1008d286576d05629182a743BeF311794",
    "chain": "arbitrum",
    "chainInfo": {
      "name": "Arbitrum",
      "chainId": 42161,
      "nativeToken": "ETH",
      "explorer": "https://arbiscan.io"
    },
    "balances": {
      "USDC": {
        "balance": 0.6,
        "usdValue": 0.6,
        "kesValue": 80.1,
        "price": 1,
        "contractAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"
      },
      "USDT": {
        "balance": 0,
        "usdValue": 0,
        "kesValue": 0,
        "price": 1,
        "contractAddress": "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9"
      },
      "DAI": {
        "balance": 0,
        "usdValue": 0,
        "kesValue": 0,
        "price": 0,
        "contractAddress": "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1"
      },
      "WBTC": {
        "balance": 0,
        "usdValue": 0,
        "kesValue": 0,
        "price": 0,
        "contractAddress": "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f"
      },
      "WETH": {
        "balance": 0,
        "usdValue": 0,
        "kesValue": 0,
        "price": 0,
        "contractAddress": "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"
      },
      "ARB": {
        "balance": 0,
        "usdValue": 0,
        "kesValue": 0,
        "price": 0,
        "contractAddress": "0x912CE59144191C1204E64559FE8253a0e49E6548"
      }
    },
    "summary": {
      "totalUSDValue": 0.6,
      "totalKESValue": 80.1,
      "tokensWithBalance": 1,
      "supportedTokens": ["USDC", "USDT", "DAI", "WBTC", "WETH", "ARB"]
    },
    "lastUpdated": "2025-09-10T14:45:52.650Z"
  }
}
```

**Supported Chains:**
- `arbitrum` - Arbitrum One (Chain ID: 42161)
- `base` - Base (Chain ID: 8453)
- `celo` - Celo (Chain ID: 42220)
- `polygon` - Polygon (Chain ID: 137)
- `optimism` - Optimism (Chain ID: 10)

**Error Responses:**
- `401` - Authentication required
- `400` - Business ID or chain required
- `404` - Business not found
- `403` - Unauthorized access

---

## 🔒 **Authentication Requirements**

### Endpoints requiring JWT Authentication:
- All balance endpoints

### Security Features:
- Business ownership verification
- Real blockchain data fetching
- Error handling with specific codes

---

## 📊 **Rate Limiting**

- **Balance requests:** 10 per minute per business

---

## 🚨 **Error Codes**

### Common Error Codes:
- `AUTH_REQUIRED` - Authentication required
- `MISSING_BUSINESS_ID` - Business ID is required
- `BUSINESS_NOT_FOUND` - Business account not found
- `UNAUTHORIZED` - Unauthorized access to business
- `BALANCE_FAILED` - Failed to retrieve balance

---

## 📝 **Usage Examples**

### Example 1: Check Business Balance Overview
```bash
curl -X GET "http://localhost:8000/api/business/67c9bd80c4e15a99274c2b73/balance" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json"
```

### Example 2: Check Business Balance for Specific Chain
```bash
curl -X GET "http://localhost:8000/api/business/67c9bd80c4e15a99274c2b73/balance/arbitrum" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json"
```

---

This documentation covers the business balance endpoints for comprehensive business financial management on the NexusPay platform.