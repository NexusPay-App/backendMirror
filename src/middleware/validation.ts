import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain } from 'express-validator';
import { standardResponse } from '../services/utils';

/**
 * Middleware to validate request input using express-validator
 * @param validations Array of validation chains from express-validator
 * @returns Middleware function
 */
export function validate(validations: ValidationChain[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Execute all validations
    await Promise.all(validations.map(validation => validation.run(req)));
    
    // Check for validation errors
    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }
    
    // Format validation errors
    const formattedErrors = errors.array().map(error => {
      // Create a safe representation of the error
      const errorObj: Record<string, any> = {}; 
      
      if ('path' in error) {
        errorObj.field = error.path;
      } else if ('param' in error) {
        errorObj.field = error.param;
      } else {
        errorObj.field = error.type;
      }
      
      errorObj.message = error.msg;
      
      if ('value' in error) {
        errorObj.value = error.value;
      }
      
      return errorObj;
    });
    
    // Return standardized error response
    return res.status(400).json(standardResponse(
      false,
      'Validation failed',
      null,
      {
        code: 'VALIDATION_ERROR',
        message: 'The request contains invalid data',
        details: formattedErrors
      }
    ));
  };
} 