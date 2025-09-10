# ENS (Ethereum Name Service) Integration

This document describes the ENS integration in NexusPay, which automatically creates ENS subdomains for all registered users.

## Overview

NexusPay integrates with the Ethereum Name Service (ENS) to provide each user with a unique, human-readable subdomain like `griff.nexuspay.eth`. This enhances user experience by providing memorable identifiers that can be used for payments, profiles, and other interactions.

## Features

- **Automatic Subdomain Creation**: Every new user registration automatically creates an ENS subdomain
- **Unique Subdomain Generation**: Subdomains are generated based on user information (email, phone, or user ID)
- **Resolver Records**: Each subdomain includes resolver records pointing to the user's wallet address
- **Admin Management**: Admins can batch create subdomains for existing users
- **Public Resolution**: Anyone can resolve subdomains to get user information

## Configuration

### Environment Variables

Add the following to your `.env` file:

```env
# ENS Configuration
ENS_PARENT_DOMAIN=nexuspay.eth
ENS_REGISTRY_ADDRESS=0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e
ENS_NAME_WRAPPER_ADDRESS=0x0635513f179D50A207757E05759CbD106d7dFcE8
ENS_RESOLVER_ADDRESS=0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63
ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY
ALCHEMY_API_KEY=your_alchemy_api_key
```

### Prerequisites

1. **Own the Parent Domain**: You must own the parent ENS domain (e.g., `nexuspay.eth`)
2. **Wrap the Domain**: The parent domain should be wrapped using the ENS Name Wrapper for advanced features
3. **Platform Wallet**: Your platform wallet must have sufficient ETH for gas fees
4. **Ethereum RPC**: Access to Ethereum mainnet RPC (recommended: Alchemy or Infura)

## API Endpoints

### Public Endpoints

#### Resolve ENS Subdomain
```http
GET /api/ens/resolve/{subdomain}
```

**Example:**
```bash
curl https://api.nexuspay.xyz/api/ens/resolve/griff.nexuspay.eth
```

**Response:**
```json
{
  "success": true,
  "message": "ENS subdomain resolved successfully",
  "data": {
    "subdomain": "griff.nexuspay.eth",
    "records": {
      "address": "0x1234...5678",
      "textRecords": {
        "description": "NexusPay user subdomain for user@example.com",
        "url": "https://nexuspay.xyz/profile/64f1a2b3c4d5e6f7g8h9i0j1"
      }
    }
  }
}
```

#### Check Subdomain Availability
```http
GET /api/ens/check-availability/{subdomainLabel}
```

**Example:**
```bash
curl https://api.nexuspay.xyz/api/ens/check-availability/griff
```

#### Get Domain Information
```http
GET /api/ens/domain-info
```

### Protected Endpoints (Require Authentication)

#### Get User's ENS Information
```http
GET /api/ens/my-ens
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "message": "ENS information retrieved successfully",
  "data": {
    "ensSubdomain": "griff123456.nexuspay.eth",
    "ensSubdomainCreated": true,
    "ensSubdomainTxHash": "0xabc123...def456",
    "walletAddress": "0x1234...5678",
    "resolverRecords": {
      "address": "0x1234...5678",
      "textRecords": {
        "description": "NexusPay user subdomain for user@example.com",
        "url": "https://nexuspay.xyz/profile/64f1a2b3c4d5e6f7g8h9i0j1"
      }
    }
  }
}
```

#### Create ENS Subdomain (for existing users)
```http
POST /api/ens/create-subdomain
Authorization: Bearer {token}
```

#### Update ENS Resolver Records
```http
PUT /api/ens/update-records
Authorization: Bearer {token}
Content-Type: application/json

{
  "textRecords": {
    "avatar": "https://example.com/avatar.jpg",
    "description": "Updated description",
    "com.twitter": "username"
  },
  "contentHash": "ipfs://QmHash..."
}
```

### Admin Endpoints

#### Batch Create ENS Subdomains
```http
POST /api/ens/batch-create
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "userIds": ["64f1a2b3c4d5e6f7g8h9i0j1", "64f1a2b3c4d5e6f7g8h9i0j2"]
}
```

## Subdomain Generation Logic

The system generates unique subdomains using the following logic:

1. **Primary**: Extract username from email (e.g., `john.doe@example.com` → `johndoe`)
2. **Fallback**: Use phone number (e.g., `+254712345678` → `254712345678`)
3. **Final Fallback**: Use last 8 characters of user ID
4. **Uniqueness**: Append timestamp to ensure uniqueness
5. **Validation**: Clean invalid characters and ensure proper format

**Example Generation:**
- Email: `griff@example.com` → `griff123456.nexuspay.eth`
- Phone: `+254712345678` → `254712345678123456.nexuspay.eth`
- User ID: `64f1a2b3c4d5e6f7g8h9i0j1` → `8h9i0j11123456.nexuspay.eth`

## Database Schema

The user model has been extended with ENS fields:

```typescript
interface IUser {
  // ... existing fields
  ensSubdomain?: string;           // The full subdomain (e.g., "griff.nexuspay.eth")
  ensSubdomainCreated?: boolean;   // Whether the subdomain was successfully created
  ensSubdomainTxHash?: string;     // Transaction hash of the subdomain creation
}
```

## Error Handling

The ENS integration is designed to be non-blocking:

- **Registration Success**: User registration succeeds even if ENS creation fails
- **Retry Mechanism**: Failed ENS creations can be retried using the API endpoints
- **Graceful Degradation**: The system continues to function without ENS subdomains

## Gas Costs

Creating ENS subdomains requires ETH for gas fees. Typical costs:

- **Subdomain Creation**: ~0.01-0.02 ETH (varies with gas prices)
- **Resolver Records**: ~0.005-0.01 ETH per record
- **Total per User**: ~0.02-0.05 ETH

## Security Considerations

1. **Private Key Security**: The platform wallet private key must be securely stored
2. **Gas Management**: Monitor gas costs and ensure sufficient ETH balance
3. **Rate Limiting**: Implement rate limiting to prevent abuse
4. **Validation**: Validate all inputs to prevent malicious subdomain creation

## Monitoring

Monitor the following metrics:

- ENS subdomain creation success rate
- Gas costs per subdomain creation
- Failed transactions and retry attempts
- User adoption of ENS subdomains

## Troubleshooting

### Common Issues

1. **"Insufficient funds"**: Ensure platform wallet has sufficient ETH
2. **"Domain not wrapped"**: Wrap the parent domain using ENS Name Wrapper
3. **"Subdomain already exists"**: The system will automatically generate a new unique subdomain
4. **"RPC connection failed"**: Check your Ethereum RPC URL and API key

### Debug Mode

Enable debug logging by setting:
```env
NODE_ENV=development
```

This will provide detailed logs of ENS operations.

## Future Enhancements

- **Custom Subdomain Selection**: Allow users to choose their subdomain
- **Subdomain Transfers**: Enable users to transfer subdomains
- **Advanced Resolver Records**: Support for more ENS record types
- **Off-chain Resolution**: Implement CCIP Read for scalability
- **Subdomain Expiration**: Implement time-based subdomain expiration

## Support

For issues related to ENS integration:

1. Check the logs for detailed error messages
2. Verify your ENS configuration
3. Ensure sufficient ETH balance for gas fees
4. Contact the development team with specific error details
