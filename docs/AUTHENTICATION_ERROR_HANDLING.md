# Authentication Error Handling Guide

## 🔐 **Comprehensive Error Response Structure**

All authentication endpoints return standardized error responses with the following structure:

```json
{
  "success": false,
  "message": "Human-readable error message",
  "data": null,
  "error": {
    "code": "ERROR_CODE",
    "message": "Detailed error description",
    "action": "SUGGESTED_ACTION",
    "status": 400
  },
  "timestamp": "2024-01-15T10:35:00.000Z"
}
```

---

## 📋 **Complete Error Codes Reference**

### **🔍 User Account Errors**

| Code | Status | Message | Action | Description |
|------|--------|---------|--------|-------------|
| `USER_NOT_FOUND` | 404 | No account found with this information | `REGISTER_REQUIRED` | User doesn't exist |
| `USER_ALREADY_EXISTS` | 409 | An account with this information already exists | `LOGIN_REQUIRED` | User already registered |

### **🔑 Authentication Errors**

| Code | Status | Message | Action | Description |
|------|--------|---------|--------|-------------|
| `INVALID_CREDENTIALS` | 401 | Invalid phone number, email, or password | `RETRY_LOGIN` | General credential error |
| `WRONG_PASSWORD` | 401 | Incorrect password provided | `RESET_PASSWORD` | Password is wrong |

### **📱 OTP Errors**

| Code | Status | Message | Action | Description |
|------|--------|---------|--------|-------------|
| `INVALID_OTP` | 400 | Invalid or expired OTP code | `RESEND_OTP` | OTP is wrong/expired |
| `OTP_EXPIRED` | 400 | OTP code has expired. Please request a new one | `RESEND_OTP` | OTP time limit exceeded |
| `OTP_NOT_SENT` | 500 | Failed to send OTP. Please try again | `RETRY_REQUEST` | SMS/Email sending failed |
| `OTP_ATTEMPTS_EXCEEDED` | 429 | Too many failed OTP attempts. Please try again later | `WAIT_AND_RETRY` | Rate limiting |

### **✅ Verification Errors**

| Code | Status | Message | Action | Description |
|------|--------|---------|--------|-------------|
| `PHONE_NOT_VERIFIED` | 401 | Phone number not verified. Please verify your phone number | `VERIFY_PHONE` | Phone needs verification |
| `EMAIL_NOT_VERIFIED` | 401 | Email not verified. Please verify your email address | `VERIFY_EMAIL` | Email needs verification |

### **🚫 Account Status Errors**

| Code | Status | Message | Action | Description |
|------|--------|---------|--------|-------------|
| `ACCOUNT_LOCKED` | 423 | Account is temporarily locked due to security reasons | `CONTACT_SUPPORT` | Account locked |
| `ACCOUNT_SUSPENDED` | 423 | Account has been suspended. Please contact support | `CONTACT_SUPPORT` | Account suspended |

### **🔒 Session Errors**

| Code | Status | Message | Action | Description |
|------|--------|---------|--------|-------------|
| `SESSION_EXPIRED` | 401 | Your session has expired. Please login again | `RELOGIN` | Token expired |
| `INVALID_TOKEN` | 401 | Invalid or malformed authentication token | `RELOGIN` | Bad token format |

### **⏱️ Rate Limiting**

| Code | Status | Message | Action | Description |
|------|--------|---------|--------|-------------|
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests. Please try again later | `WAIT_AND_RETRY` | API rate limit hit |

### **📝 Validation Errors**

| Code | Status | Message | Action | Description |
|------|--------|---------|--------|-------------|
| `INVALID_PHONE_FORMAT` | 400 | Invalid phone number format. Use E.164 format (e.g., +254712345678) | `CORRECT_FORMAT` | Bad phone format |
| `INVALID_EMAIL_FORMAT` | 400 | Invalid email address format | `CORRECT_FORMAT` | Bad email format |
| `WEAK_PASSWORD` | 400 | Password must be at least 8 characters with uppercase, lowercase, and number | `STRENGTHEN_PASSWORD` | Password too weak |
| `PASSWORDS_DONT_MATCH` | 400 | Password and confirm password do not match | `MATCH_PASSWORDS` | Password mismatch |

### **⚙️ System Errors**

