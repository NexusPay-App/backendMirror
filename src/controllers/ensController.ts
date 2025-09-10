// src/controllers/ensController.ts
import { Request, Response } from 'express';
import { User } from '../models/models';
import { ensService } from '../services/ensService';
import { standardResponse, handleError } from '../services/utils';
import { createErrorResponse } from '../utils/errorCodes';

/**
 * Get user's ENS subdomain information
 */
export const getUserENSInfo = async (req: Request, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json(createErrorResponse('AUTH_REQUIRED', 'Authentication required'));
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json(createErrorResponse('USER_NOT_FOUND', 'User not found'));
        }

        const ensInfo: any = {
            ensSubdomain: user.ensSubdomain,
            ensSubdomainCreated: user.ensSubdomainCreated,
            ensSubdomainTxHash: user.ensSubdomainTxHash,
            walletAddress: user.walletAddress
        };

        // If subdomain exists, get additional resolver records
        if (user.ensSubdomain) {
            try {
                const resolverRecords = await ensService.resolveSubdomain(user.ensSubdomain);
                ensInfo.resolverRecords = resolverRecords;
            } catch (error) {
                console.error('Error fetching resolver records:', error);
            }
        }

        return res.json(standardResponse(
            true,
            'ENS information retrieved successfully',
            ensInfo
        ));

    } catch (error) {
        console.error('Error in getUserENSInfo:', error);
        return handleError(error, res, 'Failed to get ENS information');
    }
};

/**
 * Create ENS subdomain for existing user (if not already created)
 */
export const createUserENSSubdomain = async (req: Request, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json(createErrorResponse('AUTH_REQUIRED', 'Authentication required'));
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json(createErrorResponse('USER_NOT_FOUND', 'User not found'));
        }

        // Check if user already has an ENS subdomain
        if (user.ensSubdomain && user.ensSubdomainCreated) {
            return res.status(409).json(createErrorResponse(
                'ENS_SUBDOMAIN_EXISTS',
                'User already has an ENS subdomain'
            ));
        }

        console.log(`Creating ENS subdomain for existing user: ${user._id}`);

        const ensResult = await ensService.createUserSubdomain({
            email: user.email,
            phoneNumber: user.phoneNumber,
            userId: user._id.toString(),
            walletAddress: user.walletAddress
        });

        if (ensResult.success && ensResult.subdomain) {
            // Update user with ENS subdomain information
            user.ensSubdomain = ensResult.subdomain;
            user.ensSubdomainCreated = true;
            user.ensSubdomainTxHash = ensResult.transactionHash;
            await user.save();

            console.log(`✅ ENS subdomain created for existing user: ${ensResult.subdomain}`);

            return res.json(standardResponse(
                true,
                'ENS subdomain created successfully',
                {
                    ensSubdomain: ensResult.subdomain,
                    transactionHash: ensResult.transactionHash,
                    walletAddress: user.walletAddress
                }
            ));
        } else {
            return res.status(500).json(createErrorResponse(
                'ENS_CREATION_FAILED',
                ensResult.error || 'Failed to create ENS subdomain'
            ));
        }

    } catch (error) {
        console.error('Error in createUserENSSubdomain:', error);
        return handleError(error, res, 'Failed to create ENS subdomain');
    }
};

/**
 * Update ENS resolver records for user's subdomain
 */
export const updateENSResolverRecords = async (req: Request, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json(createErrorResponse('AUTH_REQUIRED', 'Authentication required'));
        }

        const { textRecords, contentHash } = req.body;

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json(createErrorResponse('USER_NOT_FOUND', 'User not found'));
        }

        if (!user.ensSubdomain) {
            return res.status(404).json(createErrorResponse(
                'NO_ENS_SUBDOMAIN',
                'User does not have an ENS subdomain'
            ));
        }

        const records: any = {
            address: user.walletAddress // Always set the address to user's wallet
        };

        if (textRecords && typeof textRecords === 'object') {
            records.textRecords = textRecords;
        }

        if (contentHash) {
            records.contentHash = contentHash;
        }

        const success = await ensService.setResolverRecords(user.ensSubdomain, records);

        if (success) {
            return res.json(standardResponse(
                true,
                'ENS resolver records updated successfully',
                {
                    ensSubdomain: user.ensSubdomain,
                    updatedRecords: records
                }
            ));
        } else {
            return res.status(500).json(createErrorResponse(
                'ENS_UPDATE_FAILED',
                'Failed to update ENS resolver records'
            ));
        }

    } catch (error) {
        console.error('Error in updateENSResolverRecords:', error);
        return handleError(error, res, 'Failed to update ENS resolver records');
    }
};

/**
 * Resolve ENS subdomain to get all records
 */
