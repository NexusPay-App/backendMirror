import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/models';
import config from '../config/env';
import { standardResponse } from '../services/utils';

// Define session store for tracking verified sessions
interface SessionStore {
  [key: string]: {
    userId: string;
    verified: boolean;
    verifiedAt: Date;
    expiresAt: Date;
  }
}

// In-memory session store (in production, use Redis or another persistent store)
const verifiedSessions: SessionStore = {};

// Extend Express Request type to include verified session
declare global {
  namespace Express {
    interface Request {
      user?: any;
      session?: {
        verified: boolean;
        verifiedAt: Date;
      };
    }
  }
}

/**
 * Middleware to enforce full authentication flow:
 * 1. User must be logged in (valid JWT token)
 * 2. User must have verified their session with OTP
 */
export const enforceStrictAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Step 1: Extract and validate JWT token
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return res.status(401).json(standardResponse(
        false,
        "Authentication required",
        null,
        { code: "AUTH_REQUIRED", message: "You must be logged in to access this resource" }
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

    // Find the user in the database using ID
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json(standardResponse(
        false,
        "User not found",
        null,
        { code: "USER_NOT_FOUND", message: "User account not found" }
      ));
    }

    // Step 2: Check if the session has been verified with OTP
    const sessionId = token; // Use token as session ID
    const verifiedSession = verifiedSessions[sessionId];
    
    if (!verifiedSession || !verifiedSession.verified) {
      return res.status(403).json(standardResponse(
        false,
        "OTP verification required",
        null,
        { code: "OTP_REQUIRED", message: "You must verify this session with an OTP before accessing this resource" }
      ));
    }
    
    // Check if the session verification has expired (default: 4 hours)
    const now = new Date();
    if (now > verifiedSession.expiresAt) {
      // Remove expired session
      delete verifiedSessions[sessionId];
      
      return res.status(403).json(standardResponse(
        false,
        "OTP verification expired",
        null,
        { code: "OTP_EXPIRED", message: "Your verification has expired. Please verify again with a new OTP." }
      ));
    }

    // All checks passed, attach user and session info to request
    req.user = user;
    req.session = {
      verified: true,
      verifiedAt: verifiedSession.verifiedAt
    };
    
    next();
  } catch (error: any) {
    console.error("Authentication error:", error);
    return res.status(500).json(standardResponse(
      false,
      "Authentication error",
      null,
      { code: "AUTH_ERROR", message: "An error occurred during authentication" }
    ));
  }
};

/**
 * Register a verified session after successful OTP verification
 * Call this function after successfully verifying an OTP
 */
export const registerVerifiedSession = (token: string, userId: string, expiryHours: number = 4): void => {
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setHours(now.getHours() + expiryHours);
  
  verifiedSessions[token] = {
    userId,
    verified: true,
    verifiedAt: now,
    expiresAt
  };
  
  // Log for debugging
  console.log(`✅ Registered verified session for user ${userId}`);
  
  // Clean up expired sessions periodically
  cleanupExpiredSessions();
};

/**
 * Invalidate a session when user logs out
 */
export const invalidateSession = (token: string): void => {
  if (verifiedSessions[token]) {
    delete verifiedSessions[token];
    console.log(`🚫 Invalidated session for token ${token.substring(0, 10)}...`);
  }
};

/**
 * Clean up expired sessions to prevent memory leaks
 */
const cleanupExpiredSessions = (): void => {
  const now = new Date();
  let expiredCount = 0;
  
  Object.keys(verifiedSessions).forEach(sessionId => {
    if (now > verifiedSessions[sessionId].expiresAt) {
      delete verifiedSessions[sessionId];
      expiredCount++;
    }
  });
  
  if (expiredCount > 0) {
    console.log(`🧹 Cleaned up ${expiredCount} expired sessions`);
  }
};

// Schedule regular cleanup (every hour)
setInterval(cleanupExpiredSessions, 60 * 60 * 1000); 