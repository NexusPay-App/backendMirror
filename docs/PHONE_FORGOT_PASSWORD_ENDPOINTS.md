# Phone-Based Forgot Password Endpoints

**Base URL:** `https://api.nexuspaydefi.xyz` (Production) | `http://localhost:8000` (Development)

## 🔐 Phone Forgot Password Flow

### **1. Request Password Reset (Phone)**

**Endpoint:** `POST /api/auth/password-reset/phone/request`

**Description:** Sends an OTP to the user's phone number for password reset verification.

#### Request Body
```json
{
  "phoneNumber": "+254712345678"
}
```

#### Request Validation
- `phoneNumber`: Required, must be in E.164 format (e.g., +254712345678)

#### Success Response (200)
```json
{
  "success": true,
  "message": "Password reset OTP sent to your phone number",
  "data": {
    "phoneNumber": "+254712345678",
    "otpExpiry": "5 minutes"
  },
  "error": null,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### Error Responses

**400 - Missing Phone Number**
```json
{
  "success": false,
  "message": "Phone number is required",
  "data": null,
  "error": {
    "code": "MISSING_PHONE_NUMBER",
    "message": "Phone number is required for password reset"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**404 - User Not Found**
```json
{
  "success": false,
  "message": "User not found with this phone number",
  "data": null,
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "No account found with this phone number"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**500 - OTP Send Failed**
```json
{
  "success": false,
  "message": "Failed to send password reset OTP",
  "data": null,
  "error": {
    "code": "OTP_SEND_FAILED",
    "message": "Unable to send OTP to phone number"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

### **2. Reset Password (Phone)**

**Endpoint:** `POST /api/auth/password-reset/phone`

**Description:** Verifies the OTP and resets the user's password.

#### Request Body
```json
{
  "phoneNumber": "+254712345678",
  "otp": "123456",
  "newPassword": "NewSecurePass123"
}
```

#### Request Validation
- `phoneNumber`: Required, must be in E.164 format
- `otp`: Required, must be 6 digits
- `newPassword`: Required, minimum 8 characters, must contain:
  - At least one uppercase letter
  - At least one lowercase letter
  - At least one number

#### Success Response (200)
```json
{
  "success": true,
  "message": "Password reset successful and phone number verified",
  "data": {
    "phoneNumber": "+254712345678",
    "resetAt": "2024-01-15T10:35:00.000Z",
    "phoneVerified": true
  },
  "error": null,
  "timestamp": "2024-01-15T10:35:00.000Z"
}
```

#### Error Responses

**400 - Missing Fields**
```json
{
  "success": false,
  "message": "Phone number, OTP, and new password are required",
  "data": null,
  "error": {
    "code": "MISSING_FIELDS",
    "message": "All fields are required for password reset"
  },
  "timestamp": "2024-01-15T10:35:00.000Z"
}
```

**400 - Invalid OTP**
```json
{
  "success": false,
  "message": "Invalid or expired OTP",
  "data": null,
  "error": {
    "code": "INVALID_OTP",
    "message": "OTP is invalid or has expired"
  },
  "timestamp": "2024-01-15T10:35:00.000Z"
}
```

**404 - User Not Found**
```json
{
  "success": false,
  "message": "User not found",
  "data": null,
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "No account found with this phone number"
  },
  "timestamp": "2024-01-15T10:35:00.000Z"
}
```

**500 - Internal Error**
```json
{
  "success": false,
  "message": "Error resetting password",
  "data": null,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Internal server error"
  },
  "timestamp": "2024-01-15T10:35:00.000Z"
}
```

---

## 🔄 Complete Flow Example

### Step 1: Request Password Reset
```bash
curl -X POST "https://api.nexuspaydefi.xyz/api/auth/password-reset/phone/request" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+254712345678"
  }'
```

### Step 2: Reset Password with OTP
```bash
curl -X POST "https://api.nexuspaydefi.xyz/api/auth/password-reset/phone" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+254712345678",
    "otp": "123456",
    "newPassword": "NewSecurePass123"
  }'
```

### Development Testing
```bash
# Request reset (localhost:8000)
curl -X POST "http://localhost:8000/api/auth/password-reset/phone/request" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+254712345678"}'

# Reset password (localhost:8000)
curl -X POST "http://localhost:8000/api/auth/password-reset/phone" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+254712345678",
    "otp": "123456",
    "newPassword": "NewSecurePass123"
  }'
```

---

## 📋 Error Codes Reference

| Code | Description |
|------|-------------|
| `MISSING_PHONE_NUMBER` | Phone number is required |
| `USER_NOT_FOUND` | No account found with this phone number |
| `OTP_SEND_FAILED` | Unable to send OTP to phone number |
| `MISSING_FIELDS` | All fields are required for password reset |
| `INVALID_OTP` | OTP is invalid or has expired |
| `INTERNAL_ERROR` | Internal server error |

---

## 🔒 Security Features

- **OTP Expiry**: OTP expires after 5 minutes
- **Password Validation**: Strong password requirements enforced
- **Phone Number Validation**: E.164 format validation
- **Rate Limiting**: Built-in rate limiting for security
- **Structured Responses**: Consistent error handling and logging
- **Phone Verification**: Automatically verifies phone number during password reset

## 🔧 Special Case: Old Users with Unverified Phone Numbers

For users who registered before phone verification was required:

1. **Login Attempt**: Will receive error with `PHONE_NOT_VERIFIED` code
2. **Solution**: Use phone password reset to verify phone number and set new password
3. **Result**: Phone number becomes verified and user can login normally

**Error Response for Unverified Phone:**
```json
{
  "success": false,
  "message": "Phone number not verified. Please use password reset to verify your phone number and set a new password.",
  "data": null,
  "error": {
    "code": "PHONE_NOT_VERIFIED",
    "message": "Use password reset to verify phone number",
    "action": "password_reset_required"
  }
}
```

---

## 📱 Frontend Integration

### JavaScript Example
```javascript
// Request password reset
const requestReset = async (phoneNumber) => {
  try {
    const response = await fetch('/api/auth/password-reset/phone/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phoneNumber })
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('OTP sent successfully');
      return data;
    } else {
      console.error('Error:', data.error.message);
      return data;
    }
  } catch (error) {
    console.error('Network error:', error);
  }
};

// Reset password
const resetPassword = async (phoneNumber, otp, newPassword) => {
  try {
    const response = await fetch('/api/auth/password-reset/phone', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phoneNumber, otp, newPassword })
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('Password reset successful');
      return data;
    } else {
      console.error('Error:', data.error.message);
      return data;
    }
  } catch (error) {
    console.error('Network error:', error);
  }
};
```

---

## 🚀 Testing

### Test with curl
```bash
# Test request reset
curl -X POST "http://localhost:8000/api/auth/password-reset/phone/request" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+254712345678"}'

# Test reset password
curl -X POST "http://localhost:8000/api/auth/password-reset/phone" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+254712345678",
    "otp": "123456",
    "newPassword": "NewSecurePass123"
  }'
```

---

**Last Updated:** January 15, 2024  
**Version:** 1.0.0