export const resolveENSSubdomain = async (req: Request, res: Response) => {
    try {
        const { subdomain } = req.params;

        if (!subdomain) {
            return res.status(400).json(createErrorResponse(
                'MISSING_SUBDOMAIN',
                'Subdomain parameter is required'
            ));
        }

        // Validate subdomain format
        if (!subdomain.includes('.') || !subdomain.endsWith('.eth')) {
            return res.status(400).json(createErrorResponse(
                'INVALID_SUBDOMAIN_FORMAT',
                'Invalid ENS subdomain format'
            ));
        }

        const resolverRecords = await ensService.resolveSubdomain(subdomain);

        return res.json(standardResponse(
            true,
            'ENS subdomain resolved successfully',
            {
                subdomain,
                records: resolverRecords
            }
        ));

    } catch (error) {
        console.error('Error in resolveENSSubdomain:', error);
        return handleError(error, res, 'Failed to resolve ENS subdomain');
    }
};

/**
 * Check if a subdomain is available
 */
export const checkSubdomainAvailability = async (req: Request, res: Response) => {
    try {
        const { subdomainLabel } = req.params;
        const parentDomain = process.env.ENS_PARENT_DOMAIN || 'nexuspay.eth';

        if (!subdomainLabel) {
            return res.status(400).json(createErrorResponse(
                'MISSING_SUBDOMAIN_LABEL',
                'Subdomain label parameter is required'
            ));
        }

        // Validate subdomain label format
        if (!/^[a-z0-9-]+$/.test(subdomainLabel)) {
            return res.status(400).json(createErrorResponse(
                'INVALID_SUBDOMAIN_LABEL',
                'Subdomain label can only contain lowercase letters, numbers, and hyphens'
            ));
        }

        const isAvailable = await ensService.isSubdomainAvailable(parentDomain, subdomainLabel);

        return res.json(standardResponse(
            true,
            'Subdomain availability checked',
            {
                subdomainLabel,
                parentDomain,
                isAvailable,
                fullSubdomain: `${subdomainLabel}.${parentDomain}`
            }
        ));

    } catch (error) {
        console.error('Error in checkSubdomainAvailability:', error);
        return handleError(error, res, 'Failed to check subdomain availability');
    }
};

/**
 * Get ENS domain information (for admin use)
 */
export const getENSDomainInfo = async (req: Request, res: Response) => {
    try {
        const parentDomain = process.env.ENS_PARENT_DOMAIN || 'nexuspay.eth';
        const isWrapped = await ensService.isDomainWrapped(parentDomain);

        return res.json(standardResponse(
            true,
            'ENS domain information retrieved',
            {
                parentDomain,
                isWrapped,
                registryAddress: process.env.ENS_REGISTRY_ADDRESS || '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
                nameWrapperAddress: process.env.ENS_NAME_WRAPPER_ADDRESS || '0x0635513f179D50A207757E05759CbD106d7dFcE8',
                resolverAddress: process.env.ENS_RESOLVER_ADDRESS || '0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63'
            }
        ));

    } catch (error) {
        console.error('Error in getENSDomainInfo:', error);
        return handleError(error, res, 'Failed to get ENS domain information');
    }
};

/**
 * Batch create ENS subdomains for multiple users (admin only)
 */
export const batchCreateENSSubdomains = async (req: Request, res: Response) => {
    try {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json(createErrorResponse(
                'ADMIN_REQUIRED',
                'Admin access required'
            ));
        }

        const { userIds } = req.body;

        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json(createErrorResponse(
                'INVALID_USER_IDS',
                'User IDs array is required'
            ));
        }

        const results = [];
        const errors = [];

        for (const userId of userIds) {
            try {
                const user = await User.findById(userId);
                if (!user) {
                    errors.push({ userId, error: 'User not found' });
                    continue;
                }

                if (user.ensSubdomain && user.ensSubdomainCreated) {
                    results.push({
                        userId,
                        status: 'already_exists',
                        ensSubdomain: user.ensSubdomain
                    });
                    continue;
                }

                const ensResult = await ensService.createUserSubdomain({
                    email: user.email,
                    phoneNumber: user.phoneNumber,
                    userId: user._id.toString(),
                    walletAddress: user.walletAddress
                });

                if (ensResult.success && ensResult.subdomain) {
                    user.ensSubdomain = ensResult.subdomain;
                    user.ensSubdomainCreated = true;
                    user.ensSubdomainTxHash = ensResult.transactionHash;
                    await user.save();

                    results.push({
                        userId,
                        status: 'created',
                        ensSubdomain: ensResult.subdomain,
                        transactionHash: ensResult.transactionHash
                    });
                } else {
                    errors.push({
                        userId,
                        error: ensResult.error || 'Failed to create subdomain'
                    });
                }
            } catch (error: any) {
                errors.push({
                    userId,
                    error: error.message || 'Unknown error'
                });
            }
        }

        return res.json(standardResponse(
            true,
            'Batch ENS subdomain creation completed',
            {
                totalProcessed: userIds.length,
                successful: results.length,
                failed: errors.length,
                results,
                errors
            }
        ));

    } catch (error) {
        console.error('Error in batchCreateENSSubdomains:', error);
        return handleError(error, res, 'Failed to batch create ENS subdomains');
    }
};
