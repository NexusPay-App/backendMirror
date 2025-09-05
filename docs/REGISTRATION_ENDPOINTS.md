# Registration Endpoints Guide

**Base URL:** `http://localhost:8000` (Development) | `https://api.nexuspaydefi.xyz` (Production)

## 🔐 Complete Registration Flow

### **Option 1: Phone + Password Registration (Recommended)**

#### **Step 1: Initiate Registration**
```bash
POST /api/auth/register/initiate
```

**Request Body:**
```json
{
  "phoneNumber": "+254758348514"
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully. Please verify to complete registration."
}
```

#### **Step 2: Complete Registration (with OTP)**
```bash
POST /api/auth/register
```

**Request Body:**
```json
{
  "phoneNumber": "+254758348514",
  "password": "Br123456789",
  "otp": "123456",
  "verifyWith": "phone"
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "Registration completed successfully!",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "walletAddress": "0xD4732b04f997D0229a755c797Bf1e4Ce6DcC65B7",
    "phoneNumber": "+254758348514",
    "isPhoneVerified": true
  }
}
```

**Error Response (Invalid OTP):**
```json
{
  "success": false,
  "message": "Invalid or expired OTP. Please try again.",
  "data": null,
  "error": null,
  "timestamp": "2024-01-15T10:35:00.000Z"
}
```

---

### **Option 2: Email + Password Registration**

#### **Step 1: Complete Registration**
```bash
POST /api/auth/register
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "Br123456789",
  "verifyWith": "email"
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "Registration completed successfully!",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "walletAddress": "0xD4732b04f997D0229a755c797Bf1e4Ce6DcC65B7",
    "email": "user@example.com",
    "isEmailVerified": false
  }
}
```

#### **Step 2: Verify Email (Optional)**
```bash
POST /api/auth/register/verify/email
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

---

### **Option 3: Google OAuth Registration**

#### **Step 1: Google Authentication**
```bash
POST /api/auth/google
```

**Request Body:**
```json
{
  "credential": "google_oauth_credential_token"
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "Google authentication successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "walletAddress": "0xD4732b04f997D0229a755c797Bf1e4Ce6DcC65B7",
    "email": "user@gmail.com",
    "isEmailVerified": true,
    "needsPhonePassword": true
  }
}
```

#### **Step 2: Add Phone & Password (Optional)**
```bash
POST /api/auth/settings/add-phone-password
```

**Request Body:**
```json
{
  "phoneNumber": "+254758348514",
  "password": "Br123456789"
}
```

---

## 🚨 **Important Fixes for Frontend**

### **1. Phone Number Format**
❌ **Wrong:** `254758348514`  
✅ **Correct:** `+254758348514`

**Frontend Fix:**
```javascript
// Ensure phone number has + prefix
const formatPhoneNumber = (phone) => {
  if (!phone.startsWith('+')) {
    return '+' + phone;
  }
  return phone;
};

// Usage
const phoneNumber = formatPhoneNumber('254758348514'); // Result: +254758348514
```

### **2. Registration Flow**
❌ **Wrong Flow:** Initiate → Verify OTP → Complete Registration  
✅ **Correct Flow:** Initiate → Complete Registration (with OTP verification)

**Frontend Implementation:**
```javascript
// Step 1: Initiate registration
const initiateRegistration = async (phoneNumber) => {
  const response = await fetch('/api/auth/register/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: `+${phoneNumber}` })
  });
  return response.json();
};

// Step 2: Complete registration (with OTP)
const completeRegistration = async (phoneNumber, password, otp) => {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phoneNumber: `+${phoneNumber}`,
      password: password,
      otp: otp,
      verifyWith: 'phone'
    })
  });
  return response.json();
};
```

---

## 📱 **Complete Frontend Example**

```javascript
class RegistrationService {
  static async registerWithPhone(phoneNumber, password, otp) {
    try {
      // Format phone number
      const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
      
      // Step 1: Initiate registration (sends OTP)
      const initiateResponse = await fetch('/api/auth/register/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: formattedPhone })
      });
      
      if (!initiateResponse.ok) {
        const errorData = await initiateResponse.json();
        if (initiateResponse.status === 409) {
          throw new Error('PHONE_EXISTS: ' + errorData.message);
        }
        throw new Error(errorData.message || 'Failed to initiate registration');
      }
      
      // Step 2: Complete registration (with OTP verification)
      const completeResponse = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: formattedPhone,
          password: password,
          otp: otp,
          verifyWith: 'phone'
        })
      });
      
      const result = await completeResponse.json();
      
      if (result.success) {
        // Store token and redirect
        localStorage.setItem('token', result.data.token);
        return result;
      } else {
        throw new Error(result.message);
      }
      
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  }
  
  static async registerWithGoogle(credential) {
    try {
      const response = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential })
      });
      
      const result = await response.json();
      
      if (result.success) {
        localStorage.setItem('token', result.data.token);
        return result;
      } else {
        throw new Error(result.message);
      }
      
    } catch (error) {
      console.error('Google registration error:', error);
      throw error;
    }
  }
}
```

---

## 🔧 **Error Handling**

### **Common Errors:**

**400 - Phone Number Format:**
```json
{
  "success": false,
  "message": "Please provide a valid phone number in E.164 format (e.g., +254712345678)"
}
```

**409 - User Already Exists:**
```json
{
  "success": false,
  "message": "User with this phone number already exists."
}
```

**400 - Password Requirements:**
```json
{
  "success": false,
  "message": "Password must contain at least one uppercase letter, one lowercase letter, and one number"
}
```

---

## 🧪 **Testing with curl**

### **Phone Registration:**
```bash
# Step 1: Initiate (sends OTP)
curl -X POST "http://localhost:8000/api/auth/register/initiate" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+254758348514"}'

# Step 2: Complete (with OTP verification)
curl -X POST "http://localhost:8000/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+254758348514",
    "password": "Br123456789",
    "otp": "123456",
    "verifyWith": "phone"
  }'
```

### **Email Registration:**
```bash
curl -X POST "http://localhost:8000/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "Br123456789",
    "verifyWith": "email"
  }'
```

---

**Last Updated:** January 15, 2024  
**Version:** 1.0.0
