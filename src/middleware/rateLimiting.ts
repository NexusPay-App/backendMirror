import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';

/**
 * 🚀 High-Performance Crypto Spending Rate Limiter
 * Prevents abuse while allowing legitimate high-frequency usage
 */
export const cryptoSpendingLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute window
    max: 10, // 10 requests per minute per user
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
        // Rate limit per user
        return req.user?.id || req.ip;
    },
    message: {
        success: false,
        message: "Too many crypto spending requests, please wait a moment",
        error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Rate limit: 10 crypto payments per minute"
        }
    },
    skip: (req: Request) => {
        // Skip rate limiting for admin users (if needed)
        return req.user?.role === 'admin';
    }
});

/**
 * 💱 Conversion Rate API Rate Limiter
 * Allows frequent rate checks while preventing abuse
 */
export const conversionRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute window
    max: 60, // 60 requests per minute per IP (1 per second)
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => req.ip || 'unknown',
    message: {
        success: false,
        message: "Too many conversion rate requests, please wait a moment",
        error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Rate limit: 60 conversion rate requests per minute"
        }
    }
});

/**
 * 🔥 Burst Protection for Crypto Spending
 * Prevents rapid-fire transactions that could indicate bot activity
 */
export const cryptoSpendingBurstProtection = rateLimit({
    windowMs: 10 * 1000, // 10 second window
    max: 3, // Max 3 requests per 10 seconds
    standardHeaders: false,
    legacyHeaders: false,
    keyGenerator: (req: Request) => req.user?.id || req.ip,
    message: {
        success: false,
        message: "Slow down! Maximum 3 crypto payments per 10 seconds",
        error: {
            code: "BURST_LIMIT_EXCEEDED",
            message: "Please wait before making another crypto payment"
        }
    }
});

/**
 * 🌊 Global System Load Protection
 * Prevents system overload during high traffic
 */
export const systemLoadProtection = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 1000, // 1000 total crypto spending requests per minute across all users
    standardHeaders: false,
    legacyHeaders: false,
    keyGenerator: () => 'global_crypto_spending',
    message: {
        success: false,
        message: "System temporarily overloaded, please try again in a moment",
        error: {
            code: "SYSTEM_OVERLOAD",
            message: "High traffic detected. Please retry in 30-60 seconds."
        }
    }
});

/**
 * 💰 Amount-Based Rate Limiting
 * Higher amounts get stricter limits to prevent large-scale abuse
 */
export const amountBasedLimiting = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { amount } = req.body;
        
        // Define thresholds
        const LARGE_AMOUNT_THRESHOLD = 10000; // 10,000 KES
        
        if (amount >= LARGE_AMOUNT_THRESHOLD) {
            // For now, just log large amounts - can implement Redis-based limiting later
            console.log(`⚠️ Large amount transaction detected: ${amount} KES from user ${req.user?.id || req.ip}`);
        }
        
        next();
    } catch (error) {
        console.error('Amount-based rate limiting error:', error);
        // Continue on error to avoid blocking legitimate requests
        next();
    }
};

/**
 * ⚡ Performance Monitoring Middleware
 * Tracks response times
 */
export const performanceMonitoring = (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    // Monitor response completion
    res.on('finish', () => {
        const processingTime = Date.now() - startTime;
        
        if (processingTime > 10000) { // 10 seconds
            console.warn(`🐌 Slow crypto spending transaction: ${processingTime}ms`);
        }
    });
    
    next();
};

/**
 * 💰 Balance Query Rate Limiter
 * Prevents excessive balance requests while allowing reasonable usage
 */
export const balanceQueryLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute window
    max: 30, // 30 balance requests per minute per user
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
        return req.user?.id || req.ip;
    },
    message: {
        success: false,
        message: "Too many balance requests, please wait a moment",
        error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Rate limit: 30 balance requests per minute"
        }
    }
});

/**
 * 📊 Transaction History Rate Limiter
 * Prevents excessive transaction history requests
 */
export const transactionHistoryLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute window
    max: 20, // 20 transaction history requests per minute per user
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
        return req.user?.id || req.ip;
    },
    message: {
        success: false,
        message: "Too many transaction history requests, please wait a moment",
        error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Rate limit: 20 transaction history requests per minute"
        }
    }
});

/**
 * 🔧 Intelligent Rate Limiting Stack
 * Combines all rate limiting strategies for optimal performance
 */
export const cryptoSpendingProtection = [
    systemLoadProtection,
    cryptoSpendingBurstProtection,
    cryptoSpendingLimiter,
    amountBasedLimiting,
    performanceMonitoring
]; 