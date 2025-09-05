# Frontend Registration Component

## 🔧 **Complete React Registration Component**

Here's a complete React component that handles the two-step registration process with proper OTP verification:

```jsx
import React, { useState } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';

const RegistrationForm = () => {
  const [step, setStep] = useState(1); // 1: Initiate, 2: Complete
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showOptions, setShowOptions] = useState(false);
  const [registrationData, setRegistrationData] = useState(null);

  // Step 1: Initiate Registration
  const initiateRegistration = async (phoneNumber) => {
    try {
      const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
      
      const response = await fetch('/api/auth/register/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: formattedPhone })
      });

      const result = await response.json();

      if (response.status === 409) {
        // Phone number already exists
        setError({
          type: 'PHONE_EXISTS',
          message: 'This phone number is already registered. What would you like to do?',
          phoneNumber: formattedPhone
        });
        setShowOptions(true);
        return false;
      }

      if (!response.ok) {
        throw new Error(result.message || 'Failed to initiate registration');
      }

      return true;
    } catch (error) {
      setError({
        type: 'INITIATE_FAILED',
        message: error.message
      });
      return false;
    }
  };

  // Step 2: Complete Registration
  const completeRegistration = async (phoneNumber, password, otp) => {
    try {
      const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
      
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: formattedPhone,
          password: password,
          otp: otp,
          verifyWith: 'phone'
        })
      });

      const result = await response.json();

      if (result.success) {
        // Store token and redirect
        localStorage.setItem('token', result.data.token);
        window.location.href = '/dashboard';
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      setError({
        type: 'COMPLETE_FAILED',
        message: error.message
      });
    }
  };

  // Form validation schemas
  const initiateSchema = Yup.object({
    phoneNumber: Yup.string()
      .required('Phone number is required')
      .matches(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format')
  });

  const completeSchema = Yup.object({
    phoneNumber: Yup.string().required('Phone number is required'),
    password: Yup.string()
      .required('Password is required')
      .min(8, 'Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain uppercase, lowercase, and number'),
    confirmPassword: Yup.string()
      .required('Please confirm your password')
      .oneOf([Yup.ref('password')], 'Passwords must match'),
    otp: Yup.string()
      .required('OTP is required')
      .length(6, 'OTP must be 6 digits')
      .matches(/^\d{6}$/, 'OTP must contain only numbers')
  });

  // Step 1 Form
  const initiateForm = useFormik({
    initialValues: {
      phoneNumber: ''
    },
    validationSchema: initiateSchema,
    onSubmit: async (values) => {
      setIsLoading(true);
      setError(null);
      setShowOptions(false);

      const success = await initiateRegistration(values.phoneNumber);
      
      if (success) {
        setRegistrationData({ phoneNumber: values.phoneNumber });
        setStep(2);
      }
      
      setIsLoading(false);
    }
  });

  // Step 2 Form
  const completeForm = useFormik({
    initialValues: {
      phoneNumber: registrationData?.phoneNumber || '',
      password: '',
      confirmPassword: '',
      otp: ''
    },
    validationSchema: completeSchema,
    onSubmit: async (values) => {
      setIsLoading(true);
      setError(null);

      await completeRegistration(values.phoneNumber, values.password, values.otp);
      
      setIsLoading(false);
    }
  });

  const handleLogin = () => {
    window.location.href = '/login';
  };

  const handlePasswordReset = () => {
    window.location.href = '/forgot-password';
  };

  const goBackToStep1 = () => {
    setStep(1);
    setError(null);
    setShowOptions(false);
    setRegistrationData(null);
  };

  return (
    <div className="registration-container">
      <div className="registration-form">
        <h2>Create Account</h2>
        
        {error && (
          <div className={`error-message ${error.type}`}>
            <p>{error.message}</p>
            {showOptions && (
              <div className="options">
                <button onClick={handleLogin} className="btn-secondary">
                  Login Instead
                </button>
                <button onClick={handlePasswordReset} className="btn-secondary">
                  Reset Password
                </button>
              </div>
            )}
          </div>
        )}

        {step === 1 ? (
          // Step 1: Initiate Registration
          <form onSubmit={initiateForm.handleSubmit}>
            <div className="form-group">
              <label>Phone Number</label>
              <input
                type="tel"
                name="phoneNumber"
                value={initiateForm.values.phoneNumber}
                onChange={initiateForm.handleChange}
                onBlur={initiateForm.handleBlur}
                placeholder="254758348514"
                className={initiateForm.errors.phoneNumber && initiateForm.touched.phoneNumber ? 'error' : ''}
              />
              {initiateForm.errors.phoneNumber && initiateForm.touched.phoneNumber && (
                <div className="error-text">{initiateForm.errors.phoneNumber}</div>
              )}
            </div>

            <button type="submit" disabled={isLoading}>
              {isLoading ? 'Sending OTP...' : 'Send OTP'}
            </button>
          </form>
        ) : (
          // Step 2: Complete Registration
          <form onSubmit={completeForm.handleSubmit}>
            <div className="step-indicator">
              <span>Step 2 of 2: Complete Registration</span>
              <button type="button" onClick={goBackToStep1} className="back-btn">
                ← Back
              </button>
            </div>

            <div className="form-group">
              <label>Phone Number</label>
              <input
                type="tel"
                name="phoneNumber"
                value={completeForm.values.phoneNumber}
                disabled
                className="disabled"
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                name="password"
                value={completeForm.values.password}
                onChange={completeForm.handleChange}
                onBlur={completeForm.handleBlur}
                placeholder="Enter your password"
                className={completeForm.errors.password && completeForm.touched.password ? 'error' : ''}
              />
              {completeForm.errors.password && completeForm.touched.password && (
                <div className="error-text">{completeForm.errors.password}</div>
              )}
            </div>

            <div className="form-group">
              <label>Confirm Password</label>
              <input
                type="password"
                name="confirmPassword"
                value={completeForm.values.confirmPassword}
                onChange={completeForm.handleChange}
                onBlur={completeForm.handleBlur}
                placeholder="Confirm your password"
                className={completeForm.errors.confirmPassword && completeForm.touched.confirmPassword ? 'error' : ''}
              />
              {completeForm.errors.confirmPassword && completeForm.touched.confirmPassword && (
                <div className="error-text">{completeForm.errors.confirmPassword}</div>
              )}
            </div>

            <div className="form-group">
              <label>OTP Code</label>
              <input
                type="text"
                name="otp"
                value={completeForm.values.otp}
                onChange={completeForm.handleChange}
                onBlur={completeForm.handleBlur}
                placeholder="Enter 6-digit OTP"
                maxLength="6"
                className={completeForm.errors.otp && completeForm.touched.otp ? 'error' : ''}
              />
              {completeForm.errors.otp && completeForm.touched.otp && (
                <div className="error-text">{completeForm.errors.otp}</div>
              )}
              <div className="otp-help">
                <p>Check your SMS for the 6-digit OTP code</p>
                <button type="button" onClick={() => initiateRegistration(completeForm.values.phoneNumber)}>
                  Resend OTP
                </button>
              </div>
            </div>

            <button type="submit" disabled={isLoading}>
              {isLoading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default RegistrationForm;
```

