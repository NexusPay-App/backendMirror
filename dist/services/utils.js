"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retryOperation = exports.delay = exports.handleError = exports.standardResponse = void 0;
exports.errorResponse = errorResponse;
exports.paginatedResponse = paginatedResponse;
exports.generateSuccessCode = generateSuccessCode;
/**
 * Standard response format for API endpoints
 * @param success Whether the request was successful
 * @param message A message describing the result
 * @param data Optional data to return
 * @param error Optional error information
 * @returns Standard response object
 */
const standardResponse = (success, message, data = null, error = null) => {
    return {
        success,
        message,
        data,
        error,
        timestamp: new Date().toISOString()
    };
};
exports.standardResponse = standardResponse;
/**
 * Standard error response format
 */
function errorResponse(code, message, details = null) {
    return {
        code,
        message,
        details,
        timestamp: new Date().toISOString()
    };
}
/**
 * Standard paginated response format
 */
function paginatedResponse(items, total, page, limit) {
    return {
        items,
        pagination: {
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
        }
    };
}
/**
 * Handle errors in a standardized way
 * @param error Error object
 * @param res Express response object
 * @param defaultMessage Default message if error doesn't have one
 */
const handleError = (error, res, defaultMessage = 'An error occurred') => {
    console.error('Error:', error);
    // Determine appropriate status code
    const statusCode = error.statusCode || 500;
    // Prepare error response
    return res.status(statusCode).json((0, exports.standardResponse)(false, error.message || defaultMessage, null, {
        code: error.code || 'INTERNAL_SERVER_ERROR',
        message: error.message || defaultMessage,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }));
};
exports.handleError = handleError;
const delay = async (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};
exports.delay = delay;
/**
 * Retry a failed operation with exponential backoff
 * @param operation Function to retry
 * @param maxRetries Maximum number of retries
 * @param baseDelay Base delay in milliseconds
 * @returns Promise resolving to the operation result or rejecting with an error
 */
const retryOperation = async (operation, maxRetries = 3, baseDelay = 1000) => {
    let lastError;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await operation();
        }
        catch (error) {
            console.log(`Attempt ${attempt + 1} failed. Retrying...`);
            lastError = error;
            // Calculate delay with exponential backoff
            const delay = baseDelay * Math.pow(2, attempt);
            // Wait before next retry
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw new Error(`Operation failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
};
exports.retryOperation = retryOperation;
/**
 * Generates a unique success code for transactions
 * Format: NP-XXXXX-YY where X is alphanumeric and Y is a check digit
 */
function generateSuccessCode() {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed similar looking characters (0,1,I,O)
    let code = 'NP-';
    // Generate 5 random characters
    for (let i = 0; i < 5; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    // Add a hyphen
    code += '-';
    // Generate 2 check digits
    for (let i = 0; i < 2; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
}
