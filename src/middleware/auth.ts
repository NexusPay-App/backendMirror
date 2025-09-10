import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/models';
import config from '../config/env';
import { standardResponse } from '../services/utils';

// Extend the Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

/**
 * Middleware to authenticate requests using JWT
 */
export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Debug logging
    console.log('🔍 AUTH MIDDLEWARE DEBUG:');
    console.log('Request URL:', req.url);
    console.log('Request method:', req.method);
    console.log('All headers:', req.headers);
    
    // Get the authorization header
    const authHeader = req.headers.authorization;
    console.log('Authorization header:', authHeader);
    
    if (!authHeader) {
      console.log('❌ No authorization header found');
      return res.status(401).json(standardResponse(
        false,
        'Authentication required',
        null,
        { code: 'AUTH_REQUIRED', message: 'Authentication token is required' }
      ));
    }
    
    // Check header format
    if (!authHeader.startsWith('Bearer ')) {
      console.log('❌ Authorization header does not start with "Bearer "');
      return res.status(401).json(standardResponse(
        false,
        'Invalid authentication format',
        null,
        { code: 'INVALID_AUTH_FORMAT', message: 'Authorization header must start with "Bearer "' }
      ));
    }
    
    // Extract the token
    const token = authHeader.split(' ')[1];
    console.log('Extracted token:', token ? `${token.substring(0, 20)}...` : 'null');
    
    if (!token) {
      console.log('❌ No token found after "Bearer "');
      return res.status(401).json(standardResponse(
        false,
        'Authentication failed',
        null,
        { code: 'TOKEN_MISSING', message: 'Token is missing' }
      ));
    }
    
    // Verify the token
    try {
      // Check if JWT_SECRET is defined
      if (!config.JWT_SECRET) {
        console.error('❌ JWT_SECRET is not defined in the environment variables');
        return res.status(500).json(standardResponse(
          false,
          'Server error',
          null,
          { code: 'SERVER_ERROR', message: 'Authentication service unavailable' }
        ));
      }
      
      // Verify and decode the token
      console.log('Verifying JWT token...');
      const decoded = jwt.verify(token, config.JWT_SECRET);
      console.log('Decoded token:', decoded);
      
      // Check if the decoded token has a valid user ID
      if (!decoded || typeof decoded !== 'object' || !decoded.id) {
        console.log('❌ Invalid token payload - no user ID');
        return res.status(401).json(standardResponse(
          false,
          'Invalid token',
          null,
          { code: 'INVALID_TOKEN', message: 'Token payload is invalid' }
        ));
      }
      
      // Find the user
      console.log('Looking up user with ID:', decoded.id);
      const user = await User.findById(decoded.id);
      
      if (!user) {
        console.log('❌ User not found in database');
        return res.status(401).json(standardResponse(
          false,
          'User not found',
          null,
          { code: 'USER_NOT_FOUND', message: 'User associated with this token no longer exists' }
        ));
      }
      
      console.log('✅ User found:', { id: user._id, phoneNumber: user.phoneNumber });
      
      // Attach the user to the request
      req.user = user;
      
      // Continue with the next middleware or route handler
      next();
    } catch (error: any) {
      // Handle specific JWT errors
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json(standardResponse(
          false,
          'Token expired',
          null,
          { code: 'TOKEN_EXPIRED', message: 'Authentication token has expired' }
        ));
      }
      
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json(standardResponse(
          false,
          'Invalid token',
          null,
          { code: 'INVALID_TOKEN', message: 'Authentication token is invalid' }
        ));
      }
      
      // Handle other errors
      return res.status(401).json(standardResponse(
        false,
        'Authentication failed',
        null,
        { code: 'AUTH_FAILED', message: error.message || 'Unknown authentication error' }
      ));
    }
  } catch (error: any) {
    console.error('❌ Error in authentication middleware:', error);
    return res.status(500).json(standardResponse(
      false,
      'Server error',
      null,
      { code: 'SERVER_ERROR', message: 'Internal server error during authentication' }
    ));
  }
}; 