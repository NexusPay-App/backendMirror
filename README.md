# NexusPay Backend

NexusPay is a crypto payment platform with MPESA integration, providing secure transactions and wallet management.

## Implementation Progress

We've implemented and optimized several key components of the NexusPay backend:

### Authentication System
- ✅ Complete registration flow with email and phone verification
- ✅ Secure login system with OTP verification
- ✅ Password reset and account management
- ✅ JWT-based authentication

### API Standardization
- ✅ Standardized response format across all endpoints
- ✅ Comprehensive input validation
- ✅ Consistent error handling and error codes
- ✅ Improved security practices

### Transaction System
- ✅ Send tokens to addresses or phone numbers
- ✅ Merchant payment functionality
- ✅ Transaction history tracking

### Infrastructure
- ✅ Redis caching for OTP storage
- ✅ MongoDB database integration
- ✅ Logging and error monitoring

## Next Steps

Based on our implementation plan, here are the next priorities:

1. **MPESA Integration**
   - Implement STK Push for deposits
   - Develop crypto withdrawal to MPESA
   - Create escrow system for pending transactions
   
2. **Business Account Features**
   - Implement business registration and verification
   - Create business wallet management
   - Develop business-to-personal transfers

3. **Real-time Updates**
   - Set up WebSocket server for live updates
   - Create transaction notification system
   - Implement real-time status updates

4. **Testing & Documentation**
   - Implement automated testing
   - Create detailed API documentation
   - Add monitoring and performance tracking

## Getting Started

### Prerequisites
- Node.js (v16+)
- MongoDB
- Redis

### Environment Variables

Create a `.env` file with the following:

```
PORT=8000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
REDIS_URL=redis://localhost:6379
EMAIL_USER=your_email@gmail.com
EMAIL_APP_PASSWORD=your_app_password
AFRICA_TALKING_API_KEY=your_api_key
AFRICA_TALKING_USERNAME=your_username
```

### Installation

```bash
npm install
npm run dev
```

## API Documentation

Refer to the [API_DOCUMENTATION.md](API_DOCUMENTATION.md) file for detailed API documentation.

## Implementation Roadmap

For a comprehensive implementation roadmap with code examples, see [NEXUSPAY_IMPLEMENTATION_PLAN.md](NEXUSPAY_IMPLEMENTATION_PLAN.md).

## Progress Tracking

To track implementation progress, refer to the [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md) file.

# NexusPay Backend 

## Overview

NexusPay Node.js/Express backend application provides APIs for user authentication, business registration, token transactions, and  balance inquiries. It's designed with scalability and maintainability in mind, using a structured approach with controllers and routes.

## Getting Started

### Prerequisites

- Node.js (version 14.x or later)
- npm (version 6.x or later)
- MongoDB (version 4.x or later)

### Installation

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/doyeninnit/nexuspay.git
   ```

2. **Navigate to Project Directory:**
   ```bash
   cd nexuspay/backend
   ```

3. **Install Dependencies:**
   ```bash
   npm install
   ```

4. **Set Up Environment Variables:**
   - Create a `.env` file in the project root.
   - Add variables like `DB_URI`, `JWT_SECRET`, etc.

### Running the Application

1. **Start the Server:**
   ```bash
   npx nodemon
   ```

## API Reference

### Authentication

#### `POST /api/auth`

- **Description**: User login and registration.
- **Request Body**:
  - `phoneNumber`: String
  - `password`: String
- **Responses**:
  - `200 OK`: `{ token: String, message: String, walletAddress: String, phoneNumber: String }`
  - `400 Bad Request`: `{ message: String }`
  - `401 Unauthorized`: `{ message: String }`
  - `500 Internal Server Error`: `{ message: String }`

### Business Registration

#### `POST /api/business/registerBusiness`

- **Description**: Register a new business.
- **Request Body**:
  - `businessName`: String
  - `ownerName`: String
  - `location`: String
  - `phoneNumber`: String
  - `password`: String
- **Responses**:
  - `200 OK`: `{ message: String, walletAddress: String, uniqueCode: String }`
  - `400 Bad Request`: `{ message: String }`
  - `500 Internal Server Error`: `{ message: String }`

### Token Transactions

#### `POST /api/token/sendToken`

- **Description**: Send tokens to a recipient.
- **Request Body**:
  - `tokenAddress`: String
  - `recipientPhoneNumber`: String
  - `amount`: Number
  - `senderAddress`: String
- **Responses**:
  - `200 OK`: `{ message: 'Token sent successfully!' }`
  - `400 Bad Request`: `{ message: String, error: String }`
  - `404 Not Found`: `{ message: String }`
  - `500 Internal Server Error`: `{ message: String, error: String }`

#### `POST /api/token/pay`

- **Description**: Process payment to a business.
- **Request Body**:
  - `tokenAddress`: String
  - `senderAddress`: String
  - `businessUniqueCode`: String
  - `amount`: Number
  - `confirm`: Boolean
- **Responses**:
  - `200 OK`: `{ message: String, businessName: String }` / `{ message: 'Token sent successfully to the business!' }`
  - `400 Bad Request`: `{ message: String }`
  - `404 Not Found`: `{ message: String }`
  - `500 Internal Server Error`: `{ message: String, error: String }`

#### `GET /api/token/token-transfer-events`

- **Description**: Get token transfer events.
- **Query Parameters**:
  - `address`: String
- **Responses**:
  - `200 OK`: JSON Array of `TokenTransferEvent`
  - `400 Bad Request`: `'Address required query parameters.'`
  - `500 Internal Server Error`: `'Internal server error.'`

### USDC Balance Inquiry

#### `GET /api/usdc/usdc-balance/:address`

- **Description**: Fetch USDC balance for a given address.
- **URL Parameters**:
  - `address`: String
- **Responses**:
  - `200 OK`: `{ balanceInUSDC: Number, balanceInKES: String, rate: Number }`
  - `500 Internal Server Error`: `'Failed to fetch balance.'`

## Models

### `User`

- **Fields**:
  - `phoneNumber`: String (unique)
  - `walletAddress`: String
  - `password`: String
  - `privateKey`: String

### `Business`

- **Fields**:
  - `businessName`: String
  - `ownerName`: String
  - `location`: String
  - `uniqueCode`: String (unique)
  - `phoneNumber`: String (unique)
  - `walletAddress`: String
  - `password`: String
  - `privateKey`: String

## Development

### Directory Structure

- `/src`
  - `/config`: Configuration and database connection setup.
  - `/controllers`: Contains logic for handling API requests.
  - `/models`: Database schema definitions.
  - `/routes`: API endpoint definitions.
  - `/utils`: Helper functions and shared business logic.
  - `index.ts`: Application entry point.
- `package.json`: Project metadata and dependencies.

## Testing

Currently, no specific testing framework is integrated. Future updates may include testing suites for unit and integration testing.

## Deployment

Deployment steps will vary based on the chosen hosting platform. General steps include environment setup, database connection, and server start-up.

## Contributing

Contributions to this project are welcome. Please follow standard GitHub pull request procedures.



