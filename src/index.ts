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
import usdcRoutes from './routes/usdcRoutes';
import mpesaRoutes from './routes/mpesaRoutes';
import adminRoutes from './routes/adminRoutes';
import { connect } from './services/database';
import { Verification } from './models/verificationModel';
import { client, africastalking } from './services/auth';
import { standardResponse } from './services/utils';
import { startSchedulers, stopSchedulers } from './services/scheduler';

const app: Application = express();
const PORT = process.env.PORT || 8000;

// Security middlewares
app.use(helmet());

// Define allowed origins
const allowedOrigins: string[] = ['http://localhost:3000', 'https://nexuspayapp-snowy.vercel.app', 'https://app.nexuspayapp.xyz'];

// CORS middleware
const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

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
app.use('/api/usdc', usdcRoutes);
app.use('/api/mpesa', mpesaRoutes);
app.use('/api/admin', adminRoutes);

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

// Database connection and server start
let server: any = null;

connect()
  .then(() => {
    server = app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log("Thirdweb client initialized with secret key:", client.secretKey ? "present" : "missing");
      console.log("Africa's Talking initialized:", africastalking.SMS ? "present" : "missing");
      
      // Start schedulers
      startSchedulers();
    });
  })
  .catch((err: Error) => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1); // Exit with error code
  });

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