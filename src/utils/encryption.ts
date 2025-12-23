import crypto from 'crypto';
import config from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 64;

/**
 * Get encryption key from environment or generate a secure one
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY || config.JWT_SECRET;
  
  if (!key) {
    throw new Error('ENCRYPTION_KEY or JWT_SECRET must be set in environment');
  }
  
  // Derive a 32-byte key from the provided key using PBKDF2
  return crypto.pbkdf2Sync(key, 'stellar-encryption-salt', 100000, 32, 'sha256');
}

/**
 * Encrypt sensitive data (like Stellar secret keys)
 */
export function encryptData(text: string): string {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Combine IV + AuthTag + Encrypted data
    const combined = Buffer.concat([
      iv,
      authTag,
      Buffer.from(encrypted, 'hex')
    ]);
    
    return combined.toString('base64');
  } catch (error) {
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Decrypt sensitive data
 */
export function decryptData(encryptedData: string): string {
  try {
    const key = getEncryptionKey();
    const combined = Buffer.from(encryptedData, 'base64');
    
    // Extract IV, AuthTag, and encrypted data
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if data is encrypted (base64 format with correct length)
 */
export function isEncrypted(data: string): boolean {
  try {
    // Try to decode as base64
    const decoded = Buffer.from(data, 'base64');
    
    // Encrypted data should be at least IV + AuthTag + some encrypted content
    const minLength = IV_LENGTH + AUTH_TAG_LENGTH + 1;
    
    // Check if it's valid base64 and has minimum length
    return decoded.length >= minLength && 
           Buffer.from(decoded.toString('base64'), 'base64').equals(decoded);
  } catch {
    return false;
  }
}

/**
 * Encrypt Stellar secret key if not already encrypted
 */
export function encryptSecretKey(secretKey: string): string {
  // If already encrypted, return as is
  if (isEncrypted(secretKey)) {
    return secretKey;
  }
  
  // Encrypt the secret key
  return encryptData(secretKey);
}

/**
 * Decrypt Stellar secret key
 */
export function decryptSecretKey(encryptedSecretKey: string): string {
  // If not encrypted (legacy data), return as is
  if (!isEncrypted(encryptedSecretKey)) {
    return encryptedSecretKey;
  }
  
  // Decrypt the secret key
  return decryptData(encryptedSecretKey);
}

/**
 * Hash sensitive data for comparison (one-way)
 */
export function hashData(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Generate a secure random token
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