| Code | Status | Message | Action | Description |
|------|--------|---------|--------|-------------|
| `INTERNAL_ERROR` | 500 | An internal server error occurred. Please try again | `RETRY_LATER` | Server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable. Please try again later | `RETRY_LATER` | Service down |

---

## 🎯 **Frontend Error Handling Examples**

### **React Error Handler Component**

```jsx
import React from 'react';

const ErrorHandler = ({ error, onAction }) => {
  const getErrorIcon = (code) => {
    switch (code) {
      case 'USER_NOT_FOUND': return '👤';
      case 'WRONG_PASSWORD': return '🔒';
      case 'INVALID_OTP': return '📱';
      case 'PHONE_NOT_VERIFIED': return '📞';
      case 'RATE_LIMIT_EXCEEDED': return '⏱️';
      default: return '❌';
    }
  };

  const getActionButton = (action, code) => {
    switch (action) {
      case 'REGISTER_REQUIRED':
        return <button onClick={() => onAction('register')}>Create Account</button>;
      case 'LOGIN_REQUIRED':
        return <button onClick={() => onAction('login')}>Login Instead</button>;
      case 'RESET_PASSWORD':
        return <button onClick={() => onAction('resetPassword')}>Reset Password</button>;
      case 'RESEND_OTP':
        return <button onClick={() => onAction('resendOTP')}>Resend OTP</button>;
      case 'VERIFY_PHONE':
        return <button onClick={() => onAction('verifyPhone')}>Verify Phone</button>;
      case 'VERIFY_EMAIL':
        return <button onClick={() => onAction('verifyEmail')}>Verify Email</button>;
      case 'WAIT_AND_RETRY':
        return <button onClick={() => onAction('retry')} disabled>Wait and Retry</button>;
      case 'CONTACT_SUPPORT':
        return <button onClick={() => onAction('contactSupport')}>Contact Support</button>;
      default:
        return <button onClick={() => onAction('retry')}>Try Again</button>;
    }
  };

  if (!error) return null;

  return (
    <div className={`error-message ${error.error?.code}`}>
      <div className="error-header">
        <span className="error-icon">{getErrorIcon(error.error?.code)}</span>
        <h3>{error.message}</h3>
      </div>
      
      <div className="error-details">
        <p><strong>Error Code:</strong> {error.error?.code}</p>
        <p><strong>Status:</strong> {error.error?.status}</p>
        <p><strong>Time:</strong> {new Date(error.timestamp).toLocaleString()}</p>
      </div>

      <div className="error-actions">
        {getActionButton(error.error?.action, error.error?.code)}
      </div>
    </div>
  );
};

export default ErrorHandler;
```

### **Error Handling Hook**

```jsx
import { useState, useCallback } from 'react';

export const useErrorHandler = () => {
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleApiCall = useCallback(async (apiCall) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiCall();
      
      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData);
        return null;
      }

      const data = await response.json();
      return data;
    } catch (err) {
      setError({
        success: false,
        message: 'Network error occurred',
        error: {
          code: 'NETWORK_ERROR',
          message: err.message,
          action: 'RETRY_LATER'
        }
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    error,
    isLoading,
    handleApiCall,
    clearError
  };
};
```

### **Complete Registration Component with Error Handling**

