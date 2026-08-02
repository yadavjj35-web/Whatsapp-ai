// path: /tools/n8nTools.js
/**
 * Lightweight n8n tools wrapper to trigger workflows
 */

import n8nClient from '../integrations/n8n/n8nClient.js';

async function triggerWorkflow(workflowId, payload) {
  return n8nClient.triggerWorkflow(workflowId, payload);
}

async function createFollowUpWorkflow(leadId, sequence) {
  return n8nClient.createFollowUpWorkflow(leadId, sequence);
}

export default { triggerWorkflow, createFollowUpWorkflow };
