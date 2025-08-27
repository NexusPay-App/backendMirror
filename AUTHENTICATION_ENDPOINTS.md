# NexusPay Authentication Endpoints

**Base URL:** `http://localhost:8000`

## 🔐 Core Authentication Endpoints

### Login & Logout
```
POST /api/auth/login
POST /api/auth/login/verify
POST /api/auth/logout
```

### Registration
```
POST /api/auth/register/initiate
POST /api/auth/register
POST /api/auth/register/verify/email
POST /api/auth/register/verify/phone
```

### Password Reset
```
POST /api/auth/password-reset/request
POST /api/auth/password-reset
```

## 📱 Phone OTP Authentication

### Standalone OTP (Direct Phone Login)
```
POST /api/auth/otp
POST /api/auth/verify-otp
```

## 🔍 Google Authentication

### Google OAuth
```
POST /api/auth/google
POST /api/auth/google/link
GET /api/auth/google-config
```

### Account Settings (Post-Google Signup)
```
POST /api/auth/settings/add-phone-password
POST /api/auth/settings/verify-phone-password
```

## 🗑️ Account Management

### Account Deletion
```
POST /api/auth/account-deletion/request
POST /api/auth/account-deletion/confirm
```

## 📋 Complete Endpoint List with Full URLs

### Authentication Flow
- **Login:** `http://localhost:8000/api/auth/login`
- **Verify Login:** `http://localhost:8000/api/auth/login/verify`
- **Logout:** `http://localhost:8000/api/auth/logout`

### Registration Flow
- **Initiate Registration:** `http://localhost:8000/api/auth/register/initiate`
- **Complete Registration:** `http://localhost:8000/api/auth/register`
- **Verify Email:** `http://localhost:8000/api/auth/register/verify/email`
- **Verify Phone:** `http://localhost:8000/api/auth/register/verify/phone`

### OTP Authentication (Standalone)
- **Request OTP:** `http://localhost:8000/api/auth/otp`
- **Verify OTP:** `http://localhost:8000/api/auth/verify-otp`

### Password Management
- **Request Password Reset:** `http://localhost:8000/api/auth/password-reset/request`
- **Reset Password:** `http://localhost:8000/api/auth/password-reset`

### Google Authentication
- **Google Login/Register:** `http://localhost:8000/api/auth/google`
- **Link Google Account:** `http://localhost:8000/api/auth/google/link`
- **Get Google Config:** `http://localhost:8000/api/auth/google-config`

### Account Settings
- **Add Phone & Password:** `http://localhost:8000/api/auth/settings/add-phone-password`
- **Verify Phone & Password:** `http://localhost:8000/api/auth/settings/verify-phone-password`

### Account Deletion
- **Request Account Deletion:** `http://localhost:8000/api/auth/account-deletion/request`
- **Confirm Account Deletion:** `http://localhost:8000/api/auth/account-deletion/confirm`

## 🔧 Authentication Types Used

- **Basic Auth:** Standard JWT token authentication
- **Strict Auth:** Enhanced authentication with OTP verification (`enforceStrictAuth`)
- **Admin Auth:** Admin role required (`authenticate` + `isAdmin`)

## 🔗 Account Linking System

### Overview
The account linking system allows users to connect multiple authentication methods to a single wallet address. Users can start with either Google or phone authentication and later add the other method.

### Account Linking Endpoints

#### 1. Add Phone & Password to Google Account
**Endpoint:** `POST /api/auth/settings/add-phone-password`

**Description:** Allows Google-authenticated users to add phone number and password for alternative login.

**Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "phoneNumber": "+254712345678",
  "password": "securePassword123"
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "Verification OTP sent to your phone number",
  "data": {
    "phoneNumber": "+254712345678"
  }
}
```

#### 2. Verify Phone & Password Setup
**Endpoint:** `POST /api/auth/settings/verify-phone-password`

**Description:** Complete phone/password setup by verifying OTP.

**Request Body:**
```json
{
  "phoneNumber": "+254712345678",
  "otp": "123456"
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "Phone number and password added successfully",
  "data": {
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "phoneNumber": "+254712345678",
      "walletAddress": "0x...",
      "authMethods": ["google", "phone"],
      "hasPassword": true,
      "hasPhoneNumber": true
    }
  }
}
```

#### 3. Link Google to Phone Account
**Endpoint:** `POST /api/auth/google/link`

**Description:** Allows phone-authenticated users to link their Google account.

**Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "idToken": "google_id_token_from_frontend"
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "Google account linked successfully",
  "data": {
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "phoneNumber": "+254712345678",
      "walletAddress": "0x...",
      "authMethods": ["phone", "google"],
      "hasPassword": true,
      "hasPhoneNumber": true
    }
  }
}
```

### Account Linking Flows

#### For Google Users Adding Phone/Password:
1. **Sign up/Login with Google** → User gets wallet address
2. **Add Phone/Password:** `POST /api/auth/settings/add-phone-password`
3. **Verify OTP:** `POST /api/auth/settings/verify-phone-password`
4. **Result:** User can now login with either Google OR phone/password

#### For Phone Users Adding Google:
1. **Sign up/Login with Phone** → User gets wallet address
2. **Link Google:** `POST /api/auth/google/link` with Google ID token
3. **Result:** User can now login with either phone/password OR Google

### Key Benefits:
- ✅ **Single Wallet:** One wallet address per user regardless of signup method
- ✅ **No Redundancy:** Clean logic using existing authentication infrastructure
- ✅ **Flexible Login:** Users can choose their preferred login method
- ✅ **Secure Linking:** Prevents duplicate accounts and unauthorized linking

## 📝 Notes

- All endpoints return standardized JSON responses
- OTP codes are logged to console in development mode
- Google OAuth requires proper client configuration
- Rate limiting: 100 requests per 15 minutes per IP
- CORS enabled for specified origins
- All sensitive operations require strict authentication with OTP verification
- Account linking prevents duplicate phone numbers and Google accounts across users