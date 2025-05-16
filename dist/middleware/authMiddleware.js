"use strict";
// import { Request, Response, NextFunction } from 'express';
// import jwt from 'jsonwebtoken';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const models_1 = require("../models/models");
const env_1 = __importDefault(require("../config/env"));
const authenticateToken = async (req, res, next) => {
    try {
        // Get the authorization header
        const authHeader = req.headers['authorization'];
        if (!authHeader) {
            return res.status(401).json({ message: "No authorization header provided" });
        }
        // Extract the token from the Bearer scheme
        const token = authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: "No token provided" });
        }
        // Ensure JWT_SECRET is available
        if (!env_1.default.JWT_SECRET) {
            console.error("JWT_SECRET is not configured");
            return res.status(500).json({ message: "Server configuration error" });
        }
        // Debug logging
        console.log("JWT Secret:", env_1.default.JWT_SECRET);
        console.log("Token:", token);
        // Verify and decode the token
        const decoded = jsonwebtoken_1.default.verify(token, env_1.default.JWT_SECRET);
        // Debug logging
        console.log("Decoded token:", decoded);
        // Find the user in the database using ID
        const user = await models_1.User.findById(decoded.id);
        if (!user) {
            console.log("User not found for ID:", decoded.id);
            return res.status(401).json({ message: "User not found" });
        }
        // Debug logging
        console.log("Found user:", {
            id: user._id,
            phoneNumber: user.phoneNumber,
            walletAddress: user.walletAddress
        });
        // Attach the user object to the request
        req.user = user;
        next();
    }
    catch (error) {
        // Provide specific error messages based on the type of error
        if (error.name === 'JsonWebTokenError') {
            console.error("Invalid token error:", error);
            return res.status(401).json({ message: "Invalid token" });
        }
        else if (error.name === 'TokenExpiredError') {
            console.error("Token expired error:", error);
            return res.status(401).json({ message: "Token expired" });
        }
        else {
            console.error("Authentication error:", error);
            return res.status(403).json({ message: "Unauthorized access" });
        }
    }
};
exports.authenticateToken = authenticateToken;
