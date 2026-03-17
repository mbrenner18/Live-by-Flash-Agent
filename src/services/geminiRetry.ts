/**
 * Utility for retrying Gemini API calls with exponential backoff.
 * Specifically handles 429 (Resource Exhausted) and 503 (Service Unavailable) errors.
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
      
      // Determine if the error is a temporary rate limit or server hiccup
      const status = error?.status || error?.response?.status;
      const message = error?.message?.toUpperCase() || "";
      
      const isRetryable = 
        status === 429 || 
        status === 503 ||
        message.includes("429") || 
        message.includes("RESOURCE_EXHAUSTED") ||
        message.includes("SERVICE_UNAVAILABLE");
        
      if (isRetryable && attempt < maxRetries) {
        // Exponential backoff: 2s, 4s, 8s...
        // Plus random jitter (up to 1000ms) to desynchronize simultaneous retries
        const jitter = Math.random() * 1000;
        const delay = (initialDelay * Math.pow(2, attempt)) + jitter;
        
        console.warn(
          `[Gemini Retry] ${status || 'Error'} hit. Retrying in ${Math.round(delay)}ms... (Attempt ${attempt + 1}/${maxRetries})`
        );
        
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // If it's a 400 (Bad Request) or we've run out of retries, stop immediately
      throw error;
    }
  }
  
  throw lastError;
}
