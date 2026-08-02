// path: /integrations/n8n/retryManager.js
/**
 * Retry Manager for n8n triggers
 */

import logger from '../../utils/logger.js';
import n8nClient from './n8nClient.js';

async function triggerWithRetries(workflowId, payload, retries = 3, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await n8nClient.triggerWorkflow(workflowId, payload);
    } catch (err) {
      logger.warn('n8n trigger failed, retrying', { workflowId, attempt: i + 1, error: err.message });
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

export default { triggerWithRetries };
