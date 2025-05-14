import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { validationResult, ValidationChain } from 'express-validator';
import { standardResponse } from '../services/utils';

/**
 * Middleware to validate request input using Zod schemas
 * @param schema Zod schema for validation
 * @returns Middleware function
 */
export const validate = (schema: AnyZodObject | ValidationChain[]) => async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Check if schema is a Zod object
    if ('parseAsync' in schema) {
      // Use Zod validation
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      return next();
    } else {
      // Use express-validator validation
      const validations = schema as ValidationChain[];
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
    }
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json(
        standardResponse(
          false,
          'Validation failed',
          null,
          {
            code: 'VALIDATION_ERROR',
            details: error.errors.map(err => ({
              field: err.path.join('.'),
              message: err.message
            }))
          }
        )
      );
    }
    return next(error);
  }
}; 