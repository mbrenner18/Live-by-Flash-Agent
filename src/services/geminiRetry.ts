/**
 * Utility for retrying Gemini API calls with exponential backoff.
 * Specifically handles 429 (Resource Exhausted) errors.
 */

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 2000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Check if it's a 429 error
      const isRateLimit = 
        error?.message?.includes("429") || 
        error?.message?.includes("RESOURCE_EXHAUSTED") ||
        error?.status === 429;
        
      if (isRateLimit && attempt < maxRetries) {
        const delay = initialDelay * Math.pow(2, attempt);
        console.warn(`[Gemini] Rate limit hit. Retrying in ${delay}ms... (Attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // If not a rate limit or we've exhausted retries, throw
      throw error;
    }
  }
  
  throw lastError;
}
