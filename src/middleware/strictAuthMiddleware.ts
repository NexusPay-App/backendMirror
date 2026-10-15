import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/models';
import config from '../config/env';
import { standardResponse } from '../services/utils';

import { createHash } from 'node:crypto';
import { VerifiedSession } from '../models/verifiedSession';
const sessionKey = (token: string) => createHash('sha256').update(token).digest('hex');

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
    const sessionId = sessionKey(token);
    const verifiedSession = await VerifiedSession.findOne({ _id: sessionId, userId: String(user._id) });
    
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
      await VerifiedSession.deleteOne({ _id: sessionId });
      
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
    console.error("Authentication error:");
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
export const registerVerifiedSession = async (token: string, userId: string, expiryHours = 4): Promise<void> => {
  const now = new Date();
  await VerifiedSession.updateOne({ _id: sessionKey(token) }, { $set: { userId, verified: true, verifiedAt: now, expiresAt: new Date(now.getTime() + expiryHours * 60 * 60 * 1000) } }, { upsert: true });
};
export const invalidateSession = async (token: string): Promise<void> => {
  await VerifiedSession.deleteOne({ _id: sessionKey(token) });
};
// TTL expiry is persisted; this timer is only housekeeping on persistent hosts.
export const startSessionCleanup = () => setInterval(() => {
  void VerifiedSession.deleteMany({ expiresAt: { $lte: new Date() } }).catch(() => {});
}, 60 * 60 * 1000).unref();
