// Authentication Error Codes and Messages
export const AUTH_ERROR_CODES = {
  // User Account Errors
  USER_NOT_FOUND: {
    code: 'USER_NOT_FOUND',
    message: 'No account found with this information',
    status: 404,
    action: 'REGISTER_REQUIRED'
  },
  USER_ALREADY_EXISTS: {
    code: 'USER_ALREADY_EXISTS',
    message: 'An account with this information already exists',
    status: 409,
    action: 'LOGIN_REQUIRED'
  },
  
  // Authentication Errors
  INVALID_CREDENTIALS: {
    code: 'INVALID_CREDENTIALS',
    message: 'Invalid phone number, email, or password',
    status: 401,
    action: 'RETRY_LOGIN'
  },
  WRONG_PASSWORD: {
    code: 'WRONG_PASSWORD',
    message: 'Incorrect password provided',
    status: 401,
    action: 'RESET_PASSWORD'
  },
  
  // OTP Errors
  INVALID_OTP: {
    code: 'INVALID_OTP',
    message: 'Invalid or expired OTP code',
    status: 400,
    action: 'RESEND_OTP'
  },
  OTP_EXPIRED: {
    code: 'OTP_EXPIRED',
    message: 'OTP code has expired. Please request a new one',
    status: 400,
    action: 'RESEND_OTP'
  },
  OTP_NOT_SENT: {
    code: 'OTP_NOT_SENT',
    message: 'Failed to send OTP. Please try again',
    status: 500,
    action: 'RETRY_REQUEST'
  },
  OTP_ATTEMPTS_EXCEEDED: {
    code: 'OTP_ATTEMPTS_EXCEEDED',
    message: 'Too many failed OTP attempts. Please try again later',
    status: 429,
    action: 'WAIT_AND_RETRY'
  },
  
  // Verification Errors
  PHONE_NOT_VERIFIED: {
    code: 'PHONE_NOT_VERIFIED',
    message: 'Phone number not verified. Please verify your phone number',
    status: 401,
    action: 'VERIFY_PHONE'
  },
  EMAIL_NOT_VERIFIED: {
    code: 'EMAIL_NOT_VERIFIED',
    message: 'Email not verified. Please verify your email address',
    status: 401,
    action: 'VERIFY_EMAIL'
  },
  
  // Account Status Errors
  ACCOUNT_LOCKED: {
    code: 'ACCOUNT_LOCKED',
    message: 'Account is temporarily locked due to security reasons',
    status: 423,
    action: 'CONTACT_SUPPORT'
  },
  ACCOUNT_SUSPENDED: {
    code: 'ACCOUNT_SUSPENDED',
    message: 'Account has been suspended. Please contact support',
    status: 423,
    action: 'CONTACT_SUPPORT'
  },
  
  // Session Errors
  SESSION_EXPIRED: {
    code: 'SESSION_EXPIRED',
    message: 'Your session has expired. Please login again',
    status: 401,
    action: 'RELOGIN'
  },
  INVALID_TOKEN: {
    code: 'INVALID_TOKEN',
    message: 'Invalid or malformed authentication token',
    status: 401,
    action: 'RELOGIN'
  },
  
  // Rate Limiting
  RATE_LIMIT_EXCEEDED: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests. Please try again later',
    status: 429,
    action: 'WAIT_AND_RETRY'
  },
  
  // Validation Errors
  INVALID_PHONE_FORMAT: {
    code: 'INVALID_PHONE_FORMAT',
    message: 'Invalid phone number format. Use E.164 format (e.g., +254712345678)',
    status: 400,
    action: 'CORRECT_FORMAT'
  },
  INVALID_EMAIL_FORMAT: {
    code: 'INVALID_EMAIL_FORMAT',
    message: 'Invalid email address format',
    status: 400,
    action: 'CORRECT_FORMAT'
  },
  WEAK_PASSWORD: {
    code: 'WEAK_PASSWORD',
    message: 'Password must be at least 8 characters with uppercase, lowercase, and number',
    status: 400,
    action: 'STRENGTHEN_PASSWORD'
  },
  PASSWORDS_DONT_MATCH: {
    code: 'PASSWORDS_DONT_MATCH',
    message: 'Password and confirm password do not match',
    status: 400,
    action: 'MATCH_PASSWORDS'
  },
  
  // System Errors
  INTERNAL_ERROR: {
    code: 'INTERNAL_ERROR',
    message: 'An internal server error occurred. Please try again',
    status: 500,
    action: 'RETRY_LATER'
  },
  SERVICE_UNAVAILABLE: {
    code: 'SERVICE_UNAVAILABLE',
    message: 'Service temporarily unavailable. Please try again later',
    status: 503,
    action: 'RETRY_LATER'
  },

  // ENS (Ethereum Name Service) Errors
  AUTH_REQUIRED: {
    code: 'AUTH_REQUIRED',
    message: 'Authentication required to access this resource',
    status: 401,
    action: 'LOGIN_REQUIRED'
  },
  ENS_CREATION_FAILED: {
    code: 'ENS_CREATION_FAILED',
    message: 'Failed to create ENS subdomain',
    status: 500,
    action: 'RETRY_LATER'
  },
  NO_ENS_SUBDOMAIN: {
    code: 'NO_ENS_SUBDOMAIN',
    message: 'User does not have an ENS subdomain',
    status: 404,
    action: 'CREATE_SUBDOMAIN'
  },
  ENS_UPDATE_FAILED: {
    code: 'ENS_UPDATE_FAILED',
    message: 'Failed to update ENS resolver records',
    status: 500,
    action: 'RETRY_LATER'
  },
  MISSING_SUBDOMAIN: {
    code: 'MISSING_SUBDOMAIN',
    message: 'Subdomain parameter is required',
    status: 400,
    action: 'PROVIDE_SUBDOMAIN'
  },
  INVALID_SUBDOMAIN_FORMAT: {
    code: 'INVALID_SUBDOMAIN_FORMAT',
    message: 'Invalid ENS subdomain format',
    status: 400,
    action: 'CORRECT_FORMAT'
  },
  MISSING_SUBDOMAIN_LABEL: {
    code: 'MISSING_SUBDOMAIN_LABEL',
    message: 'Subdomain label parameter is required',
    status: 400,
    action: 'PROVIDE_LABEL'
  },
  INVALID_SUBDOMAIN_LABEL: {
    code: 'INVALID_SUBDOMAIN_LABEL',
    message: 'Subdomain label can only contain lowercase letters, numbers, and hyphens',
    status: 400,
    action: 'CORRECT_FORMAT'
  },
  ADMIN_REQUIRED: {
    code: 'ADMIN_REQUIRED',
    message: 'Admin access required for this operation',
    status: 403,
    action: 'CONTACT_ADMIN'
  },
  INVALID_USER_IDS: {
    code: 'INVALID_USER_IDS',
    message: 'User IDs array is required',
    status: 400,
    action: 'PROVIDE_USER_IDS'
  },
  ENS_SUBDOMAIN_EXISTS: {
    code: 'ENS_SUBDOMAIN_EXISTS',
    message: 'User already has an ENS subdomain',
    status: 409,
    action: 'USE_EXISTING_SUBDOMAIN'
  }
};

// Helper function to create standardized error response
export const createErrorResponse = (errorCode: keyof typeof AUTH_ERROR_CODES, customMessage?: string) => {
  const error = AUTH_ERROR_CODES[errorCode];
  return {
    success: false,
    message: customMessage || error.message,
    data: null,
    error: {
      code: error.code,
      message: error.message,
      action: error.action,
      status: error.status
    },
    timestamp: new Date().toISOString()
  };
};

// Helper function to get error by code
export const getErrorByCode = (code: string) => {
  return Object.values(AUTH_ERROR_CODES).find(error => error.code === code);
};
