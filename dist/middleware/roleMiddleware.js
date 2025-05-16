"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSupportOrAdmin = exports.isAdmin = void 0;
const utils_1 = require("../services/utils");
/**
 * Middleware to check if the authenticated user has admin role
 */
const isAdmin = (req, res, next) => {
    // Check if user exists in the request (set by authenticate middleware)
    if (!req.user) {
        return res.status(401).json((0, utils_1.standardResponse)(false, 'Authentication required', null, { code: 'AUTH_REQUIRED', message: 'Authentication is required' }));
    }
    // Check if user has admin role
    if (req.user.role !== 'admin') {
        return res.status(403).json((0, utils_1.standardResponse)(false, 'Access denied', null, { code: 'FORBIDDEN', message: 'Admin privileges required' }));
    }
    // User is an admin, proceed to the next middleware or route handler
    next();
};
exports.isAdmin = isAdmin;
/**
 * Middleware to check if the authenticated user has support role or higher
 */
const isSupportOrAdmin = (req, res, next) => {
    // Check if user exists in the request (set by authenticate middleware)
    if (!req.user) {
        return res.status(401).json((0, utils_1.standardResponse)(false, 'Authentication required', null, { code: 'AUTH_REQUIRED', message: 'Authentication is required' }));
    }
    // Check if user has admin or support role
    if (req.user.role !== 'admin' && req.user.role !== 'support') {
        return res.status(403).json((0, utils_1.standardResponse)(false, 'Access denied', null, { code: 'FORBIDDEN', message: 'Support or admin privileges required' }));
    }
    // User has sufficient privileges, proceed to the next middleware or route handler
    next();
};
exports.isSupportOrAdmin = isSupportOrAdmin;
