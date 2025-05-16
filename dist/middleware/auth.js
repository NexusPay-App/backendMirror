"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const models_1 = require("../models/models");
const env_1 = __importDefault(require("../config/env"));
const utils_1 = require("../services/utils");
/**
 * Middleware to authenticate requests using JWT
 */
const authenticate = async (req, res, next) => {
    try {
        // Get the authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json((0, utils_1.standardResponse)(false, 'Authentication required', null, { code: 'AUTH_REQUIRED', message: 'Authentication token is required' }));
        }
        // Check header format
        if (!authHeader.startsWith('Bearer ')) {
            return res.status(401).json((0, utils_1.standardResponse)(false, 'Invalid authentication format', null, { code: 'INVALID_AUTH_FORMAT', message: 'Authorization header must start with "Bearer "' }));
        }
        // Extract the token
        const token = authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json((0, utils_1.standardResponse)(false, 'Authentication failed', null, { code: 'TOKEN_MISSING', message: 'Token is missing' }));
        }
        // Verify the token
        try {
            // Check if JWT_SECRET is defined
            if (!env_1.default.JWT_SECRET) {
                console.error('❌ JWT_SECRET is not defined in the environment variables');
                return res.status(500).json((0, utils_1.standardResponse)(false, 'Server error', null, { code: 'SERVER_ERROR', message: 'Authentication service unavailable' }));
            }
            // Verify and decode the token
            const decoded = jsonwebtoken_1.default.verify(token, env_1.default.JWT_SECRET);
            // Check if the decoded token has a valid user ID
            if (!decoded || typeof decoded !== 'object' || !decoded.id) {
                return res.status(401).json((0, utils_1.standardResponse)(false, 'Invalid token', null, { code: 'INVALID_TOKEN', message: 'Token payload is invalid' }));
            }
            // Find the user
            const user = await models_1.User.findById(decoded.id);
            if (!user) {
                return res.status(401).json((0, utils_1.standardResponse)(false, 'User not found', null, { code: 'USER_NOT_FOUND', message: 'User associated with this token no longer exists' }));
            }
            // Attach the user to the request
            req.user = user;
            // Continue with the next middleware or route handler
            next();
        }
        catch (error) {
            // Handle specific JWT errors
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json((0, utils_1.standardResponse)(false, 'Token expired', null, { code: 'TOKEN_EXPIRED', message: 'Authentication token has expired' }));
            }
            if (error.name === 'JsonWebTokenError') {
                return res.status(401).json((0, utils_1.standardResponse)(false, 'Invalid token', null, { code: 'INVALID_TOKEN', message: 'Authentication token is invalid' }));
            }
            // Handle other errors
            return res.status(401).json((0, utils_1.standardResponse)(false, 'Authentication failed', null, { code: 'AUTH_FAILED', message: error.message || 'Unknown authentication error' }));
        }
    }
    catch (error) {
        console.error('❌ Error in authentication middleware:', error);
        return res.status(500).json((0, utils_1.standardResponse)(false, 'Server error', null, { code: 'SERVER_ERROR', message: 'Internal server error during authentication' }));
    }
};
exports.authenticate = authenticate;