## 🎨 **CSS Styles**

```css
.registration-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.registration-form {
  background: white;
  padding: 2rem;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  width: 100%;
  max-width: 400px;
}

.registration-form h2 {
  text-align: center;
  margin-bottom: 2rem;
  color: #333;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #555;
}

.form-group input {
  width: 100%;
  padding: 0.75rem;
  border: 2px solid #e1e5e9;
  border-radius: 8px;
  font-size: 1rem;
  transition: border-color 0.3s ease;
}

.form-group input:focus {
  outline: none;
  border-color: #667eea;
}

.form-group input.error {
  border-color: #e74c3c;
}

.form-group input.disabled {
  background-color: #f8f9fa;
  color: #6c757d;
}

.error-text {
  color: #e74c3c;
  font-size: 0.875rem;
  margin-top: 0.25rem;
}

.error-message {
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
}

.error-message.PHONE_EXISTS {
  background-color: #fff3cd;
  border: 1px solid #ffeaa7;
  color: #856404;
}

.error-message.INITIATE_FAILED,
.error-message.COMPLETE_FAILED {
  background-color: #f8d7da;
  border: 1px solid #f5c6cb;
  color: #721c24;
}

.options {
  display: flex;
  gap: 1rem;
  margin-top: 1rem;
}

.btn-secondary {
  padding: 0.5rem 1rem;
  border: 1px solid #007bff;
  background: white;
  color: #007bff;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-secondary:hover {
  background: #007bff;
  color: white;
}

.step-indicator {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  padding: 0.5rem;
  background: #f8f9fa;
  border-radius: 6px;
}

.back-btn {
  background: none;
  border: none;
  color: #667eea;
  cursor: pointer;
  font-size: 0.875rem;
}

.otp-help {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: #6c757d;
}

.otp-help button {
  background: none;
  border: none;
  color: #667eea;
  cursor: pointer;
  text-decoration: underline;
  margin-left: 0.5rem;
}

button[type="submit"] {
  width: 100%;
  padding: 0.75rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: transform 0.2s ease;
}

button[type="submit"]:hover:not(:disabled) {
  transform: translateY(-2px);
}

button[type="submit"]:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}
```

## 🚀 **Usage Example**

```jsx
import React from 'react';
import RegistrationForm from './components/RegistrationForm';

const App = () => {
  return (
    <div className="App">
      <RegistrationForm />
    </div>
  );
};

export default App;
```

## 📋 **Key Features**

1. **Two-Step Process**: Properly separates initiation and completion
2. **OTP Verification**: Enforces OTP verification before account creation
3. **Error Handling**: Handles phone number conflicts gracefully
4. **Form Validation**: Uses Formik and Yup for robust validation
5. **User Experience**: Clear step indicators and helpful messages
6. **Responsive Design**: Works on all device sizes

## 🔧 **Dependencies**

```json
{
  "dependencies": {
    "react": "^18.0.0",
    "formik": "^2.4.0",
    "yup": "^1.0.0"
  }
}
```

This component ensures that OTP verification is truly enforced before proceeding to account creation! 🎉
