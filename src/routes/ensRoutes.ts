// src/routes/ensRoutes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
    getUserENSInfo,
    createUserENSSubdomain,
    updateENSResolverRecords,
    resolveENSSubdomain,
    checkSubdomainAvailability,
    getENSDomainInfo,
    batchCreateENSSubdomains
} from '../controllers/ensController';

const router = Router();

// Public routes
router.get('/resolve/:subdomain', resolveENSSubdomain);
router.get('/check-availability/:subdomainLabel', checkSubdomainAvailability);
router.get('/domain-info', getENSDomainInfo);

// Protected routes (require authentication)
router.use(authenticate); // Apply authentication middleware to all routes below

// User ENS management routes
router.get('/my-ens', getUserENSInfo);
router.post('/create-subdomain', createUserENSSubdomain);
router.put('/update-records', updateENSResolverRecords);

// Admin routes
router.post('/batch-create', batchCreateENSSubdomains);

export default router;
