import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import liquidityRoutes from './routes/liquidityRoutes';
import rampRoutes from './routes/rampRoutes';
import platformWalletRoutes from './routes/platformWalletRoutes';
import authRoutes from './routes/authRoutes';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/liquidity', liquidityRoutes);
app.use('/api/ramp', rampRoutes);
app.use('/api/platform-wallet', platformWalletRoutes);

export default app; 