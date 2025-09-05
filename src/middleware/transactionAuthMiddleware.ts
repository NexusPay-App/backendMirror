import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User } from '../models/models';
import config from '../config/env';
import { standardResponse } from '../services/utils';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: any;
      transactionVerified?: boolean;
    }
  }
}

/**
 * Transaction Authentication Middleware
 * Supports both password and Google auth verification for crypto transactions
 */
export const authenticateTransaction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Step 1: Extract and validate JWT token
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return res.status(401).json(standardResponse(
        false,
        "Authentication required",
        null,
        { code: "AUTH_REQUIRED", message: "You must be logged in to perform this transaction" }
      ));
    }

    // Extract the token from the Bearer scheme
    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json(standardResponse(
        false,
        "Invalid authentication token",
        null,
        { code: "INVALID_TOKEN", message: "Authentication token is missing or invalid" }
      ));
    }

    // Ensure JWT_SECRET is available
    if (!config.JWT_SECRET) {
      console.error("JWT_SECRET is not configured");
      return res.status(500).json(standardResponse(
        false,
        "Server configuration error",
        null,
        { code: "CONFIG_ERROR", message: "Server is misconfigured" }
      ));
    }

    // Verify and decode the token
    let decoded;
    try {
      decoded = jwt.verify(token, config.JWT_SECRET) as { 
        id: string;
        phoneNumber?: string;
        email?: string;
        walletAddress?: string;
        iat: number;
        exp: number;
      };
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json(standardResponse(
          false,
          "Authentication session expired",
          null,
          { code: "TOKEN_EXPIRED", message: "Your session has expired. Please log in again." }
        ));
      } else {
        return res.status(401).json(standardResponse(
          false,
          "Invalid authentication token",
          null,
          { code: "INVALID_TOKEN", message: "Authentication token is invalid" }
        ));
      }
    }

    // Step 2: Get user from database
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json(standardResponse(
        false,
        "User not found",
        null,
        { code: "USER_NOT_FOUND", message: "User account not found" }
      ));
    }

    // Step 3: Verify transaction authentication (password or Google auth)
    const { password } = req.body;
    
    if (!password) {
      return res.status(403).json(standardResponse(
        false,
        "Transaction verification required",
        null,
        { code: "TRANSACTION_VERIFICATION_REQUIRED", message: "Password is required to complete this transaction" }
      ));
    }

    // Check if user has password-based authentication
    if (user.password) {
      // Verify password using bcrypt directly
      try {
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
          return res.status(403).json(standardResponse(
            false,
            "Invalid password",
            null,
            { code: "INVALID_PASSWORD", message: "Password is incorrect" }
          ));
        }
      } catch (passwordError) {
        console.error("Password verification error:", passwordError);
        return res.status(403).json(standardResponse(
          false,
          "Password verification failed",
          null,
          { code: "PASSWORD_VERIFICATION_ERROR", message: "Error verifying password" }
        ));
      }
    } else if (user.googleId) {
      // For Google auth users, require a PIN or additional verification
      // You can implement a PIN system or use the password field as a PIN
      if (password !== user.googleId.substring(0, 6)) { // Simple PIN from Google ID
        return res.status(403).json(standardResponse(
          false,
          "Invalid verification code",
          null,
          { code: "INVALID_VERIFICATION", message: "Verification code is incorrect" }
        ));
      }
    } else {
      return res.status(403).json(standardResponse(
        false,
        "No authentication method available",
        null,
        { code: "NO_AUTH_METHOD", message: "Please set up password or Google authentication" }
      ));
    }

    // Step 4: Set user and verification status
    req.user = user;
    req.transactionVerified = true;

    // Step 5: Continue to next middleware
    next();

  } catch (error) {
    console.error("Transaction authentication error:", error);
    return res.status(500).json(standardResponse(
      false,
      "Authentication error",
      null,
      { code: "AUTH_ERROR", message: "An error occurred during authentication" }
    ));
  }
};
