# Account Linking Test Guide

## Test Scenario 1: Google User Adding Phone/Password

### Step 1: Login with Google
```bash
# First, get Google ID token from frontend, then:
curl -X POST http://localhost:8000/api/auth/google \
  -H "Content-Type: application/json" \
  -d '{
    "idToken": "your_google_id_token_here"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Google sign in successful",
  "data": {
    "token": "jwt_token_here",
    "user": {
      "email": "user@gmail.com",
      "walletAddress": "0x...",
      "authMethods": ["google"],
      "hasPassword": false,
      "hasPhoneNumber": false
    }
  }
}
```

### Step 2: Add Phone and Password
```bash
curl -X POST http://localhost:8000/api/auth/settings/add-phone-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "phoneNumber": "+254712345678",
    "password": "securePassword123"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Verification OTP sent to your phone number",
  "data": {
    "phoneNumber": "+254712345678"
  }
}
```

### Step 3: Verify Phone with OTP
```bash
# Check server logs for OTP, then:
curl -X POST http://localhost:8000/api/auth/settings/verify-phone-password \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+254712345678",
    "otp": "123456"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Phone number and password added successfully",
  "data": {
    "user": {
      "email": "user@gmail.com",
      "phoneNumber": "+254712345678",
      "walletAddress": "0x...",
      "authMethods": ["google", "phone"],
      "hasPassword": true,
      "hasPhoneNumber": true
    }
  }
}
```

### Step 4: Test Both Login Methods
```bash
# Test Google login (should work)
curl -X POST http://localhost:8000/api/auth/google \
  -H "Content-Type: application/json" \
  -d '{
    "idToken": "your_google_id_token_here"
  }'

# Test phone login (should also work)
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+254712345678",
    "password": "securePassword123"
  }'
```

## Test Scenario 2: Phone User Adding Google

### Step 1: Register with Phone
```bash
# Register with phone number
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+254712345679",
    "email": "test@example.com",
    "password": "securePassword123",
    "verifyWith": "phone"
  }'

# Verify phone (check server logs for OTP)
curl -X POST http://localhost:8000/api/auth/register/verify/phone \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+254712345679",
    "otp": "123456"
  }'
```

### Step 2: Login with Phone
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+254712345679",
    "password": "securePassword123"
  }'

# Verify login OTP (check server logs)
curl -X POST http://localhost:8000/api/auth/login/verify \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+254712345679",
    "otp": "123456"
  }'
```

### Step 3: Link Google Account
```bash
curl -X POST http://localhost:8000/api/auth/google/link \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "idToken": "your_google_id_token_here"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Google account linked successfully",
  "data": {
    "user": {
      "email": "test@example.com",
      "phoneNumber": "+254712345679",
      "walletAddress": "0x...",
      "authMethods": ["phone", "google"],
      "hasPassword": true,
      "hasPhoneNumber": true
    }
  }
}
```

## Key Points to Verify

1. **Single Wallet Address:** Both login methods should return the same wallet address
2. **Auth Methods Array:** Should show both "google" and "phone" after linking
3. **No Duplicate Accounts:** Linking should not create new user records
4. **Error Handling:** Trying to link already-used phone/Google should fail gracefully
5. **Flexible Login:** User can login with either method after linking

## Common Error Scenarios to Test

### Phone Already Registered
```bash
# Try to add a phone number that's already registered to another account
curl -X POST http://localhost:8000/api/auth/settings/add-phone-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "phoneNumber": "+254712345678",
    "password": "newPassword123"
  }'
```

**Expected Error:**
```json
{
  "success": false,
  "message": "Phone number already registered",
  "error": {
    "code": "PHONE_EXISTS"
  }
}
```

### Google Account Already Linked
```bash
# Try to link a Google account that's already linked to another user
curl -X POST http://localhost:8000/api/auth/google/link \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "idToken": "already_linked_google_token"
  }'
```

**Expected Error:**
```json
{
  "success": false,
  "message": "Google account already linked to another user",
  "error": {
    "code": "GOOGLE_LINKED"
  }
}
```