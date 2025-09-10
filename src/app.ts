import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import tokenRoutes from './routes/tokenRoutes';
import authRoutes from './routes/authRoutes';
import businessRoutes from './routes/businessRoutes';
import mpesaRoutes from './routes/mpesaRoutes';
import adminRoutes from './routes/adminRoutes';
import transactionRoutes from './routes/transactionRoutes';
import usdcRoutes from './routes/usdcRoutes';
import kplcRoutes from './routes/kplcRoutes';
import ensRoutes from './routes/ensRoutes';
import { virtualCardRoutes } from './virtual-cards';
import { standardResponse } from './services/utils';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// Middleware
app.use(cors({
  origin: true, // Allow all origins for development
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/token', tokenRoutes);
app.use('/api/business', businessRoutes);
app.use('/api/mpesa', mpesaRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/usdc', usdcRoutes);
app.use('/api/kplc', kplcRoutes);
app.use('/api/ens', ensRoutes);
app.use('/api/virtual-cards', virtualCardRoutes);

// ... existing code ...

// 404 Error Handling Middleware
app.use((req, res) => {
  res.status(404).json(standardResponse(
    false,
    `Route ${req.url} not found`,
    null,
    { code: 'ROUTE_NOT_FOUND', message: `The requested endpoint ${req.method} ${req.url} does not exist` }
  ));
});

export default app; 