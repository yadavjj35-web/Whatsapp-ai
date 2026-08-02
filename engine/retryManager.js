// path: /engine/retryManager.js
/**
 * Retry Manager with exponential backoff
 */

import logger from '../utils/logger.js';

async function retry(fn, attempts = 3, baseDelay = 500) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      logger.warn('Retry attempt failed', { attempt: i + 1, error: err.message });
      if (i === attempts - 1) return false;
      await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, i)));
    }
  }
  return false;
}

export default { retry };
