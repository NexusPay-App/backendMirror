import { persistentLimit, requireFreshAuthentication } from '../middleware/securityControls';
import express from 'express';
import { 
  requestPasswordReset, 
  resetPassword, 
  requestPhonePasswordReset,
  resetPhonePassword,
  login, 
  registerUser, 
  initiateRegisterUser, 
  verifyEmail, 
  verifyPhone, 
  verifyLogin, 
  requestAccountDeletion, 
  confirmAccountDeletion,
  logout,
  googleAuth,
  addPhoneAndPassword,
  verifyPhoneAndPassword,
  linkGoogleAccount
} from '../controllers/authController';
import { validate } from '../middleware/validation';
import {
  registerValidation,
  loginValidation,
  verifyEmailValidation,
  verifyPhoneValidation,
  passwordResetRequestValidation,
  passwordResetValidation,
  phonePasswordResetRequestValidation,
  phonePasswordResetValidation,
  phoneLoginVerifyValidation
} from '../middleware/validators/authValidators';
import {
  googleAuthValidation,
  addPhonePasswordValidation,
  verifyPhonePasswordValidation,
  linkGoogleValidation
} from '../middleware/validators/googleAuthValidators';
import { authenticate } from '../middleware/auth';

const router = express.Router();
const authenticationLimit = persistentLimit('authentication', 30);
router.use((req, res, next) => req.method === 'POST' && req.path !== '/logout' ? authenticationLimit(req, res, next) : next());

// Login routes
router.post('/login', validate(loginValidation), login);
router.post('/login/verify', validate(phoneLoginVerifyValidation), verifyLogin);
router.post('/logout', logout);

// Registration routes
router.post('/register/initiate', initiateRegisterUser);
router.post('/register', validate(registerValidation), registerUser);
router.post('/register/verify/email', validate(verifyEmailValidation), verifyEmail);
router.post('/register/verify/phone', validate(verifyPhoneValidation), verifyPhone);

// Password reset routes
router.post('/password-reset/request', validate(passwordResetRequestValidation), requestPasswordReset);
router.post('/password-reset', validate(passwordResetValidation), resetPassword);

// Phone-based password reset routes
router.post('/password-reset/phone/request', validate(phonePasswordResetRequestValidation), requestPhonePasswordReset);
router.post('/password-reset/phone', validate(phonePasswordResetValidation), resetPhonePassword);

// Account deletion routes
router.post('/account-deletion/request', authenticate, requestAccountDeletion);
router.post('/account-deletion/confirm', authenticate, confirmAccountDeletion);

// Google authentication routes
router.post('/google', validate(googleAuthValidation), googleAuth);
router.post('/google/link', authenticate, requireFreshAuthentication, validate(linkGoogleValidation), linkGoogleAccount);

// Account settings routes (for adding phone/password after Google signup)
router.post('/settings/add-phone-password', authenticate, requireFreshAuthentication, validate(addPhonePasswordValidation), addPhoneAndPassword);
router.post('/settings/verify-phone-password', authenticate, requireFreshAuthentication, validate(verifyPhonePasswordValidation), verifyPhoneAndPassword);

// Google configuration endpoint for frontend
router.get('/google-config', (req, res) => {
  const config = require('../config/env').default;
  res.status(200).json({
    success: true,
    message: 'Google configuration retrieved',
    data: {
      clientId: config.GOOGLE_CLIENT_ID,
      redirectUri: config.GOOGLE_REDIRECT_URI
    },
    timestamp: new Date().toISOString()
  });
});

export default router;
