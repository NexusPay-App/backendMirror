
// import { Request, Response, NextFunction } from 'express';
// import jwt from 'jsonwebtoken';


// declare global {
//     namespace Express {
//       interface Request {
//         user?: any; // Define the type according to what you store in user
//       }
//     }
//   }

// const JWT_SECRET = process.env.JWT_SECRET || 'zero'; // Use environment variable for JWT secret

// export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
//     const authHeader = req.headers['authorization'];
//     const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

//     if (!token) {
//         return res.status(401).json({ message: "No token provided" });
//     }

//     jwt.verify(token, JWT_SECRET, (err, user) => {
//         if (err) {
//             // Provide more specific messages based on the type of error
//             if (err.name === 'JsonWebTokenError') {
//                 return res.status(401).json({ message: "Invalid token" });
//             } else if (err.name === 'TokenExpiredError') {
//                 return res.status(401).json({ message: "Token expired" });
//             } else {
//                 return res.status(403).json({ message: "Unauthorized access" });
//             }
//         }
//         req.user = user;
//         next();
//     });
// };


// src/middleware/authMiddleware.ts
// src/middleware/authMiddleware.ts
// src/middleware/authMiddleware.ts
// src/middleware/authMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/models';
import config from '../config/env';

// Extend Express Request type to include user
declare global {
    namespace Express {
        interface Request {
            user?: any;
        }
    }
}

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
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
        if (!config.JWT_SECRET) {
            console.error("JWT_SECRET is not configured");
            return res.status(500).json({ message: "Server configuration error" });
        }

        // Debug logging
        console.log("JWT Secret:", config.JWT_SECRET);
        console.log("Token:", token);

        // Verify and decode the token
        const decoded = jwt.verify(token, config.JWT_SECRET) as { 
            id: string;
            phoneNumber: string;
            walletAddress: string;
            iat: number;
            exp: number;
        };
        
        // Debug logging
        console.log("Decoded token:", decoded);

        // Find the user in the database using ID
        const user = await User.findById(decoded.id);
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
    } catch (error: any) {
        // Provide specific error messages based on the type of error
        if (error.name === 'JsonWebTokenError') {
            console.error("Invalid token error:", error);
            return res.status(401).json({ message: "Invalid token" });
        } else if (error.name === 'TokenExpiredError') {
            console.error("Token expired error:", error);
            return res.status(401).json({ message: "Token expired" });
        } else {
            console.error("Authentication error:", error);
            return res.status(403).json({ message: "Unauthorized access" });
        }
    }
};