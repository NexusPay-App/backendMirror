import express, { Application, Request, Response, NextFunction } from 'express';
import cors, { CorsOptions } from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import bodyParser from 'body-parser';

import authRoutes from './routes/authRoutes';
import businessRoutes from './routes/businessRoutes';
import tokenRoutes from './routes/tokenRoutes';
import mpesaRoutes from './routes/mpesaRoutes';
import adminRoutes from './routes/adminRoutes';
import transactionRoutes from './routes/transactionRoutes';
import liquidityRoutes from './routes/liquidityRoutes';
import rampRoutes from './routes/rampRoutes';
import platformWalletRoutes from './routes/platformWalletRoutes';
import { connect } from './services/database';
import { Verification } from './models/verificationModel';
import { client } from './services/auth';
import { SMSService } from './services/smsService';
import config from './config/env';
import { standardResponse } from './services/utils';
import { startSchedulers, stopSchedulers } from './services/scheduler';
import app from './app';

const PORT = process.env.PORT || 8000;

let server: any = null;

// Initialize services and start server
async function startServer() {
    try {
        // Initialize Thirdweb client
        console.log('Thirdweb client initialized with secret key:', client ? 'present' : 'missing');
        
        // Initialize Africa's Talking
        console.log('Africa\'s Talking initialized with API key:', config.AFRICAS_TALKING_API_KEY ? 'present' : 'missing');
        
        // Connect to MongoDB
        await connect();
        
        // Start the server
        server = app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log('Thirdweb client initialized with secret key:', client ? 'present' : 'missing');
            console.log('Africa\'s Talking initialized with API key:', config.AFRICAS_TALKING_API_KEY ? 'present' : 'missing');
            // Log active M-Pesa callback URLs for verification
            console.log('🔗 M-Pesa callbacks in use:', {
                webhookBase: (config as any).MPESA_WEBHOOK_URL,
                b2cResult: (config as any).MPESA_B2C_RESULT_URL,
                b2cTimeout: (config as any).MPESA_B2C_TIMEOUT_URL,
                stkCallback: (config as any).MPESA_STK_CALLBACK_URL
            });
        });
        
        // Start schedulers
        await startSchedulers();
        
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    stopSchedulers();
    if (server) {
        server.close(() => {
            console.log('HTTP server closed');
        });
    }
});

process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    stopSchedulers();
    if (server) {
        server.close(() => {
            console.log('HTTP server closed');
        });
    }
});

// Security middlewares
app.use(helmet());

// CORS configuration
const allowedOrigins: string[] = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
if (allowedOrigins.length === 0) {
    console.warn('⚠️ No ALLOWED_ORIGINS specified in environment variables. Using default origins.');
    allowedOrigins.push('https://nexuspayapp-snowy.vercel.app', 'https://app.nexuspayapp.xyz');
    if (process.env.NODE_ENV === 'development') {
        allowedOrigins.push('http://localhost:3000');
    }
}

// Debug logging for CORS
console.log('🔍 NODE_ENV:', process.env.NODE_ENV);
console.log('🔍 ALLOWED_ORIGINS from env:', process.env.ALLOWED_ORIGINS);
console.log('🔍 Final allowed origins:', allowedOrigins);

// CORS middleware
app.use(cors({
  origin: (origin, callback) => {
    console.log('🔍 Incoming request origin:', origin);
    console.log('🔍 Checking against allowed origins:', allowedOrigins);
    
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) {
      console.log('✅ Origin allowed: no origin (same-origin or mobile app)');
      return callback(null, true);
    }
    
    // Check exact matches first
    if (allowedOrigins.includes(origin)) {
      console.log('✅ Origin allowed (exact match):', origin);
      return callback(null, true);
    }
    
    // In development, also allow local network IPs on port 3000
    if (process.env.NODE_ENV === 'development') {
      const isLocalNetwork = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+):3000$/.test(origin);
      if (isLocalNetwork) {
        console.log('✅ Origin allowed (local network):', origin);
        return callback(null, true);
      }
    }
    
    console.log('❌ Origin rejected:', origin);
    callback(new Error('Not allowed by CORS'));
  },
    credentials: true
}));

// Body parser middlewares
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Compression middleware
app.use(compression());

// HTTP request logger
app.use(morgan('dev'));

// Rate Limiting
const limiter = rateLimit({
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
app.use('/api/auth', authRoutes);
app.use('/api/business', businessRoutes);
app.use('/api/token', tokenRoutes);
app.use('/api/mpesa', mpesaRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/liquidity', liquidityRoutes);
app.use('/api/ramp', rampRoutes);
app.use('/api/platform-wallet', platformWalletRoutes);

// Verification routes
app.post('/api/verifications', async (req: Request, res: Response) => {
  try {
    const { providerId, providerName, phoneNumber, proof, verified } = req.body;
    const verification = new Verification({ providerId, providerName, phoneNumber, proof, verified });
    await verification.save();
    res.status(201).json(standardResponse(true, 'Verification created successfully', verification));
  } catch (error) {
    console.error('Error creating verification:', error);
    res.status(400).json(standardResponse(false, 'Failed to create verification', null, error));
  }
});

app.get('/api/verifications', async (req: Request, res: Response) => {
  try {
    const verifications = await Verification.find();
    res.status(200).json(standardResponse(true, 'Verifications retrieved successfully', verifications));
  } catch (error) {
    console.error('Error retrieving verifications:', error);
    res.status(500).json(standardResponse(false, 'Failed to retrieve verifications', null, error));
  }
});

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json(standardResponse(true, 'Service is healthy', {
    uptime: process.uptime(),
    timestamp: Date.now()
  }));
});


// Add a manual trigger for MPESA retry (for testing)
app.post('/api/internal/retry-transactions', async (req: Request, res: Response) => {
  try {
    // Only allow in development mode
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json(standardResponse(
        false, 
        'This endpoint is only available in development mode',
        null,
        { code: 'DEV_ONLY', message: 'This endpoint is restricted to development environment only' }
      ));
    }
    
    // Import here to avoid circular dependencies
    const { runImmediateRetry } = require('./services/scheduler');
    await runImmediateRetry();
    
    res.status(200).json(standardResponse(
      true,
      'Manual retry operation triggered successfully',
      { timestamp: new Date().toISOString() }
    ));
  } catch (error) {
    console.error('Error triggering manual retry:', error);
    res.status(500).json(standardResponse(false, 'Failed to trigger manual retry', null, error));
  }
});

// 404 Error Handling Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  res.status(404).json(standardResponse(
    false,
    `Route ${req.url} not found`,
    null,
    { code: 'ROUTE_NOT_FOUND', message: `The requested endpoint ${req.method} ${req.url} does not exist` }
  ));
});

// Global Error Handling Middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
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
  } else if (err.name === 'UnauthorizedError' || err.message === 'Not allowed by CORS') {
    statusCode = 401;
    errorCode = 'UNAUTHORIZED';
    errorMessage = 'Authentication required';
  } else if (err.name === 'ForbiddenError') {
    statusCode = 403;
    errorCode = 'FORBIDDEN';
    errorMessage = 'Insufficient permissions';
  }
  
  // Send standardized error response
  res.status(statusCode).json(standardResponse(
    false,
    errorMessage,
    null,
    {
      code: errorCode,
      message: err.message,
      stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
    }
  ));
});

// Start the server after all middleware and routes are defined
startServer();
