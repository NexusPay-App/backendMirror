# NexusPay Admin API Testing Guide

This document provides guidance on testing the NexusPay admin API endpoints without requiring the creation of additional files.

## Available Testing Methods

### 1. Use the Command-Line Testing Tool

The project includes a modular command-line testing script that can test specific endpoints:

```bash
# Start the server
npm run dev

# In a separate terminal:

# Test all endpoints (non-destructive only)
npm run test:admin

# Test specific endpoint groups
npm run test:admin:users
npm run test:admin:transactions
npm run test:admin:wallets

# Test specific endpoints with parameters
npm run build
node dist/scripts/testAdminAPI.js -e users
node dist/scripts/testAdminAPI.js -e user -i <user_id>
```

### 2. Use cURL from the Command Line

You can test API endpoints directly using cURL:

```bash
# Get admin token (replace with your own token)
TOKEN="your_admin_jwt_token_here"

# Test user listing endpoint
curl -X GET http://localhost:8000/api/admin/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"

# Test get specific user
curl -X GET http://localhost:8000/api/admin/users/123456789 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"

# Test promote user to admin
curl -X POST http://localhost:8000/api/admin/users/promote/123456789 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"

# Test transaction listing endpoint
curl -X GET http://localhost:8000/api/admin/transactions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"

# Update transaction status
curl -X PUT http://localhost:8000/api/admin/transactions/TX123456/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "completed", "notes": "Manually approved"}'

# Check platform wallets
curl -X GET http://localhost:8000/api/admin/platform-wallets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

### 3. Use Postman

Import the provided Postman collection and environment:

1. Import `nexuspay-admin-api.postman_collection.json`
2. Create a Postman environment with:
   - `base_url`: `http://localhost:8000/api`
   - `admin_token`: Your JWT token

### 4. Directly Call the API in Browser Console

You can test the API directly from the browser console:

```javascript
// Set your admin token
const token = 'your_admin_jwt_token_here';

// Function to make API requests
async function callAdminAPI(endpoint, method = 'GET', body = null) {
  const url = `http://localhost:8000/api/admin/${endpoint}`;
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, options);
  return await response.json();
}

// Example calls
callAdminAPI('users').then(console.log);
callAdminAPI('transactions').then(console.log);
callAdminAPI('platform-wallets').then(console.log);
```

## Getting a Valid Admin Token

To obtain a valid admin token for testing:

1. Login to the application as a user with admin privileges
2. Extract the JWT token from the response or localStorage

Alternatively, use the testing script to generate a token:

```bash
node dist/scripts/testAdminAPI.js
```

This will:
1. Connect to the database
2. Find the first user (or create one if needed)
3. Make that user an admin
4. Generate and display a JWT token

## Troubleshooting

### Server Connection Issues

If you encounter connection refusals:

```
Error: connect ECONNREFUSED 127.0.0.1:8000
```

Make sure the server is running with `npm run dev`.

### Authentication Errors

If you see unauthorized errors:

```
{ success: false, message: 'Unauthorized: Admin access required' }
```

Ensure:
1. Your token is valid and not expired
2. The user associated with the token has admin role
3. The token is correctly formatted in the Authorization header

### Database Errors

If database connection fails:

1. Check your MongoDB connection string in `.env`
2. Ensure MongoDB is running
3. Verify network access to the database 