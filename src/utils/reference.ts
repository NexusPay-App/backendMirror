import { randomBytes } from 'crypto';

/**
 * Generate a unique reference for transactions
 * Format: NP-{timestamp}-{random}
 * Example: NP-20240315123456-ABC123
 */
export function generateReference(): string {
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 14);
    const random = randomBytes(3).toString('hex').toUpperCase();
    return `NP-${timestamp}-${random}`;
} 