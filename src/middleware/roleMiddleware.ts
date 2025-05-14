// src/middleware/roleMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import { standardResponse } from '../services/utils';

/**
 * Middleware to check if the authenticated user has admin role
 */
export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  // Check if user exists in the request (set by authenticate middleware)
  if (!req.user) {
    return res.status(401).json(standardResponse(
      false,
      'Authentication required',
      null,
      { code: 'AUTH_REQUIRED', message: 'Authentication is required' }
    ));
  }

  // Check if user has admin role
  if (req.user.role !== 'admin') {
    return res.status(403).json(standardResponse(
      false,
      'Access denied',
      null,
      { code: 'FORBIDDEN', message: 'Admin privileges required' }
    ));
  }

  // User is an admin, proceed to the next middleware or route handler
  next();
};

/**
 * Middleware to check if the authenticated user has support role or higher
 */
export const isSupportOrAdmin = (req: Request, res: Response, next: NextFunction) => {
  // Check if user exists in the request (set by authenticate middleware)
  if (!req.user) {
    return res.status(401).json(standardResponse(
      false,
      'Authentication required',
      null,
      { code: 'AUTH_REQUIRED', message: 'Authentication is required' }
    ));
  }

  // Check if user has admin or support role
  if (req.user.role !== 'admin' && req.user.role !== 'support') {
    return res.status(403).json(standardResponse(
      false,
      'Access denied',
      null,
      { code: 'FORBIDDEN', message: 'Support or admin privileges required' }
    ));
  }

  // User has sufficient privileges, proceed to the next middleware or route handler
  next();
}; 