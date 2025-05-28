/**
 * Execute a promise with a timeout
 * @param promise The promise to execute
 * @param timeoutMs Timeout in milliseconds
 * @param errorMessage Optional error message if timeout occurs
 * @returns Promise with timeout handling
 */
export function promiseWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 30000,
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  return Promise.race([
    promise,
    timeoutPromise
  ]).then((result) => {
    clearTimeout(timeoutHandle);
    return result;
  }).catch((error) => {
    clearTimeout(timeoutHandle);
    throw error;
  });
}

/**
 * Retry a function with exponential backoff
 * @param fn Function to retry
 * @param maxRetries Maximum number of retries
 * @param initialDelayMs Initial delay between retries in milliseconds
 * @returns Result of the function
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 1000
): Promise<T> {
  let lastError: Error = new Error('Unknown error occurred');
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof Error) {
        lastError = error;
      } else if (typeof error === 'string') {
        lastError = new Error(error);
      } else {
        lastError = new Error('Unknown error occurred');
      }
      
      if (attempt === maxRetries) {
        break; // Max retries reached, will throw error below
      }
      
      // Calculate delay with exponential backoff and jitter
      const delayMs = initialDelayMs * Math.pow(2, attempt) + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw lastError;
}

/**
 * Execute multiple promises with concurrency limit
 * @param tasks Array of functions that return promises
 * @param concurrency Maximum number of promises to execute concurrently
 * @returns Array of results in the same order as the input tasks
 */
export async function throttleConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number = 5
): Promise<(T | Error)[]> {
  const results: (T | Error)[] = new Array(tasks.length);
  let currentIndex = 0;
  
  // Helper function to process the next task
  async function processNext(): Promise<void> {
    const index = currentIndex++;
    
    if (index >= tasks.length) {
      return; // No more tasks
    }
    
    try {
      results[index] = await tasks[index]();
    } catch (error) {
      results[index] = error instanceof Error ? error : new Error(String(error));
    }
    
    // Process next task
    return processNext();
  }
  
  // Start initial batch of tasks
  const workers = Array(Math.min(concurrency, tasks.length))
    .fill(null)
    .map(() => processNext());
  
  // Wait for all workers to complete
  await Promise.all(workers);
  
  return results;
} 