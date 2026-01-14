import axios, { AxiosInstance } from 'axios';
import { logger } from '../config/logger';

type ProofPayload = {
    proofType: string;
    proof?: any;
    publicSignals?: string[];
    verificationKey?: any;
    metadata?: Record<string, any>;
};

class ZkVerifyClient {
    private client: AxiosInstance;
    private enabled: boolean;

    constructor() {
        this.enabled = process.env.ZKVERIFY_ENABLED === 'true';

        const baseURL = process.env.ZKVERIFY_NODE_URL || '';
        const apiKey = process.env.ZKVERIFY_API_KEY || '';
        const network = process.env.ZKVERIFY_NETWORK || 'testnet';
        const timeout = Number(process.env.ZKVERIFY_TIMEOUT_MS || 30000);

        this.client = axios.create({
            baseURL,
            timeout,
            headers: {
                'Content-Type': 'application/json',
                ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
                'X-Network': network,
            },
        });
    }

    isEnabled() {
        return this.enabled;
    }

    async submitProof(payload: ProofPayload) {
        if (!this.enabled) {
            return {
                success: true,
                verificationId: `mock-${Date.now()}`,
                status: 'mock',
            };
        }

        if (!process.env.ZKVERIFY_NODE_URL || !process.env.ZKVERIFY_API_KEY) {
            throw new Error('zkVerify is enabled but node URL or API key is missing');
        }

        try {
            const response = await this.client.post('/v1/proofs/submit', payload);
            return {
                success: true,
                verificationId: response.data?.verificationId,
                txHash: response.data?.txHash,
                status: response.data?.status || 'submitted',
            };
        } catch (error: any) {
            logger.error('zkVerify submitProof failed', {
                error: error?.message,
                proofType: payload.proofType,
            });
            throw new Error(`zkVerify submission failed: ${error?.message || 'unknown error'}`);
        }
    }

    async getStatus(verificationId: string) {
        if (!this.enabled) {
            return { success: true, status: 'mock', verificationId };
        }

        try {
            const response = await this.client.get(`/v1/proofs/status/${verificationId}`);
            return {
                success: true,
                status: response.data?.status,
                verificationId,
            };
        } catch (error: any) {
            logger.error('zkVerify getStatus failed', {
                error: error?.message,
                verificationId,
            });
            throw new Error(`zkVerify status failed: ${error?.message || 'unknown error'}`);
        }
    }
}

export const zkVerifyClient = new ZkVerifyClient();

