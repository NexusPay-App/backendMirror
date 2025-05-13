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
    // Get the authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json(standardResponse(
        false,
        'Authentication required',
        null,
        { code: 'AUTH_REQUIRED', message: 'Authentication token is required' }
      ));
    }
    
    // Check header format
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json(standardResponse(
        false,
        'Invalid authentication format',
        null,
        { code: 'INVALID_AUTH_FORMAT', message: 'Authorization header must start with "Bearer "' }
      ));
    }
    
    // Extract the token
    const token = authHeader.split(' ')[1];
    
    if (!token) {
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
      const decoded = jwt.verify(token, config.JWT_SECRET);
      
      // Check if the decoded token has a valid user ID
      if (!decoded || typeof decoded !== 'object' || !decoded.id) {
        return res.status(401).json(standardResponse(
          false,
          'Invalid token',
          null,
          { code: 'INVALID_TOKEN', message: 'Token payload is invalid' }
        ));
      }
      
      // Find the user
      const user = await User.findById(decoded.id);
      
      if (!user) {
        return res.status(401).json(standardResponse(
          false,
          'User not found',
          null,
          { code: 'USER_NOT_FOUND', message: 'User associated with this token no longer exists' }
        ));
      }
      
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