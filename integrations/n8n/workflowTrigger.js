// path: /integrations/n8n/workflowTrigger.js
import n8nClient from './n8nClient.js';
import logger from '../../utils/logger.js';

async function trigger(workflowId, payload) {
  try {
    return await n8nClient.triggerWorkflow(workflowId, payload);
  } catch (err) {
    logger.error('n8n workflow trigger error', { workflowId, error: err.message });
    throw err;
  }
}

export default { trigger };
