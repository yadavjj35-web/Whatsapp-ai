// path: utils/retryWrapper.js
/**
 * retryWrapper
 *
 * Generic retry utility with exponential backoff and jitter.
 *
 * Usage:
 *  await retryWrapper(async () => { return await something(); }, { attempts: 5, baseDelayMs: 200 });
 *
 * Options:
 *  - attempts: number of attempts (default 3)
 *  - baseDelayMs: base delay for exponential backoff (default 300)
 *  - maxDelayMs: maximum delay cap (default 10000)
 *  - factor: exponential factor (default 2)
 *  - jitter: max jitter in ms added/subtracted randomly (default 100)
 *  - retryIf: optional function (err) => boolean indicating whether to retry on this error
 *
 * Behavior:
 *  - Retries on thrown errors where retryIf returns true (or by default retries on any error except fatal ones)
 *  - Throws last error if all attempts exhausted
 */

import logger from './logger.js';

export default async function retryWrapper(fn, options = {}) {
  const {
    attempts = 3,
    baseDelayMs = 300,
    maxDelayMs = 10000,
    factor = 2,
    jitter = 100,
    retryIf = null
  } = options;

  let attempt = 0;
  let lastErr = null;

  while (attempt < attempts) {
    try {
      attempt += 1;
      return await fn();
    } catch (err) {
      lastErr = err;
      // Determine if we should retry
      let shouldRetry = true;
      if (typeof retryIf === 'function') {
        try {
          shouldRetry = !!retryIf(err);
        } catch (e) {
          // if retryIf throws, default to false
          shouldRetry = false;
        }
      }

      if (!shouldRetry || attempt >= attempts) {
        logger.error('retryWrapper giving up', { attempt, attempts, message: err.message });
        throw err;
      }

      // compute exponential backoff with jitter
      const exp = Math.min(baseDelayMs * Math.pow(factor, attempt - 1), maxDelayMs);
      const jitterMs = Math.floor(Math.random() * jitter);
      const delay = Math.max(0, exp + jitterMs);
      logger.warn('retryWrapper retrying after delay', { attempt, attempts, delay, error: err.message });

      await new Promise((resolve) => setTimeout(resolve, delay));
      // continue to next attempt
    }
  }

  // If we exit loop, throw last error
  throw lastErr || new Error('retryWrapper: exhausted attempts');
}
