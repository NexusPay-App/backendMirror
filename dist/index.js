"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const morgan_1 = __importDefault(require("morgan"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const body_parser_1 = __importDefault(require("body-parser"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const businessRoutes_1 = __importDefault(require("./routes/businessRoutes"));
const tokenRoutes_1 = __importDefault(require("./routes/tokenRoutes"));
const usdcRoutes_1 = __importDefault(require("./routes/usdcRoutes"));
const mpesaRoutes_1 = __importDefault(require("./routes/mpesaRoutes"));
const adminRoutes_1 = __importDefault(require("./routes/adminRoutes"));
const database_1 = require("./services/database");
const verificationModel_1 = require("./models/verificationModel");
const auth_1 = require("./services/auth");
const utils_1 = require("./services/utils");
const scheduler_1 = require("./services/scheduler");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 8000;
// Security middlewares
app.use((0, helmet_1.default)());
// Define allowed origins
const allowedOrigins = ['http://localhost:3000', 'https://nexuspayapp-snowy.vercel.app', 'https://app.nexuspayapp.xyz'];
// CORS middleware
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    optionsSuccessStatus: 200,
};
app.use((0, cors_1.default)(corsOptions));
// Body parser middlewares
app.use(body_parser_1.default.json());
app.use(body_parser_1.default.urlencoded({ extended: true }));
// Compression middleware
app.use((0, compression_1.default)());
// HTTP request logger
app.use((0, morgan_1.default)('dev'));
// Rate Limiting
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
        success: false,
        message: 'Too many requests, please try again later.',
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'You have exceeded the rate limit for API requests'
        }
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
app.use(limiter);
// Route middlewares
app.use('/api/auth', authRoutes_1.default);
app.use('/api/business', businessRoutes_1.default);
app.use('/api/token', tokenRoutes_1.default);
app.use('/api/usdc', usdcRoutes_1.default);
app.use('/api/mpesa', mpesaRoutes_1.default);
app.use('/api/admin', adminRoutes_1.default);
// Verification routes
app.post('/api/verifications', async (req, res) => {
    try {
        const { providerId, providerName, phoneNumber, proof, verified } = req.body;
        const verification = new verificationModel_1.Verification({ providerId, providerName, phoneNumber, proof, verified });
        await verification.save();
        res.status(201).json((0, utils_1.standardResponse)(true, 'Verification created successfully', verification));
    }
    catch (error) {
        console.error('Error creating verification:', error);
        res.status(400).json((0, utils_1.standardResponse)(false, 'Failed to create verification', null, error));
    }
});
app.get('/api/verifications', async (req, res) => {
    try {
        const verifications = await verificationModel_1.Verification.find();
        res.status(200).json((0, utils_1.standardResponse)(true, 'Verifications retrieved successfully', verifications));
    }
    catch (error) {
        console.error('Error retrieving verifications:', error);
        res.status(500).json((0, utils_1.standardResponse)(false, 'Failed to retrieve verifications', null, error));
    }
});
// Health check endpoint
app.get('/api/health', (req, res) => {
    res.status(200).json((0, utils_1.standardResponse)(true, 'Service is healthy', {
        uptime: process.uptime(),
        timestamp: Date.now()
    }));
});
// Add a manual trigger for MPESA retry (for testing)
app.post('/api/internal/retry-transactions', async (req, res) => {
    try {
        // Only allow in development mode
        if (process.env.NODE_ENV !== 'development') {
            return res.status(403).json((0, utils_1.standardResponse)(false, 'This endpoint is only available in development mode', null, { code: 'DEV_ONLY', message: 'This endpoint is restricted to development environment only' }));
        }
        // Import here to avoid circular dependencies
        const { runImmediateRetry } = require('./services/scheduler');
        await runImmediateRetry();
        res.status(200).json((0, utils_1.standardResponse)(true, 'Manual retry operation triggered successfully', { timestamp: new Date().toISOString() }));
    }
    catch (error) {
        console.error('Error triggering manual retry:', error);
        res.status(500).json((0, utils_1.standardResponse)(false, 'Failed to trigger manual retry', null, error));
    }
});
// Database connection and server start
let server = null;
(0, database_1.connect)()
    .then(() => {
    server = app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log("Thirdweb client initialized with secret key:", auth_1.client.secretKey ? "present" : "missing");
        console.log("Africa's Talking initialized:", auth_1.africastalking.SMS ? "present" : "missing");
        // Start schedulers
        (0, scheduler_1.startSchedulers)();
    });
})
    .catch((err) => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1); // Exit with error code
});
// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    (0, scheduler_1.stopSchedulers)();
    if (server) {
        server.close(() => {
            console.log('HTTP server closed');
        });
    }
});
process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    (0, scheduler_1.stopSchedulers)();
    if (server) {
        server.close(() => {
            console.log('HTTP server closed');
        });
    }
});
// 404 Error Handling Middleware
app.use((req, res, next) => {
    res.status(404).json((0, utils_1.standardResponse)(false, `Route ${req.url} not found`, null, { code: 'ROUTE_NOT_FOUND', message: `The requested endpoint ${req.method} ${req.url} does not exist` }));
});
// Global Error Handling Middleware
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err);
    // Check if headers already sent
    if (res.headersSent) {
        return next(err);
    }
    // Determine if this is a known error type
    let statusCode = 500;
    let errorCode = 'SERVER_ERROR';
    let errorMessage = 'Internal server error';
    // Handle specific error types
    if (err.name === 'ValidationError') {
        statusCode = 400;
        errorCode = 'VALIDATION_ERROR';
        errorMessage = err.message;
    }
    else if (err.name === 'UnauthorizedError' || err.message === 'Not allowed by CORS') {
        statusCode = 401;
        errorCode = 'UNAUTHORIZED';
        errorMessage = 'Authentication required';
    }
    else if (err.name === 'ForbiddenError') {
        statusCode = 403;
        errorCode = 'FORBIDDEN';
        errorMessage = 'Insufficient permissions';
    }
    // Send standardized error response
    res.status(statusCode).json((0, utils_1.standardResponse)(false, errorMessage, null, {
        code: errorCode,
        message: err.message,
        stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
    }));
});
