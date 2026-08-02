// path: /integrations/n8n/workflowStatus.js
import n8nClient from './n8nClient.js';

async function status(workflowId) {
  return n8nClient.workflowStatus(workflowId);
}

export default { status };