```jsx
import React, { useState } from 'react';
import { useErrorHandler } from './hooks/useErrorHandler';
import ErrorHandler from './components/ErrorHandler';

const RegistrationForm = () => {
  const { error, isLoading, handleApiCall, clearError } = useErrorHandler();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    phoneNumber: '',
    password: '',
    confirmPassword: '',
    otp: ''
  });

  const handleAction = (action) => {
    switch (action) {
      case 'register':
        setStep(1);
        clearError();
        break;
      case 'login':
        window.location.href = '/login';
        break;
      case 'resetPassword':
        window.location.href = '/forgot-password';
        break;
      case 'resendOTP':
        initiateRegistration();
        break;
      case 'retry':
        clearError();
        break;
      default:
        clearError();
    }
  };

  const initiateRegistration = async () => {
    const result = await handleApiCall(() =>
      fetch('/api/auth/register/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: `+${formData.phoneNumber}` })
      })
    );

    if (result?.success) {
      setStep(2);
    }
  };

  const completeRegistration = async () => {
    const result = await handleApiCall(() =>
      fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: `+${formData.phoneNumber}`,
          password: formData.password,
          otp: formData.otp,
          verifyWith: 'phone'
        })
      })
    );

    if (result?.success) {
      localStorage.setItem('token', result.data.token);
      window.location.href = '/dashboard';
    }
  };

  return (
    <div className="registration-form">
      <h2>Create Account</h2>
      
      <ErrorHandler error={error} onAction={handleAction} />
      
      {/* Form content based on step */}
      {step === 1 ? (
        <div>
          <input
            type="tel"
            placeholder="Phone Number"
            value={formData.phoneNumber}
            onChange={(e) => setFormData({...formData, phoneNumber: e.target.value})}
          />
          <button onClick={initiateRegistration} disabled={isLoading}>
            {isLoading ? 'Sending OTP...' : 'Send OTP'}
          </button>
        </div>
      ) : (
        <div>
          <input
            type="password"
            placeholder="Password"
            value={formData.password}
            onChange={(e) => setFormData({...formData, password: e.target.value})}
          />
          <input
            type="text"
            placeholder="OTP Code"
            value={formData.otp}
            onChange={(e) => setFormData({...formData, otp: e.target.value})}
          />
          <button onClick={completeRegistration} disabled={isLoading}>
            {isLoading ? 'Creating Account...' : 'Create Account'}
          </button>
        </div>
      )}
    </div>
  );
};

export default RegistrationForm;
```

---

## 🧪 **Testing Error Scenarios**

### **Test Invalid Phone Format**
```bash
curl -X POST "http://localhost:8000/api/auth/register/initiate" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "invalid-phone"}'
```

**Expected Response:**
```json
{
  "success": false,
  "message": "Invalid phone number format. Use E.164 format (e.g., +254712345678)",
  "error": {
    "code": "INVALID_PHONE_FORMAT",
    "action": "CORRECT_FORMAT"
  }
}
```

### **Test User Not Found**
```bash
curl -X POST "http://localhost:8000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+254999999999", "password": "wrongpass"}'
```

**Expected Response:**
```json
{
  "success": false,
  "message": "No account found with this information",
  "error": {
    "code": "USER_NOT_FOUND",
    "action": "REGISTER_REQUIRED"
  }
}
```

### **Test Wrong Password**
```bash
curl -X POST "http://localhost:8000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+254758348514", "password": "wrongpassword"}'
```

**Expected Response:**
```json
{
  "success": false,
  "message": "Incorrect password provided",
  "error": {
    "code": "WRONG_PASSWORD",
    "action": "RESET_PASSWORD"
  }
}
```

### **Test Invalid OTP**
```bash
curl -X POST "http://localhost:8000/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+254758348514",
    "password": "Br123456789",
    "otp": "000000",
    "verifyWith": "phone"
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "message": "Invalid or expired OTP. Please try again.",
  "error": {
    "code": "INVALID_OTP",
    "action": "RESEND_OTP"
  }
}
```

---

## 🎨 **CSS for Error States**

```css
.error-message {
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
  border-left: 4px solid;
}

.error-message.USER_NOT_FOUND {
  background-color: #e3f2fd;
  border-color: #2196f3;
  color: #0d47a1;
}

.error-message.WRONG_PASSWORD {
  background-color: #ffebee;
  border-color: #f44336;
  color: #c62828;
}

.error-message.INVALID_OTP {
  background-color: #fff3e0;
  border-color: #ff9800;
  color: #e65100;
}

.error-message.PHONE_NOT_VERIFIED {
  background-color: #f3e5f5;
  border-color: #9c27b0;
  color: #4a148c;
}

.error-message.RATE_LIMIT_EXCEEDED {
  background-color: #e8f5e8;
  border-color: #4caf50;
  color: #1b5e20;
}

.error-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.error-icon {
  font-size: 1.5rem;
}

.error-details {
  font-size: 0.875rem;
  opacity: 0.8;
  margin-bottom: 1rem;
}

.error-actions {
  display: flex;
  gap: 0.5rem;
}

.error-actions button {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
}

.error-actions button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

---

**Last Updated:** January 15, 2024  
**Version:** 1.0.0
