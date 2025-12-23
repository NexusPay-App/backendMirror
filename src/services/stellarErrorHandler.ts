import pino from 'pino';
import { redis, isRedisConnected } from '../config/redis';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty'
  }
});

export enum StellarErrorCode {
  NETWORK_ERROR = 'STELLAR_NETWORK_ERROR',
  INSUFFICIENT_BALANCE = 'STELLAR_INSUFFICIENT_BALANCE',
  INVALID_ADDRESS = 'STELLAR_INVALID_ADDRESS',
  TRANSACTION_FAILED = 'STELLAR_TRANSACTION_FAILED',
  TRUSTLINE_ERROR = 'STELLAR_TRUSTLINE_ERROR',
  ACCOUNT_NOT_FOUND = 'STELLAR_ACCOUNT_NOT_FOUND',
  SEQUENCE_ERROR = 'STELLAR_SEQUENCE_ERROR',
  TIMEOUT = 'STELLAR_TIMEOUT',
  RATE_LIMIT = 'STELLAR_RATE_LIMIT',
  UNKNOWN = 'STELLAR_UNKNOWN_ERROR'
}

export interface StellarError {
  code: StellarErrorCode;
  message: string;
  retryable: boolean;
  originalError?: any;
}

/**
 * Parse Stellar SDK errors and convert to friendly error messages
 */
export function parseStellarError(error: any): StellarError {
  const errorMessage = error?.message || error?.toString() || 'Unknown error';
  
  // Network errors
  if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ETIMEDOUT')) {
    return {
      code: StellarErrorCode.NETWORK_ERROR,
      message: 'Failed to connect to Stellar network. Please try again later.',
      retryable: true,
      originalError: error
    };
  }

  // Insufficient balance
  if (errorMessage.includes('op_underfunded') || errorMessage.includes('insufficient balance')) {
    return {
      code: StellarErrorCode.INSUFFICIENT_BALANCE,
      message: 'Insufficient balance to complete this transaction.',
      retryable: false,
      originalError: error
    };
  }

  // Invalid address
  if (errorMessage.includes('invalid') && errorMessage.includes('address')) {
    return {
      code: StellarErrorCode.INVALID_ADDRESS,
      message: 'Invalid Stellar address provided.',
      retryable: false,
      originalError: error
    };
  }

  // Account not found
  if (errorMessage.includes('op_no_destination') || errorMessage.includes('account not found')) {
    return {
      code: StellarErrorCode.ACCOUNT_NOT_FOUND,
      message: 'Destination account does not exist or is not funded.',
      retryable: false,
      originalError: error
    };
  }

  // Trustline errors
  if (errorMessage.includes('op_no_trust') || errorMessage.includes('trustline')) {
    return {
      code: StellarErrorCode.TRUSTLINE_ERROR,
      message: 'Trustline not established for this asset. Please create a trustline first.',
      retryable: false,
      originalError: error
    };
  }

  // Sequence errors (retryable)
  if (errorMessage.includes('tx_bad_seq') || errorMessage.includes('sequence')) {
    return {
      code: StellarErrorCode.SEQUENCE_ERROR,
      message: 'Transaction sequence error. Retrying...',
      retryable: true,
      originalError: error
    };
  }

  // Rate limiting
  if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
    return {
      code: StellarErrorCode.RATE_LIMIT,
      message: 'Rate limit exceeded. Please try again in a few moments.',
      retryable: true,
      originalError: error
    };
  }

  // Timeout
  if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
    return {
      code: StellarErrorCode.TIMEOUT,
      message: 'Transaction timed out. Please try again.',
      retryable: true,
      originalError: error
    };
  }

  // Generic transaction failure
  if (errorMessage.includes('tx_failed')) {
    return {
      code: StellarErrorCode.TRANSACTION_FAILED,
      message: 'Transaction failed. Please check your balance and try again.',
      retryable: false,
      originalError: error
    };
  }

  // Unknown error
  return {
    code: StellarErrorCode.UNKNOWN,
    message: 'An unexpected error occurred. Please try again.',
    retryable: true,
    originalError: error
  };
}

/**
 * Retry logic with exponential backoff
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    onRetry?: (attempt: number, error: any) => void;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    onRetry
  } = options;

  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const stellarError = parseStellarError(error);

      // Don't retry if error is not retryable
      if (!stellarError.retryable) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
      
      logger.warn(`Operation failed (attempt ${attempt + 1}/${maxRetries + 1}): ${stellarError.message}. Retrying in ${delay}ms...`);
      
      if (onRetry) {
        onRetry(attempt + 1, error);
      }

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Circuit breaker for Stellar operations
 */
export class StellarCircuitBreaker {
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private readonly threshold: number = 5,
    private readonly timeout: number = 60000, // 1 minute
    private readonly resetTimeout: number = 30000 // 30 seconds
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === 'open') {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      
      if (timeSinceLastFailure < this.resetTimeout) {
        throw new Error('Circuit breaker is open. Service temporarily unavailable.');
      }
      
      // Move to half-open state
      this.state = 'half-open';
      logger.info('Circuit breaker moving to half-open state');
    }

    try {
      const result = await operation();
      
      // Success - reset circuit breaker
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failureCount = 0;
        logger.info('Circuit breaker closed after successful operation');
      }
      
      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      // Open circuit if threshold reached
      if (this.failureCount >= this.threshold) {
        this.state = 'open';
        logger.error(`Circuit breaker opened after ${this.failureCount} failures`);
      }

      throw error;
    }
  }

  getState(): 'closed' | 'open' | 'half-open' {
    return this.state;
  }

  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.lastFailureTime = 0;
    logger.info('Circuit breaker manually reset');
  }
}

// Export singleton instance
export const stellarCircuitBreaker = new StellarCircuitBreaker();

/**
 * Validate operation before execution
 */
export async function validateStellarOperation(operation: {
  type: 'payment' | 'trustline' | 'account_creation';
  fromAddress?: string;
  toAddress?: string;
  amount?: string;
  asset?: string;
}): Promise<{ valid: boolean; error?: string }> {
  // Validate addresses
  if (operation.fromAddress) {
    try {
      const { Keypair } = await import('stellar-sdk');
      Keypair.fromPublicKey(operation.fromAddress);
    } catch {
      return { valid: false, error: 'Invalid source address' };
    }
  }

  if (operation.toAddress) {
    try {
      const { Keypair } = await import('stellar-sdk');
      Keypair.fromPublicKey(operation.toAddress);
    } catch {
      return { valid: false, error: 'Invalid destination address' };
    }
  }

  // Validate amount
  if (operation.amount) {
    const amount = parseFloat(operation.amount);
    if (isNaN(amount) || amount <= 0) {
      return { valid: false, error: 'Invalid amount' };
    }
  }

  return { valid: true };
}

